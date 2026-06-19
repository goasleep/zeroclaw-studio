use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

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

    pub async fn insert(
        &self,
        id: String,
        outbound: tokio::sync::mpsc::UnboundedSender<String>,
        abort: tokio::sync::oneshot::Sender<()>,
    ) {
        let mut sessions = self.sessions.write().await;
        sessions.insert(id, ChatSession { outbound, abort });
    }

    pub async fn remove(&self, id: &str) -> Option<tokio::sync::oneshot::Sender<()>> {
        let mut sessions = self.sessions.write().await;
        sessions.remove(id).map(|session| session.abort)
    }

    pub async fn send(&self, id: &str, frame: String) -> Result<(), String> {
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
