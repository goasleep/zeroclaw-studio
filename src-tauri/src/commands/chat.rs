//! Chat commands — thin Tauri IPC boundary over the chat services.

use std::sync::Arc;

use crate::chat::attachments::{self, ChatCapabilities, ChatFileEntry};
use crate::chat::session_manager::ChatSessionManager;
use crate::chat::ws_proxy::{self, ChatConnectOptions, ChatMode};
use crate::connection::Transport;
use crate::connection::store::SharedConnectionBook;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChatConnectRequest {
    pub url: String,
    pub agent_alias: String,
    pub session_id: Option<String>,
    pub token: String,
    pub mode: Option<ChatMode>,
    pub workspace_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ChatSessionInfo {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChatSendRequest {
    pub session_id: String,
    pub frame: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChatCloseRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PrepareChatAttachmentsRequest {
    pub paths: Vec<String>,
    pub connection_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ChatError {
    pub message: String,
}

#[tauri::command]
#[specta::specta]
pub async fn chat_capabilities() -> ChatCapabilities {
    attachments::capabilities()
}

/// Open a WebSocket chat connection to the gateway and proxy all frames
/// through Tauri events (`zeroclaw://chat-frame`).
#[tauri::command]
#[specta::specta]
pub async fn chat_connect<R: Runtime>(
    app: AppHandle<R>,
    manager: tauri::State<'_, Arc<ChatSessionManager>>,
    req: ChatConnectRequest,
) -> Result<ChatSessionInfo, ChatError> {
    let session_id = ws_proxy::open(
        app,
        Arc::clone(&manager),
        ChatConnectOptions {
            url: req.url,
            agent_alias: req.agent_alias,
            session_id: req.session_id,
            token: req.token,
            mode: req.mode.unwrap_or(ChatMode::Chat),
            workspace_dir: req.workspace_dir,
        },
    )
    .await
    .map_err(chat_error)?;

    Ok(ChatSessionInfo { session_id })
}

/// Send a JSON frame to an open chat session.
#[tauri::command]
#[specta::specta]
pub async fn chat_send(
    manager: tauri::State<'_, Arc<ChatSessionManager>>,
    req: ChatSendRequest,
) -> Result<(), ChatError> {
    manager
        .send(&req.session_id, req.frame)
        .await
        .map_err(chat_error)
}

/// Close a chat session.
#[tauri::command]
#[specta::specta]
pub async fn chat_disconnect(
    manager: tauri::State<'_, Arc<ChatSessionManager>>,
    req: ChatCloseRequest,
) -> Result<(), ChatError> {
    if let Some(abort) = manager.remove(&req.session_id).await {
        let _ = abort.send(());
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn prepare_chat_attachments(
    book: tauri::State<'_, SharedConnectionBook>,
    req: PrepareChatAttachmentsRequest,
) -> Result<Vec<ChatFileEntry>, ChatError> {
    let connection_id = req.connection_id.parse().map_err(|e| ChatError {
        message: format!("invalid connection id: {e}"),
    })?;
    let conn = book.get(connection_id).await.ok_or_else(|| ChatError {
        message: format!("connection {connection_id} not found"),
    })?;
    let embed_bytes = !matches!(conn.transport, Transport::Local);
    attachments::prepare_many(&req.paths, embed_bytes).map_err(chat_error)
}

fn chat_error(message: String) -> ChatError {
    ChatError { message }
}
