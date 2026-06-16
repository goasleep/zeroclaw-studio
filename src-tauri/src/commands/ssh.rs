//! SSH tunnel commands.

use crate::connection::ssh::TunnelRegistry;
use crate::connection::store::SharedConnectionBook;
use tauri::{AppHandle, Runtime, State};
use uuid::Uuid;

#[tauri::command]
#[specta::specta]
pub async fn ssh_open_tunnel<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    tunnels: State<'_, TunnelRegistry>,
    id: Uuid,
) -> Result<String, String> {
    let conn = book
        .get(id)
        .await
        .ok_or_else(|| "connection not found".to_string())?;
    let ssh = conn
        .ssh
        .clone()
        .ok_or_else(|| "connection is not SSH-backed".to_string())?;
    let url = tunnels
        .ensure_tunnel(id, &ssh)
        .await
        .map_err(|e| e.to_string())?;
    // Persist the resolved URL so subsequent calls (and the health poller)
    // can reach the gateway via the local forward.
    book.set_url(id, url.clone())
        .await
        .map_err(|e| e.to_string())?;
    book.save(&app).await.map_err(|e| e.to_string())?;
    Ok(url)
}

#[tauri::command]
#[specta::specta]
pub async fn ssh_close_tunnel(tunnels: State<'_, TunnelRegistry>, id: Uuid) -> Result<(), String> {
    tunnels.close(id).await;
    Ok(())
}
