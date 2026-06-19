use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

use super::session_manager::ChatSessionManager;

const CHAT_FRAME_EVENT: &str = "zeroclaw://chat-frame";
const CHAT_CLOSE_EVENT: &str = "zeroclaw://chat-close";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ChatMode {
    Chat,
    Acp,
}

pub struct ChatConnectOptions {
    pub url: String,
    pub agent_alias: String,
    pub session_id: Option<String>,
    pub token: String,
    pub mode: ChatMode,
    pub workspace_dir: Option<String>,
}

pub async fn open<R: Runtime>(
    app: AppHandle<R>,
    manager: Arc<ChatSessionManager>,
    opts: ChatConnectOptions,
) -> Result<String, String> {
    let session_id = opts
        .session_id
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let ws_url = build_ws_url(
        &opts.url,
        &opts.agent_alias,
        &session_id,
        &opts.token,
        opts.mode,
        opts.workspace_dir.as_deref(),
    )
    .map_err(|e| format!("bad gateway url: {e}"))?;

    let (ws_stream, _) = connect_async(ws_url.to_string())
        .await
        .map_err(|e| format!("websocket connect failed: {e}"))?;

    let (mut write, mut read) = ws_stream.split();
    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let (abort_tx, mut abort_rx) = tokio::sync::oneshot::channel::<()>();

    let session_id_clone = session_id.clone();
    let manager_clone = Arc::clone(&manager);

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
        let _ = manager_clone.remove(&session_id_clone).await;
        let _ = app.emit(
            CHAT_CLOSE_EVENT,
            serde_json::json!({ "session_id": session_id_clone }),
        );
    });

    manager.insert(session_id.clone(), out_tx, abort_tx).await;

    tokio::spawn(async move {
        let _ = outbound_handle.await;
        let _ = inbound_handle.await;
    });

    Ok(session_id)
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

#[cfg(test)]
mod tests {
    use super::{ChatMode, build_ws_url};

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
        .unwrap();
        assert_eq!(url.scheme(), "ws");
        assert_eq!(url.path(), "/ws/chat");
        let query = url.query().unwrap();
        assert!(query.contains("agent=zeroclaw"));
        assert!(query.contains("name=zeroclaw"));
        assert!(query.contains("session_id=sid"));
        assert!(query.contains("token=zc_token"));
    }

    #[test]
    fn build_ws_url_switches_to_wss() {
        let url = build_ws_url(
            "https://gateway.example",
            "a",
            "sid",
            "tok",
            ChatMode::Chat,
            None,
        )
        .unwrap();
        assert_eq!(url.scheme(), "wss");
    }

    #[test]
    fn build_ws_url_adds_acp_mode_and_workspace_dir() {
        let url = build_ws_url(
            "http://127.0.0.1:42617",
            "code",
            "sid",
            "tok",
            ChatMode::Acp,
            Some("/work/project"),
        )
        .unwrap();
        let query = url.query().unwrap();
        assert!(query.contains("chat_mode=acp"));
        assert!(query.contains("workspace_dir=%2Fwork%2Fproject"));
    }
}
