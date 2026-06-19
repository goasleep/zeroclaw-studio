//! Connection CRUD + non-mutating diagnostics commands.

use crate::connection::activator;
use crate::connection::store::SharedConnectionBook;
use crate::connection::{Connection, Transport};
use crate::gateway::diagnostics;
use crate::runtime::supervisor::SharedSupervisor;
use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ConnectionProbeResult {
    pub connection_id: String,
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub status: String,
    pub error: Option<String>,
    pub checked_at: String,
}

#[tauri::command]
#[specta::specta]
pub async fn list_connections(
    book: State<'_, SharedConnectionBook>,
) -> Result<Vec<Connection>, String> {
    Ok(book.list().await)
}

#[tauri::command]
#[specta::specta]
pub async fn get_active_connection(
    book: State<'_, SharedConnectionBook>,
) -> Result<Option<Connection>, String> {
    Ok(book.active().await)
}

#[tauri::command]
#[specta::specta]
pub async fn upsert_connection<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    conn: Connection,
) -> Result<(), String> {
    book.upsert(conn).await;
    book.save(&app).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn remove_connection<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    id: Uuid,
) -> Result<(), String> {
    book.remove(id).await;
    book.save(&app).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_active_connection<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    supervisor: State<'_, SharedSupervisor>,
    id: Option<Uuid>,
) -> Result<(), String> {
    book.set_active(id).await.map_err(|e| e.to_string())?;
    book.save(&app).await.map_err(|e| e.to_string())?;

    // Auto-activate: probe → spawn local if needed → wait healthy → pair.
    // Fire-and-forget; events drive the UI.
    if let Some(id) = id
        && let Some(conn) = book.get(id).await
    {
        let app = app.clone();
        let book = book.inner().clone();
        let supervisor = supervisor.inner().clone();
        tauri::async_runtime::spawn(async move {
            activator::activate(&app, &conn, &book, &supervisor).await;
        });
    }
    Ok(())
}

/// Explicit "re-run activation for the current active connection" command.
/// Exposed so the UI can offer a retry button when activation fails.
#[tauri::command]
#[specta::specta]
pub async fn reactivate<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    supervisor: State<'_, SharedSupervisor>,
) -> Result<(), String> {
    if let Some(conn) = book.active().await {
        let app = app.clone();
        let book = book.inner().clone();
        let supervisor = supervisor.inner().clone();
        tauri::async_runtime::spawn(async move {
            activator::activate(&app, &conn, &book, &supervisor).await;
        });
    }
    Ok(())
}

/// Non-mutating connectivity probe for a saved connection.
///
/// This only checks the connection's current URL. It never starts a managed
/// gateway and never opens an SSH tunnel; activation remains the only path that
/// owns lifecycle side effects.
#[tauri::command]
#[specta::specta]
pub async fn connection_probe(
    book: State<'_, SharedConnectionBook>,
    client: State<'_, reqwest::Client>,
    id: Uuid,
) -> Result<ConnectionProbeResult, String> {
    let Some(conn) = book.get(id).await else {
        return Ok(probe_result(
            id,
            false,
            None,
            "missing",
            Some("connection not found".to_string()),
        ));
    };

    if matches!(conn.transport, Transport::Ssh) && conn.url.trim().is_empty() {
        return Ok(probe_result(
            id,
            false,
            None,
            "tunnel_inactive",
            Some("Tunnel inactive / activate to probe".to_string()),
        ));
    }

    let probe = diagnostics::probe_health(&client, &conn.url, Duration::from_secs(3)).await;
    Ok(probe_result(
        id,
        probe.reachable,
        probe.latency_ms,
        &probe.status,
        probe.error,
    ))
}

fn probe_result(
    id: Uuid,
    reachable: bool,
    latency_ms: Option<u64>,
    status: &str,
    error: Option<String>,
) -> ConnectionProbeResult {
    ConnectionProbeResult {
        connection_id: id.to_string(),
        reachable,
        latency_ms,
        status: status.to_string(),
        error,
        checked_at: checked_at_now(),
    }
}

fn checked_at_now() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    millis.to_string()
}

#[cfg(test)]
mod diagnostics_tests {
    use super::*;

    #[test]
    fn probe_result_serializes_checked_at() {
        let id = Uuid::new_v4();
        let result = probe_result(id, false, None, "bad_url", Some("nope".into()));
        assert_eq!(result.connection_id, id.to_string());
        assert_eq!(result.status, "bad_url");
        assert!(result.checked_at.parse::<u128>().is_ok());
    }
}
