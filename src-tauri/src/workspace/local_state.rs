//! Native persistence for desktop-local workspace state.
//!
//! Gateway sessions remain the source of truth. This store only keeps the
//! desktop shell's local selection, recents, and transcript fallback cache.

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;
use tokio::sync::RwLock;

const STORE_FILE: &str = "workspace-state.json";
const KEY_STATE: &str = "state";
const MAX_RECENT_ROOTS: usize = 8;
const MAX_CACHED_MESSAGES: usize = 200;

#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
pub struct WorkspaceLocalState {
    pub current_root: Option<String>,
    pub recent_roots: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PersistedLocalState {
    current_root: Option<String>,
    recent_roots: Vec<String>,
    selected_sessions: HashMap<String, String>,
    session_workspaces: HashMap<String, String>,
    transcript_cache: HashMap<String, Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct SessionWorkspaceBinding {
    pub session_id: String,
    pub workspace_root: String,
}

#[derive(Debug, Default)]
pub struct LocalStateStore {
    state: RwLock<PersistedLocalState>,
}

pub type SharedLocalStateStore = Arc<LocalStateStore>;

impl LocalStateStore {
    pub fn new() -> SharedLocalStateStore {
        Arc::new(Self::default())
    }

    pub async fn load<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let store = app
            .store(STORE_FILE)
            .context("open workspace state store")?;
        let persisted = store
            .get(KEY_STATE)
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        *self.state.write().await = persisted;
        Ok(())
    }

    pub async fn save<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let store = app
            .store(STORE_FILE)
            .context("open workspace state store")?;
        let state = self.state.read().await;
        store.set(
            KEY_STATE,
            serde_json::to_value(&*state).context("serialize workspace state")?,
        );
        store.save().context("persist workspace state")?;
        Ok(())
    }

    pub async fn snapshot(&self) -> WorkspaceLocalState {
        let state = self.state.read().await;
        WorkspaceLocalState {
            current_root: state.current_root.clone(),
            recent_roots: state.recent_roots.clone(),
        }
    }

    pub async fn remember_root(&self, path: String) -> WorkspaceLocalState {
        let mut state = self.state.write().await;
        state.current_root = Some(path.clone());
        if !state.recent_roots.contains(&path) {
            state.recent_roots.push(path);
        }
        state.recent_roots.truncate(MAX_RECENT_ROOTS);
        WorkspaceLocalState {
            current_root: state.current_root.clone(),
            recent_roots: state.recent_roots.clone(),
        }
    }

    pub async fn import_workspace_state(
        &self,
        current_root: Option<String>,
        recent_roots: Vec<String>,
    ) -> WorkspaceLocalState {
        let mut state = self.state.write().await;
        if state.current_root.is_none() {
            state.current_root = current_root.filter(|path| !path.trim().is_empty());
        }
        let mut merged = Vec::new();
        for path in recent_roots
            .into_iter()
            .filter(|path| !path.trim().is_empty())
            .chain(state.recent_roots.clone())
        {
            if !merged.contains(&path) {
                merged.push(path);
            }
            if merged.len() >= MAX_RECENT_ROOTS {
                break;
            }
        }
        state.recent_roots = merged;
        WorkspaceLocalState {
            current_root: state.current_root.clone(),
            recent_roots: state.recent_roots.clone(),
        }
    }

    pub async fn selected_session(
        &self,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
    ) -> Result<Option<String>> {
        let key = selected_session_key(workspace_root, mode, agent_alias)?;
        let fallback_key = selected_session_key(None, mode, agent_alias)?;
        let state = self.state.read().await;
        Ok(state
            .selected_sessions
            .get(&key)
            .or_else(|| state.selected_sessions.get(&fallback_key))
            .cloned())
    }

    pub async fn set_selected_session(
        &self,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
        session_id: Option<String>,
    ) -> Result<()> {
        let key = selected_session_key(workspace_root, mode, agent_alias)?;
        let mut state = self.state.write().await;
        if let Some(session_id) = session_id.filter(|value| !value.trim().is_empty()) {
            if let Some(workspace_root) = workspace_root.filter(|value| !value.trim().is_empty()) {
                state
                    .session_workspaces
                    .insert(session_id.clone(), workspace_root.to_string());
            }
            state.selected_sessions.insert(key, session_id);
        } else {
            state.selected_sessions.remove(&key);
        }
        Ok(())
    }

