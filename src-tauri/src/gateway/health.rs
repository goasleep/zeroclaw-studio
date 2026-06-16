//! Background health polling for the active connection.
//!
//! Ported from `apps/tauri/src/health.rs` (dual MIT/Apache-2.0, see
//! `docs/reuse-attribution.md`). Tray-icon hooks stripped — workspace
//! emits a Tauri event the frontend subscribes to instead.

use crate::connection::store::SharedConnectionBook;
use crate::gateway::client::GatewayClient;
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// Event payload emitted on every poll cycle so the UI can show the
/// connection status dot in the title bar.
#[derive(Debug, Clone, Serialize)]
pub struct HealthEvent {
    pub connection_id: Option<Uuid>,
    pub url: Option<String>,
    pub healthy: bool,
}

/// Spawn the poller. Polls only the currently-active connection; switching
/// the active connection in the book is picked up automatically next tick.
///
/// `http_client` is the app-wide shared client so every 5s poll reuses the
/// same connection pool instead of building a fresh TLS session each tick.
pub fn spawn_health_poller<R: Runtime>(
    app: AppHandle<R>,
    book: SharedConnectionBook,
    http_client: reqwest::Client,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            let active = book.active().await;
            let event = match active {
                Some(conn) if !conn.url.is_empty() => {
                    let client = GatewayClient::new_with_client(
                        &conn.url,
                        conn.auth.token.as_deref(),
                        http_client.clone(),
                    );
                    HealthEvent {
                        connection_id: Some(conn.id),
                        url: Some(conn.url),
                        healthy: client.get_health().await.unwrap_or(false),
                    }
                }
                _ => HealthEvent {
                    connection_id: None,
                    url: None,
                    healthy: false,
                },
            };
            let _ = app.emit("zeroclaw://health", &event);
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}
