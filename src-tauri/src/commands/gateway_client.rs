//! Gateway HTTP client — routes all gateway API requests through Rust
//! `reqwest` so the frontend never relies on WebView fetch.
//!
//! macOS WKWebView can silently block fetch to localhost with a bare
//! "TypeError: Load failed". Using Tauri IPC → reqwest sidesteps the
//! issue and keeps the network layer fully under our control.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

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
    client: tauri::State<'_, reqwest::Client>,
    req: GatewayHttpRequest,
) -> Result<GatewayHttpResponse, GatewayHttpError> {
    let method = match req.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        other => other.parse().unwrap_or(reqwest::Method::GET),
    };

    let mut builder = client.request(method, &req.url);
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
