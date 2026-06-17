//! Chat WebSocket proxy — routes agent chat through Rust so the frontend
//! never opens a WebSocket from the WebView.
//!
//! macOS WKWebView blocks WebSocket connections to localhost in the same way
//! it blocks fetch, producing "chat socket not open". Using Tauri IPC plus a
//! Rust-side `tokio-tungstenite` client sidesteps the issue.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::connection::Transport;
use crate::connection::store::SharedConnectionBook;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::RwLock;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

const CHAT_FRAME_EVENT: &str = "zeroclaw://chat-frame";
const CHAT_CLOSE_EVENT: &str = "zeroclaw://chat-close";
const MAX_ATTACHMENT_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ChatMode {
    Chat,
    Acp,
}

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
pub struct ChatFileEntry {
    pub path: Option<String>,
    pub data_b64: Option<String>,
    pub filename: String,
    pub mime_type: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ChatError {
    pub message: String,
}

struct ChatSession {
    outbound: tokio::sync::mpsc::UnboundedSender<String>,
    #[allow(dead_code)]
    abort: tokio::sync::oneshot::Sender<()>,
}

#[derive(Default)]
pub struct ChatSessionManager {
    sessions: RwLock<HashMap<String, ChatSession>>,
}

impl ChatSessionManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    async fn insert(
        &self,
        id: String,
        outbound: tokio::sync::mpsc::UnboundedSender<String>,
        abort: tokio::sync::oneshot::Sender<()>,
    ) {
        let mut sessions = self.sessions.write().await;
        sessions.insert(id, ChatSession { outbound, abort });
    }

    async fn remove(&self, id: &str) -> Option<ChatSession> {
        let mut sessions = self.sessions.write().await;
        sessions.remove(id)
    }

    async fn send(&self, id: &str, frame: String) -> Result<(), String> {
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(id)
            .ok_or_else(|| format!("chat session {id} not found"))?;
        session
            .outbound
            .send(frame)
            .map_err(|_| format!("chat session {id} outbound closed"))
    }
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
    let session_id = req.session_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let ws_url = build_ws_url(
        &req.url,
        &req.agent_alias,
        &session_id,
        &req.token,
        req.mode.unwrap_or(ChatMode::Chat),
        req.workspace_dir.as_deref(),
    )
    .map_err(|e| ChatError {
        message: format!("bad gateway url: {e}"),
    })?;

    let (ws_stream, _) = connect_async(ws_url.to_string())
        .await
        .map_err(|e| ChatError {
            message: format!("websocket connect failed: {e}"),
        })?;

    let (mut write, mut read) = ws_stream.split();
    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let (abort_tx, mut abort_rx) = tokio::sync::oneshot::channel::<()>();

    let session_id_clone = session_id.clone();
    let manager_clone = Arc::clone(&manager);

    // Forward outbound frames (frontend -> gateway).
    let outbound_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut abort_rx => break,
                maybe_frame = out_rx.recv() => {
                    match maybe_frame {
                        Some(frame) => {
                            if write.send(Message::Text(frame.into())).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
                }
            }
        }
        let _ = write.close().await;
    });

    let app_for_inbound = app.clone();

    // Forward inbound frames (gateway -> frontend via Tauri event).
    let inbound_handle = tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            let payload = match msg {
                Ok(Message::Text(t)) => Some(t.to_string()),
                Ok(Message::Binary(b)) => String::from_utf8(b.to_vec()).ok(),
                Ok(Message::Close(_)) | Err(_) => None,
                _ => None,
            };
            if let Some(text) = payload {
                let _ = app_for_inbound.emit(
                    CHAT_FRAME_EVENT,
                    serde_json::json!({
                        "session_id": session_id_clone,
                        "frame": text,
                    }),
                );
            } else {
                break;
            }
        }
        // Remove session on close/error and notify the frontend.
        let _ = manager_clone.remove(&session_id_clone).await;
        let _ = app.emit(
            CHAT_CLOSE_EVENT,
            serde_json::json!({ "session_id": session_id_clone }),
        );
    });

    manager.insert(session_id.clone(), out_tx, abort_tx).await;

    // Keep handles alive indirectly: the manager holds the abort sender and
    // outbound channel, so the tasks keep running until chat_disconnect.
    // We deliberately detach them; dropping the JoinHandle does not abort.
    tokio::spawn(async move {
        let _ = outbound_handle.await;
        let _ = inbound_handle.await;
    });

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
        .map_err(|e| ChatError { message: e })
}