    pub async fn assign_session_workspace(
        &self,
        session_id: &str,
        workspace_root: &str,
    ) -> Result<()> {
        let session_id = validated_segment("session id", session_id)?;
        let workspace_root = validated_workspace_root(workspace_root)?;
        self.state
            .write()
            .await
            .session_workspaces
            .insert(session_id.to_string(), workspace_root.to_string());
        Ok(())
    }

    pub async fn session_workspaces(&self) -> Vec<SessionWorkspaceBinding> {
        let state = self.state.read().await;
        let mut bindings = state
            .session_workspaces
            .iter()
            .map(|(session_id, workspace_root)| SessionWorkspaceBinding {
                session_id: session_id.clone(),
                workspace_root: workspace_root.clone(),
            })
            .collect::<Vec<_>>();
        bindings.sort_by(|a, b| a.session_id.cmp(&b.session_id));
        bindings
    }

    pub async fn transcript(
        &self,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
        session_id: &str,
    ) -> Result<Option<Vec<serde_json::Value>>> {
        let key = transcript_key(workspace_root, mode, agent_alias, session_id)?;
        let fallback_key = transcript_key(None, mode, agent_alias, session_id)?;
        let state = self.state.read().await;
        Ok(state
            .transcript_cache
            .get(&key)
            .or_else(|| state.transcript_cache.get(&fallback_key))
            .cloned())
    }

    pub async fn set_transcript(
        &self,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
        session_id: &str,
        mut messages: Vec<serde_json::Value>,
    ) -> Result<()> {
        let key = transcript_key(workspace_root, mode, agent_alias, session_id)?;
        if messages.len() > MAX_CACHED_MESSAGES {
            messages = messages.split_off(messages.len() - MAX_CACHED_MESSAGES);
        }
        let mut state = self.state.write().await;
        if let Some(workspace_root) = workspace_root.filter(|value| !value.trim().is_empty()) {
            state
                .session_workspaces
                .insert(session_id.to_string(), workspace_root.to_string());
        }
        state.transcript_cache.insert(key, messages);
        Ok(())
    }

    pub async fn clear_transcript(
        &self,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
        session_id: &str,
    ) -> Result<()> {
        let key = transcript_key(workspace_root, mode, agent_alias, session_id)?;
        self.state.write().await.transcript_cache.remove(&key);
        Ok(())
    }
}

fn selected_session_key(
    workspace_root: Option<&str>,
    mode: &str,
    agent_alias: &str,
) -> Result<String> {
    let scope = scoped_key(workspace_root, mode, agent_alias)?;
    Ok(format!("selected:{scope}"))
}

fn scoped_key(workspace_root: Option<&str>, mode: &str, agent_alias: &str) -> Result<String> {
    let workspace_root = workspace_root
        .map(validated_workspace_root)
        .transpose()?
        .unwrap_or("");
    let mode = validated_segment("mode", mode)?;
    let agent_alias = validated_segment("agent alias", agent_alias)?;
    serde_json::to_string(&(workspace_root, mode, agent_alias)).context("serialize scope key")
}

fn transcript_key(
    workspace_root: Option<&str>,
    mode: &str,
    agent_alias: &str,
    session_id: &str,
) -> Result<String> {
    let scope = scoped_key(workspace_root, mode, agent_alias)?;
    let session_id = validated_segment("session id", session_id)?;
    Ok(format!("transcript:{scope}:{session_id}"))
}

fn validated_segment<'a>(label: &str, value: &'a str) -> Result<&'a str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        bail!("{label} is required");
    }
    if trimmed.contains(':') {
        bail!("{label} cannot contain ':'");
    }
    Ok(trimmed)
}

