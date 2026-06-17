//! Chat WebSocket proxy — routes agent chat through Rust so the frontend
//! never opens a WebSocket from the WebView.
//!
//! macOS WKWebView blocks WebSocket connections to localhost in the same way
//! it blocks fetch, producing "chat socket not open". Using Tauri IPC plus a
//! Rust-side `tokio-tungstenite` client sidesteps the issue.

use std::collections::HashMap;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::RwLock;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

const CHAT_FRAME_EVENT: &str = "zeroclaw://chat-frame";
const CHAT_CLOSE_EVENT: &str = "zeroclaw://chat-close";

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ChatConnectRequest {
    pub url: String,
    pub agent_alias: String,
    pub session_id: Option<String>,
    pub token: String,
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
    let ws_url =
        build_ws_url(&req.url, &req.agent_alias, &session_id, &req.token).map_err(|e| {
            ChatError {
                message: format!("bad gateway url: {e}"),
            }
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

fn build_ws_url(
    base: &str,
    alias: &str,
    session_id: &str,
    token: &str,
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
    Ok(ws_url)
}

#[cfg(test)]
mod tests {
    use super::build_ws_url;

    #[test]
    fn build_ws_url_includes_agent_alias_for_gateway_0_8() {
        let url = build_ws_url("http://127.0.0.1:42617", "zeroclaw", "sid", "zc_token")
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
        let url = build_ws_url("https://example.test:42617", "alice", "sid", "zc_token")
            .expect("valid websocket url");

        assert_eq!(url.scheme(), "wss");
    }
}
