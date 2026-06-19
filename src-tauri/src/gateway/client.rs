//! Gateway HTTP client.
//!
//! Ported from `apps/tauri/src/gateway_client.rs` (dual MIT/Apache-2.0,
//! see `docs/reuse-attribution.md`). Adapted so the base URL is per-call
//! supplied via `Connection`/`String` rather than baked into a single
//! workspace-wide instance.

use anyhow::{Context, Result};

use super::diagnostics::health_url;

/// Default per-request timeout for callers that build their own client.
const DEFAULT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

pub struct GatewayClient {
    pub(crate) base_url: String,
    pub(crate) token: Option<String>,
    client: reqwest::Client,
}

impl GatewayClient {
    /// Build a client that owns a fresh `reqwest::Client` (with a 10s timeout).
    /// Prefer [`GatewayClient::new_with_client`] when an app-wide shared
    /// connection pool is available, so keep-alive and TLS state are reused.
    pub fn new(base_url: &str, token: Option<&str>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(DEFAULT_TIMEOUT)
            .build()
            .unwrap_or_default();
        Self::new_with_client(base_url, token, client)
    }

    /// Wrap an existing shared `reqwest::Client` (cheap clone — the connection
    /// pool is reference-counted internally). Use this on hot paths so every
    /// request reuses the same keep-alive connections.
    pub fn new_with_client(base_url: &str, token: Option<&str>, client: reqwest::Client) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token: token.map(String::from),
            client,
        }
    }

    pub(crate) fn auth_header(&self) -> Option<String> {
        self.token.as_ref().map(|t| format!("Bearer {t}"))
    }

    pub async fn get_status(&self) -> Result<serde_json::Value> {
        let mut req = self.client.get(format!("{}/api/status", self.base_url));
        if let Some(auth) = self.auth_header() {
            req = req.header("Authorization", auth);
        }
        let resp = req.send().await.context("status request failed")?;
        Ok(resp.json().await?)
    }

    pub async fn get_health(&self) -> Result<bool> {
        let url = health_url(&self.base_url).context("bad health url")?;
        match self.client.get(url).send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    pub async fn requires_pairing(&self) -> Result<bool> {
        let url = health_url(&self.base_url).context("bad health url")?;
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .context("health request failed")?;
        let body: serde_json::Value = resp.json().await?;
        Ok(body["require_pairing"].as_bool().unwrap_or(false))
    }

    /// Request a new pairing code. **Localhost-only admin endpoint** — on
    /// remote connections this will be rejected, in which case the user must
    /// SSH/console into the host and run `zeroclaw pair-code` themselves.
    pub async fn request_new_paircode(&self) -> Result<String> {
        let resp = self
            .client
            .post(format!("{}/admin/paircode/new", self.base_url))
            .send()
            .await
            .context("paircode request failed")?;
        let body: serde_json::Value = resp.json().await?;
        body["pairing_code"]
            .as_str()
            .map(String::from)
            .context("no pairing_code in response")
    }

    pub async fn pair_with_code(&self, code: &str) -> Result<String> {
        let resp = self
            .client
            .post(format!("{}/pair", self.base_url))
            .header("X-Pairing-Code", code)
            .send()
            .await
            .context("pair request failed")?;
        if !resp.status().is_success() {
            anyhow::bail!("pair request returned {}", resp.status());
        }
        let body: serde_json::Value = resp.json().await?;
        body["token"]
            .as_str()
            .map(String::from)
            .context("no token in pair response")
    }

    pub async fn validate_token(&self) -> Result<bool> {
        let mut req = self.client.get(format!("{}/api/status", self.base_url));
        if let Some(auth) = self.auth_header() {
            req = req.header("Authorization", auth);
        }
        match req.send().await {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// Auto-pair: request a new code (localhost-only) and exchange it.
    /// On remote connections this will fail at the paircode step.
    pub async fn auto_pair(&self) -> Result<String> {
        let code = self.request_new_paircode().await?;
        self.pair_with_code(&code).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_trailing_slash() {
        let c = GatewayClient::new("http://127.0.0.1:42617/", None);
        assert_eq!(c.base_url, "http://127.0.0.1:42617");
    }

    #[test]
    fn auth_header_format() {
        let c = GatewayClient::new("http://x", Some("zc_abc"));
        assert_eq!(c.auth_header().unwrap(), "Bearer zc_abc");
    }

    #[tokio::test]
    async fn health_returns_false_for_unreachable_host() {
        let c = GatewayClient::new("http://127.0.0.1:1", None);
        assert!(!c.get_health().await.unwrap());
    }
}