fn validated_workspace_root(value: &str) -> Result<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        bail!("workspace root is required");
    }
    Ok(trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn remember_root_preserves_project_order_and_truncates() {
        let store = LocalStateStore::new();

        for index in 0..10 {
            store.remember_root(format!("/repo/{index}")).await;
        }
        store.remember_root("/repo/3".into()).await;

        let snapshot = store.snapshot().await;
        assert_eq!(snapshot.current_root.as_deref(), Some("/repo/3"));
        assert_eq!(
            snapshot.recent_roots.first().map(String::as_str),
            Some("/repo/0")
        );
        assert_eq!(snapshot.recent_roots.len(), MAX_RECENT_ROOTS);
        assert_eq!(
            snapshot
                .recent_roots
                .iter()
                .filter(|path| path.as_str() == "/repo/3")
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn selected_session_sets_and_clears() {
        let store = LocalStateStore::new();

        store
            .set_selected_session(None, "chat", "zeroclaw", Some("session-1".into()))
            .await
            .unwrap();
        assert_eq!(
            store
                .selected_session(None, "chat", "zeroclaw")
                .await
                .unwrap()
                .as_deref(),
            Some("session-1")
        );

        store
            .set_selected_session(None, "chat", "zeroclaw", None)
            .await
            .unwrap();
        assert!(
            store
                .selected_session(None, "chat", "zeroclaw")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn selected_session_is_scoped_to_workspace_and_assigns_session() {
        let store = LocalStateStore::new();

        store
            .set_selected_session(
                Some("/repo/a"),
                "chat",
                "zeroclaw",
                Some("session-a".into()),
            )
            .await
            .unwrap();
        store
            .set_selected_session(
                Some("/repo/b"),
                "chat",
                "zeroclaw",
                Some("session-b".into()),
            )
            .await
            .unwrap();

        assert_eq!(
            store
                .selected_session(Some("/repo/a"), "chat", "zeroclaw")
                .await
                .unwrap()
                .as_deref(),
            Some("session-a")
        );
        assert_eq!(
            store
                .selected_session(Some("/repo/b"), "chat", "zeroclaw")
                .await
                .unwrap()
                .as_deref(),
            Some("session-b")
        );
        assert_eq!(
            store.session_workspaces().await,
            vec![
                SessionWorkspaceBinding {
                    session_id: "session-a".into(),
                    workspace_root: "/repo/a".into(),
                },
                SessionWorkspaceBinding {
                    session_id: "session-b".into(),
                    workspace_root: "/repo/b".into(),
                },
            ]
        );
    }

    #[tokio::test]
    async fn import_workspace_state_preserves_existing_current_root() {
        let store = LocalStateStore::new();
        store.remember_root("/repo/native".into()).await;

        let snapshot = store
            .import_workspace_state(
                Some("/repo/legacy-current".into()),
                vec!["/repo/legacy-a".into(), "/repo/native".into()],
            )
            .await;

        assert_eq!(snapshot.current_root.as_deref(), Some("/repo/native"));
        assert_eq!(
            snapshot.recent_roots,
            vec!["/repo/legacy-a".to_string(), "/repo/native".to_string()]
        );
    }

    #[tokio::test]
    async fn transcript_cache_truncates_and_clears() {
        let store = LocalStateStore::new();
        let messages = (0..250)
            .map(|index| serde_json::json!({ "id": index }))
            .collect();

        store
            .set_transcript(Some("/repo/a"), "chat", "zeroclaw", "session-1", messages)
            .await
            .unwrap();
        let cached = store
            .transcript(Some("/repo/a"), "chat", "zeroclaw", "session-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(cached.len(), MAX_CACHED_MESSAGES);
        assert_eq!(
            cached.first().and_then(|value| value["id"].as_i64()),
            Some(50)
        );

        store
            .clear_transcript(Some("/repo/a"), "chat", "zeroclaw", "session-1")
            .await
            .unwrap();
        assert!(
            store
                .transcript(Some("/repo/a"), "chat", "zeroclaw", "session-1")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn workspace_transcript_falls_back_to_legacy_unscoped_cache() {
        let store = LocalStateStore::new();
        store
            .set_transcript(
                None,
                "chat",
                "zeroclaw",
                "session-1",
                vec![serde_json::json!({ "id": 1 })],
            )
            .await
            .unwrap();

        let cached = store
            .transcript(Some("/repo/a"), "chat", "zeroclaw", "session-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(cached, vec![serde_json::json!({ "id": 1 })]);
    }
}
