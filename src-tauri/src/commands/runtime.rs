//! Local-runtime commands: detect binary, start/stop managed process.

use crate::connection::RuntimeSource;
use crate::connection::store::SharedConnectionBook;
use crate::runtime::binary::{self, DetectedBinary};
use crate::runtime::installer::{self, InstallInstructions};
use crate::runtime::supervisor::{LaunchSpec, SharedSupervisor, SupervisorStatus};
use tauri::{AppHandle, Manager, Runtime, State};
use uuid::Uuid;

#[tauri::command]
#[specta::specta]
pub async fn detect_local_binary() -> Result<Option<DetectedBinary>, String> {
    binary::detect().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn install_instructions() -> InstallInstructions {
    installer::instructions()
}

#[tauri::command]
#[specta::specta]
pub async fn runtime_start<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    supervisor: State<'_, SharedSupervisor>,
    id: Uuid,
) -> Result<(), String> {
    let conn = book
        .get(id)
        .await
        .ok_or_else(|| "connection not found".to_string())?;
    // Extract port from URL ("http://127.0.0.1:PORT"). Fall back to default.
    let port = url_port(&conn.url).unwrap_or(crate::connection::discover::DEFAULT_PORT);
    let spec = if matches!(conn.runtime_source, RuntimeSource::BundledInner) {
        let config_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("inner-zeroclaw");
        LaunchSpec::bundled_inner(id, port, config_dir)
    } else {
        let binary_path = conn
            .binary_path
            .clone()
            .ok_or_else(|| "connection has no binary_path".to_string())?;
        LaunchSpec::external_path(id, binary_path, port)
    };
    supervisor
        .start(&app, spec)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn runtime_stop(supervisor: State<'_, SharedSupervisor>) -> Result<(), String> {
    supervisor.stop().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn runtime_status(
    supervisor: State<'_, SharedSupervisor>,
) -> Result<SupervisorStatus, String> {
    Ok(supervisor.status().await)
}

fn url_port(url: &str) -> Option<u16> {
    url::Url::parse(url).ok().and_then(|u| u.port())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn url_port_basic() {
        assert_eq!(url_port("http://127.0.0.1:42617"), Some(42617));
        assert_eq!(url_port("http://example.com"), None);
        assert_eq!(url_port("not a url"), None);
    }
}
