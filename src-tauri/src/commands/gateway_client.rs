//! Gateway HTTP client — routes all gateway API requests through Rust
//! `reqwest` so the frontend never relies on WebView fetch.
//!
//! macOS WKWebView can silently block fetch to localhost with a bare
//! "TypeError: Load failed". Using Tauri IPC → reqwest sidesteps the
//! issue and keeps the network layer fully under our control.

use crate::connection::store::SharedConnectionBook;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Runtime};
use url::Url;

const GATEWAY_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct GatewayHttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct GatewayHttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct GatewayHttpError {
    pub message: String,
}

/// Execute an HTTP request via Rust `reqwest` and return the raw response.
///
/// Reuses the app-wide `reqwest::Client` from managed state so connection
/// pools and TLS sessions persist across calls instead of being rebuilt on
/// every IPC round trip.
#[tauri::command]
#[specta::specta]
pub async fn gateway_request<R: Runtime>(
    _app: AppHandle<R>,
    book: tauri::State<'_, SharedConnectionBook>,
    client: tauri::State<'_, reqwest::Client>,
    req: GatewayHttpRequest,
) -> Result<GatewayHttpResponse, GatewayHttpError> {
    let method = match req.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        other => {
            return Err(GatewayHttpError {
                message: format!("unsupported gateway method: {other}"),
            });
        }
    };

    validate_gateway_url(&book, &req.url).await?;

    let mut builder = client
        .request(method, &req.url)
        .timeout(GATEWAY_REQUEST_TIMEOUT);
    for (k, v) in &req.headers {
        builder = builder.header(k, v);
    }
    if let Some(body) = &req.body {
        builder = builder.body(body.clone());
    }

    let response = builder.send().await.map_err(|e| GatewayHttpError {
        message: format!("request failed: {e}"),
    })?;

    let status = response.status().as_u16();
    let headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .filter_map(|(k, v)| Some((k.as_str().to_string(), v.to_str().ok()?.to_string())))
        .collect();

    let body = response.text().await.map_err(|e| GatewayHttpError {
        message: format!("read body failed: {e}"),
    })?;

    Ok(GatewayHttpResponse {
        status,
        headers,
        body,
    })
}

async fn validate_gateway_url(
    book: &tauri::State<'_, SharedConnectionBook>,
    target: &str,
) -> Result<(), GatewayHttpError> {
    let conn = book.active().await.ok_or_else(|| GatewayHttpError {
        message: "no active connection".to_string(),
    })?;
    if conn.url.trim().is_empty() {
        return Err(GatewayHttpError {
            message: "active connection has no resolved URL".to_string(),
        });
    }

    let base = Url::parse(&conn.url).map_err(|e| GatewayHttpError {
        message: format!("active connection URL is invalid: {e}"),
    })?;
    let target = Url::parse(target).map_err(|e| GatewayHttpError {
        message: format!("gateway request URL is invalid: {e}"),
    })?;

    if !matches!(target.scheme(), "http" | "https") {
        return Err(GatewayHttpError {
            message: "gateway request URL must be http(s)".to_string(),
        });
    }
    if !same_origin(&base, &target) || !path_under_base(&base, &target) {
        return Err(GatewayHttpError {
            message: "gateway request URL must target the active connection".to_string(),
        });
    }
    Ok(())
}

fn same_origin(base: &Url, target: &Url) -> bool {
    base.scheme() == target.scheme()
        && base.host_str() == target.host_str()
        && base.port_or_known_default() == target.port_or_known_default()
}

fn path_under_base(base: &Url, target: &Url) -> bool {
    let base_path = base.path().trim_end_matches('/');
    if base_path.is_empty() {
        return true;
    }
    target.path() == base_path || target.path().starts_with(&format!("{base_path}/"))
}
