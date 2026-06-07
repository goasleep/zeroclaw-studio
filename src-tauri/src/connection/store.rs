//! Persistence for `Connection`s.
//!
//! Stored as JSON via `tauri-plugin-store` so it lives under the OS-standard
//! per-app config dir. Token persistence currently uses the same store
//! (acceptable for Phase 1 since the store is per-user, per-app). Phase 2+
//! moves tokens into the OS keychain.

use crate::connection::Connection;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Store filename — created under the Tauri-managed app data dir.
const STORE_FILE: &str = "connections.json";
const KEY_CONNECTIONS: &str = "connections";
const KEY_ACTIVE: &str = "active";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PersistedState {
    connections: Vec<Connection>,
    active: Option<Uuid>,
}

/// In-memory cache of the connection book, plus the active id. Behind a
/// `RwLock` so the UI thread and background tasks can read concurrently.
#[derive(Debug, Default)]
pub struct ConnectionBook {
    state: RwLock<PersistedState>,
}

pub type SharedConnectionBook = Arc<ConnectionBook>;

impl ConnectionBook {
    pub fn new() -> SharedConnectionBook {
        Arc::new(Self::default())
    }

    /// Load from disk via the Tauri store plugin.
    pub async fn load<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let store = app.store(STORE_FILE).context("open connections store")?;
        let persisted = PersistedState {
            connections: store
                .get(KEY_CONNECTIONS)
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default(),
            active: store
                .get(KEY_ACTIVE)
                .and_then(|v| serde_json::from_value(v).ok()),
        };
        *self.state.write().await = persisted;
        Ok(())
    }

    /// Flush in-memory state to disk.
    pub async fn save<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let store = app.store(STORE_FILE).context("open connections store")?;
        let state = self.state.read().await;
        store.set(
            KEY_CONNECTIONS,
            serde_json::to_value(&state.connections).context("serialize connections")?,
        );
        store.set(
            KEY_ACTIVE,
            serde_json::to_value(state.active).context("serialize active id")?,
        );
        store.save().context("persist connections")?;
        Ok(())
    }

    pub async fn list(&self) -> Vec<Connection> {
        self.state.read().await.connections.clone()
    }

    pub async fn get(&self, id: Uuid) -> Option<Connection> {
        self.state
            .read()
            .await
            .connections
            .iter()
            .find(|c| c.id == id)
            .cloned()
    }

    pub async fn active(&self) -> Option<Connection> {
        let s = self.state.read().await;
        let id = s.active?;
        s.connections.iter().find(|c| c.id == id).cloned()
    }

    pub async fn upsert(&self, conn: Connection) {
        let mut s = self.state.write().await;
        match s.connections.iter().position(|c| c.id == conn.id) {
            Some(i) => s.connections[i] = conn,
            None => s.connections.push(conn),
        }
    }

    pub async fn remove(&self, id: Uuid) {
        let mut s = self.state.write().await;
        s.connections.retain(|c| c.id != id);
        if s.active == Some(id) {
            s.active = None;
        }
    }

    pub async fn set_active(&self, id: Option<Uuid>) -> Result<()> {
        let mut s = self.state.write().await;
        if let Some(id) = id
            && !s.connections.iter().any(|c| c.id == id)
        {
            anyhow::bail!("connection {id} not found");
        }
        s.active = id;
        Ok(())
    }

    /// Update the stored token for a connection (after a successful pairing).
    pub async fn set_token(&self, id: Uuid, token: Option<String>) -> Result<()> {
        let mut s = self.state.write().await;
        let c = s
            .connections
            .iter_mut()
            .find(|c| c.id == id)
            .with_context(|| format!("connection {id} not found"))?;
        c.auth.token = token;
        Ok(())
    }

    /// Update the resolved gateway URL for a connection (used after an SSH
    /// tunnel is established — Connection.url is empty for ssh until then).
    pub async fn set_url(&self, id: Uuid, url: String) -> Result<()> {
        let mut s = self.state.write().await;
        let c = s
            .connections
            .iter_mut()
            .find(|c| c.id == id)
            .with_context(|| format!("connection {id} not found"))?;
        c.url = url;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::Connection;

    #[tokio::test]
    async fn upsert_inserts_then_updates() {
        let book = ConnectionBook::new();
        let mut c = Connection::new_local_attach("a", 42617);
        let id = c.id;

        book.upsert(c.clone()).await;
        assert_eq!(book.list().await.len(), 1);

        c.name = "renamed".into();
        book.upsert(c).await;
        assert_eq!(book.list().await.len(), 1);
        assert_eq!(book.get(id).await.unwrap().name, "renamed");
    }

    #[tokio::test]
    async fn remove_clears_active_if_matches() {
        let book = ConnectionBook::new();
        let c = Connection::new_local_attach("a", 42617);
        let id = c.id;
        book.upsert(c).await;
        book.set_active(Some(id)).await.unwrap();
        book.remove(id).await;
        assert!(book.active().await.is_none());
    }

    #[tokio::test]
    async fn set_active_unknown_id_errs() {
        let book = ConnectionBook::new();
        assert!(book.set_active(Some(Uuid::new_v4())).await.is_err());
    }

    #[tokio::test]
    async fn token_lifecycle() {
        let book = ConnectionBook::new();
        let c = Connection::new_local_attach("a", 42617);
        let id = c.id;
        book.upsert(c).await;
        book.set_token(id, Some("zc_abc".into())).await.unwrap();
        assert_eq!(
            book.get(id).await.unwrap().auth.token.as_deref(),
            Some("zc_abc")
        );
        book.set_token(id, None).await.unwrap();
        assert!(book.get(id).await.unwrap().auth.token.is_none());
    }
}
