//! Commands for Studio-owned task metadata.

use crate::workspace::task_state::{
    SharedTaskStateStore, StudioTask, TaskBackfillSession, TaskPatch,
};
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
#[specta::specta]
pub async fn task_list(
    store: State<'_, SharedTaskStateStore>,
    connection_id: Option<String>,
) -> Result<Vec<StudioTask>, String> {
    if let Some(connection_id) = connection_id {
        store.list(&connection_id).await.map_err(|e| e.to_string())
    } else {
        Ok(store.list_all().await)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn task_upsert<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedTaskStateStore>,
    task: StudioTask,
) -> Result<StudioTask, String> {
    let task = store.upsert(task).await.map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
#[specta::specta]
pub async fn task_patch<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedTaskStateStore>,
    id: String,
    patch: TaskPatch,
) -> Result<StudioTask, String> {
    let task = store.patch(&id, patch).await.map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
#[specta::specta]
pub async fn task_archive<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedTaskStateStore>,
    id: String,
) -> Result<StudioTask, String> {
    let archived_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| format!("{}", duration.as_secs()))
        .unwrap_or_else(|_| "0".to_string());
    let task = store
        .archive(&id, archived_at)
        .await
        .map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
#[specta::specta]
pub async fn task_delete_local<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedTaskStateStore>,
    id: String,
) -> Result<(), String> {
    store.delete_local(&id).await.map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn task_link_session<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedTaskStateStore>,
    id: String,
    session_id: String,
) -> Result<StudioTask, String> {
    let task = store
        .link_session(&id, session_id)
        .await
        .map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
#[specta::specta]
pub async fn task_backfill_sessions<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedTaskStateStore>,
    connection_id: String,
    sessions: Vec<TaskBackfillSession>,
    workspace_bindings: Vec<(String, String)>,
) -> Result<Vec<StudioTask>, String> {
    let tasks = store
        .backfill_sessions(&connection_id, sessions, workspace_bindings)
        .await
        .map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())?;
    Ok(tasks)
}
