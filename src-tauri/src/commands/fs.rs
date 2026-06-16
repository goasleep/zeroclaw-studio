//! Workspace file-system commands.

use crate::workspace::fs::{self, DirEntry, WorkspaceState};
use notify::{RecommendedWatcher, Watcher};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Runtime, State};
use tokio::sync::Mutex;

/// Live watcher handle. Stored so a `workspace_watch_stop` can drop it.
#[derive(Default)]
pub struct WatcherHandle {
    inner: Mutex<Option<RecommendedWatcher>>,
}

pub type SharedWatcher = Arc<WatcherHandle>;

#[tauri::command]
#[specta::specta]
pub async fn workspace_open_root(
    state: State<'_, Arc<WorkspaceState>>,
    path: String,
) -> Result<(), String> {
    state.set_root(PathBuf::from(path)).await;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_get_root(
    state: State<'_, Arc<WorkspaceState>>,
) -> Result<Option<String>, String> {
    Ok(state.root().await.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    fs::list_dir(std::path::Path::new(&path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_read_file(path: String) -> Result<String, String> {
    let bytes = fs::read_file(std::path::Path::new(&path))
        .await
        .map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_write_file(path: String, content: String) -> Result<(), String> {
    fs::write_file(std::path::Path::new(&path), content.as_bytes())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_watch_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Arc<WorkspaceState>>,
    watcher: State<'_, SharedWatcher>,
    path: Option<String>,
) -> Result<(), String> {
    let target = match path {
        Some(p) => PathBuf::from(p),
        None => state
            .root()
            .await
            .ok_or_else(|| "no workspace root selected".to_string())?,
    };

    // Stop the previous watcher (drop releases the OS resource).
    let mut guard = watcher.inner.lock().await;
    if let Some(mut w) = guard.take() {
        let _ = w.unwatch(&target);
    }

    let new_watcher = fs::spawn_watcher(&target, app);
    *guard = Some(new_watcher);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_watch_stop(watcher: State<'_, SharedWatcher>) -> Result<(), String> {
    let mut guard = watcher.inner.lock().await;
    guard.take();
    Ok(())
}
