//! Commands for desktop-local state that should live below the web UI.

use crate::workspace::local_state::SharedLocalStateStore;
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
#[specta::specta]
pub async fn chat_local_get_selected_session(
    store: State<'_, SharedLocalStateStore>,
    mode: String,
    agent_alias: String,
) -> Result<Option<String>, String> {
    store
        .selected_session(&mode, &agent_alias)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn chat_local_set_selected_session<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedLocalStateStore>,
    mode: String,
    agent_alias: String,
    session_id: Option<String>,
) -> Result<(), String> {
    store
        .set_selected_session(&mode, &agent_alias, session_id)
        .await
        .map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn chat_local_get_transcript(
    store: State<'_, SharedLocalStateStore>,
    mode: String,
    agent_alias: String,
    session_id: String,
) -> Result<Option<String>, String> {
    let messages = store
        .transcript(&mode, &agent_alias, &session_id)
        .await
        .map_err(|e| e.to_string())?;
    messages
        .map(|messages| serde_json::to_string(&messages).map_err(|e| e.to_string()))
        .transpose()
}

#[tauri::command]
#[specta::specta]
pub async fn chat_local_set_transcript<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedLocalStateStore>,
    mode: String,
    agent_alias: String,
    session_id: String,
    transcript_json: String,
) -> Result<(), String> {
    let messages: Vec<serde_json::Value> =
        serde_json::from_str(&transcript_json).map_err(|e| e.to_string())?;
    store
        .set_transcript(&mode, &agent_alias, &session_id, messages)
        .await
        .map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn chat_local_clear_transcript<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, SharedLocalStateStore>,
    mode: String,
    agent_alias: String,
    session_id: String,
) -> Result<(), String> {
    store
        .clear_transcript(&mode, &agent_alias, &session_id)
        .await
        .map_err(|e| e.to_string())?;
    store.save(&app).await.map_err(|e| e.to_string())
}