/// Close a chat session.
#[tauri::command]
#[specta::specta]
pub async fn chat_disconnect(
    manager: tauri::State<'_, Arc<ChatSessionManager>>,
    req: ChatCloseRequest,
) -> Result<(), ChatError> {
    if let Some(session) = manager.remove(&req.session_id).await {
        let _ = session.abort.send(());
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

    req.paths
        .iter()
        .map(|raw| prepare_one_attachment(raw, embed_bytes))
        .collect()
}

fn build_ws_url(
    base: &str,
    alias: &str,
    session_id: &str,
    token: &str,
    mode: ChatMode,
    workspace_dir: Option<&str>,
) -> Result<url::Url, url::ParseError> {
    let base_url = url::Url::parse(base)?;
    let scheme = if base_url.scheme() == "https" {
        "wss"
    } else {
        "ws"
    };
    let mut ws_url = base_url.clone();
    ws_url
        .set_scheme(scheme)
        .map_err(|_| url::ParseError::SetHostOnCannotBeABaseUrl)?;
    ws_url.set_path("/ws/chat");
    ws_url
        .query_pairs_mut()
        .append_pair("session_id", session_id)
        .append_pair("agent", alias)
        .append_pair("name", alias)
        .append_pair("token", token);
    if matches!(mode, ChatMode::Acp) {
        ws_url.query_pairs_mut().append_pair("chat_mode", "acp");
    }
    if let Some(dir) = workspace_dir.filter(|s| !s.trim().is_empty()) {
        ws_url.query_pairs_mut().append_pair("workspace_dir", dir);
    }
    Ok(ws_url)
}

fn prepare_one_attachment(raw: &str, embed_bytes: bool) -> Result<ChatFileEntry, ChatError> {
    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err(ChatError {
            message: format!("attachment path must be absolute: {}", path.display()),
        });
    }
    let meta = std::fs::metadata(&path).map_err(|e| ChatError {
        message: format!("cannot access {}: {e}", path.display()),
    })?;
    if !meta.is_file() {
        return Err(ChatError {
            message: format!("not a regular file: {}", path.display()),
        });
    }
    if meta.len() > MAX_ATTACHMENT_BYTES {
        return Err(ChatError {
            message: format!("file too large: {} (limit 10 MB)", format_size(meta.len())),
        });
    }
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "upload".to_string());
    let mime_type = mime_from_path(&path);
    if embed_bytes {
        let bytes = std::fs::read(&path).map_err(|e| ChatError {
            message: format!("cannot read {}: {e}", path.display()),
        })?;
        Ok(ChatFileEntry {
            path: None,
            data_b64: Some(base64_encode(&bytes)),
            filename,
            mime_type,
            source: "file".to_string(),
        })
    } else {
        Ok(ChatFileEntry {
            path: Some(path.to_string_lossy().to_string()),
            data_b64: None,
            filename,
            mime_type,
            source: "file".to_string(),
        })
    }
}

fn mime_from_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "json" => "application/json",
        "csv" => "text/csv",
        "md" | "markdown" => "text/markdown",
        "txt" | "log" | "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "toml" | "yaml" | "yml"
        | "html" | "css" => "text/plain",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{ChatMode, base64_encode, build_ws_url};

    #[test]
    fn build_ws_url_includes_agent_alias_for_gateway_0_8() {
        let url = build_ws_url(
            "http://127.0.0.1:42617",
            "zeroclaw",
            "sid",
            "zc_token",
            ChatMode::Chat,
            None,
        )
        .expect("valid websocket url");

        assert_eq!(url.scheme(), "ws");
        assert_eq!(url.path(), "/ws/chat");

        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs.get("session_id").map(String::as_str), Some("sid"));
        assert_eq!(pairs.get("agent").map(String::as_str), Some("zeroclaw"));
        assert_eq!(pairs.get("name").map(String::as_str), Some("zeroclaw"));
        assert_eq!(pairs.get("token").map(String::as_str), Some("zc_token"));
    }

    #[test]
    fn build_ws_url_uses_wss_for_https_gateways() {
        let url = build_ws_url(
            "https://example.test:42617",
            "alice",
            "sid",
            "zc_token",
            ChatMode::Chat,
            None,
        )
        .expect("valid websocket url");

        assert_eq!(url.scheme(), "wss");
    }

    #[test]
    fn build_ws_url_includes_acp_mode_and_workspace_dir() {
        let url = build_ws_url(
            "http://127.0.0.1:42617",
            "coder",
            "sid",
            "zc_token",
            ChatMode::Acp,
            Some("/tmp/work"),
        )
        .expect("valid websocket url");
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs.get("chat_mode").map(String::as_str), Some("acp"));
        assert_eq!(
            pairs.get("workspace_dir").map(String::as_str),
            Some("/tmp/work")
        );
    }

    #[test]
    fn base64_encoder_handles_padding() {
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
    }
}
