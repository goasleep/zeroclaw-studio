//! Probe well-known local gateway endpoints to surface "looks like you
//! already have a zeroclaw running" suggestions.
//!
//! This is informational only — we never auto-connect. The user picks.

use crate::gateway::client::GatewayClient;
use serde::Serialize;

/// Default gateway port (matches `apps/tauri` and the `zeroclaw service` default).
pub const DEFAULT_PORT: u16 = 42617;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DiscoveredLocal {
    pub url: String,
    pub healthy: bool,
    pub require_pairing: bool,
}

/// Probe `127.0.0.1:<port>` for a healthy gateway. Returns `None` if nothing
/// answers within the client's default timeout.
pub async fn probe_local(port: u16) -> Option<DiscoveredLocal> {
    let url = format!("http://127.0.0.1:{port}");
    let client = GatewayClient::new(&url, None);

    let healthy = client.get_health().await.unwrap_or(false);
    if !healthy {
        return None;
    }

    let require_pairing = client.requires_pairing().await.unwrap_or(false);
    Some(DiscoveredLocal {
        url,
        healthy,
        require_pairing,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn probe_returns_none_for_dead_port() {
        // Port 1 is reserved/never listening.
        assert!(probe_local(1).await.is_none());
    }
}
