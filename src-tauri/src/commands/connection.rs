//! Connection CRUD + non-mutating diagnostics commands.

use crate::connection::activator;
use crate::connection::store::SharedConnectionBook;
use crate::connection::{Connection, Transport};
use crate::runtime::supervisor::SharedSupervisor;
use serde::Serialize;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
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

    let url = match health_url(&conn.url) {
        Ok(url) => url,
        Err(e) => {
            return Ok(probe_result(
                id,
                false,
                None,
                "bad_url",
                Some(e.to_string()),
            ));
        }
    };

    let started = Instant::now();
    let request = client.get(url).timeout(Duration::from_secs(3));
    match request.send().await {
        Ok(resp) => {
            let status_code = resp.status();
            let latency_ms = started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
            if status_code.is_success() {
                Ok(probe_result(id, true, Some(latency_ms), "ok", None))
            } else {
                Ok(probe_result(
                    id,
                    false,
                    Some(latency_ms),
                    &format!("http_{}", status_code.as_u16()),
                    Some(format!("health returned HTTP {status_code}")),
                ))
            }
        }
        Err(e) => {
            let latency_ms = started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
            let status = classify_probe_error(&e);
            Ok(probe_result(
                id,
                false,
                Some(latency_ms),
                status,
                Some(e.to_string()),
            ))
        }
    }
}

fn health_url(base: &str) -> Result<url::Url, url::ParseError> {
    let mut url = url::Url::parse(base)?;
    url.set_path("/health");
    url.set_query(None);
    Ok(url)
}

fn classify_probe_error(err: &reqwest::Error) -> &'static str {
    if err.is_timeout() {
        "timeout"
    } else if err.is_connect() {
        "unreachable"
    } else {
        "error"
    }
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
    fn health_url_rewrites_path_and_query() {
        let url = health_url("http://127.0.0.1:42617/api/status?x=1").unwrap();
        assert_eq!(url.as_str(), "http://127.0.0.1:42617/health");
    }

    #[test]
    fn probe_result_serializes_checked_at() {
        let id = Uuid::new_v4();
        let result = probe_result(id, false, None, "bad_url", Some("nope".into()));
        assert_eq!(result.connection_id, id.to_string());
        assert_eq!(result.status, "bad_url");
        assert!(result.checked_at.parse::<u128>().is_ok());
    }
}
