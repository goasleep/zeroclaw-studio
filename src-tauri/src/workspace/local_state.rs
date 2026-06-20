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

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct WorkspaceLocalState {
    pub current_root: Option<String>,
    pub recent_roots: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PersistedLocalState {
    #[serde(default)]
    current_root: Option<String>,
    #[serde(default)]
    recent_roots: Vec<String>,
    #[serde(default)]
    workspaces_by_connection: HashMap<String, WorkspaceLocalState>,
    #[serde(default)]
    selected_sessions: HashMap<String, String>,
    #[serde(default)]
    session_workspaces: HashMap<String, String>,
    #[serde(default)]
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

    pub async fn snapshot(&self, connection_id: &str) -> Result<WorkspaceLocalState> {
        let connection_id = validated_segment("connection id", connection_id)?.to_string();
        let mut state = self.state.write().await;
        migrate_legacy_workspace_state(&mut state, &connection_id)?;
        Ok(state
            .workspaces_by_connection
            .get(&connection_id)
            .cloned()
            .unwrap_or_default())
    }

    pub async fn remember_root(
        &self,
        connection_id: &str,
        path: String,
    ) -> Result<WorkspaceLocalState> {
        let connection_id = validated_segment("connection id", connection_id)?.to_string();
        let mut state = self.state.write().await;
        let workspace = state
            .workspaces_by_connection
            .entry(connection_id)
            .or_default();
        workspace.current_root = Some(path.clone());
        if !workspace.recent_roots.contains(&path) {
            workspace.recent_roots.push(path);
        }
        workspace.recent_roots.truncate(MAX_RECENT_ROOTS);
        Ok(workspace.clone())
    }

    pub async fn import_workspace_state(
        &self,
        connection_id: &str,
        current_root: Option<String>,
        recent_roots: Vec<String>,
    ) -> Result<WorkspaceLocalState> {
        let connection_id = validated_segment("connection id", connection_id)?.to_string();
        let mut state = self.state.write().await;
        let workspace = state
            .workspaces_by_connection
            .entry(connection_id)
            .or_default();
        if workspace.current_root.is_none() {
            workspace.current_root = current_root.filter(|path| !path.trim().is_empty());
        }
        let mut merged = Vec::new();
        for path in recent_roots
            .into_iter()
            .filter(|path| !path.trim().is_empty())
            .chain(workspace.recent_roots.clone())
        {
            if !merged.contains(&path) {
                merged.push(path);
            }
            if merged.len() >= MAX_RECENT_ROOTS {
                break;
            }
        }
        workspace.recent_roots = merged;
        Ok(workspace.clone())
    }

    pub async fn selected_session(
        &self,
        connection_id: &str,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
    ) -> Result<Option<String>> {
        let key = selected_session_key(connection_id, workspace_root, mode, agent_alias)?;
        let state = self.state.read().await;
        Ok(state.selected_sessions.get(&key).cloned())
    }

    pub async fn set_selected_session(
        &self,
        connection_id: &str,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
        session_id: Option<String>,
    ) -> Result<()> {
        let key = selected_session_key(connection_id, workspace_root, mode, agent_alias)?;
        let mut state = self.state.write().await;
        if let Some(session_id) = session_id.filter(|value| !value.trim().is_empty()) {
            if let Some(workspace_root) = workspace_root.filter(|value| !value.trim().is_empty()) {
                state.session_workspaces.insert(
                    session_workspace_key(connection_id, &session_id)?,
                    workspace_root.to_string(),
                );
            }
            state.selected_sessions.insert(key, session_id);
        } else {
            state.selected_sessions.remove(&key);
        }
        Ok(())
    }

    pub async fn assign_session_workspace(
        &self,
        connection_id: &str,
        session_id: &str,
        workspace_root: &str,
    ) -> Result<()> {
        let key = session_workspace_key(connection_id, session_id)?;
        let workspace_root = validated_workspace_root(workspace_root)?;
        self.state
            .write()
            .await
            .session_workspaces
            .insert(key, workspace_root.to_string());
        Ok(())
    }

    pub async fn session_workspaces(
        &self,
        connection_id: &str,
    ) -> Result<Vec<SessionWorkspaceBinding>> {
        let connection_id = validated_segment("connection id", connection_id)?;
        let prefix = format!("{connection_id}:");
        let state = self.state.read().await;
        let mut bindings = state
            .session_workspaces
            .iter()
            .filter_map(|(key, workspace_root)| {
                let session_id = key.strip_prefix(&prefix)?;
                Some(SessionWorkspaceBinding {
                    session_id: session_id.to_string(),
                    workspace_root: workspace_root.clone(),
                })
            })
            .collect::<Vec<_>>();
        bindings.sort_by(|a, b| a.session_id.cmp(&b.session_id));
        Ok(bindings)
    }

    pub async fn transcript(
        &self,
        connection_id: &str,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
        session_id: &str,
    ) -> Result<Option<Vec<serde_json::Value>>> {
        let key = transcript_key(connection_id, workspace_root, mode, agent_alias, session_id)?;
        let state = self.state.read().await;
        Ok(state.transcript_cache.get(&key).cloned())
    }

    pub async fn set_transcript(
        &self,
        connection_id: &str,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
        session_id: &str,
        mut messages: Vec<serde_json::Value>,
    ) -> Result<()> {
        let key = transcript_key(connection_id, workspace_root, mode, agent_alias, session_id)?;
        if messages.len() > MAX_CACHED_MESSAGES {
            messages = messages.split_off(messages.len() - MAX_CACHED_MESSAGES);
        }
        let mut state = self.state.write().await;
        if let Some(workspace_root) = workspace_root.filter(|value| !value.trim().is_empty()) {
            state.session_workspaces.insert(
                session_workspace_key(connection_id, session_id)?,
                workspace_root.to_string(),
            );
        }
        state.transcript_cache.insert(key, messages);
        Ok(())
    }

    pub async fn clear_transcript(
        &self,
        connection_id: &str,
        workspace_root: Option<&str>,
        mode: &str,
        agent_alias: &str,
        session_id: &str,
    ) -> Result<()> {
        let key = transcript_key(connection_id, workspace_root, mode, agent_alias, session_id)?;
        self.state.write().await.transcript_cache.remove(&key);
        Ok(())
    }
}

fn migrate_legacy_workspace_state(
    state: &mut PersistedLocalState,
    connection_id: &str,
) -> Result<()> {
    if !state.workspaces_by_connection.contains_key(connection_id)
        && (state.current_root.is_some() || !state.recent_roots.is_empty())
    {
        state.workspaces_by_connection.insert(
            connection_id.to_string(),
            WorkspaceLocalState {
                current_root: state.current_root.take(),
                recent_roots: state
                    .recent_roots
                    .drain(..)
                    .take(MAX_RECENT_ROOTS)
                    .collect(),
            },
        );
    } else {
        state.current_root = None;
        state.recent_roots.clear();
    }

    migrate_legacy_selected_sessions(state, connection_id)?;
    migrate_legacy_session_workspaces(state, connection_id)?;
    migrate_legacy_transcripts(state, connection_id)?;
    Ok(())
}

fn migrate_legacy_selected_sessions(
    state: &mut PersistedLocalState,
    connection_id: &str,
) -> Result<()> {
    let keys = state.selected_sessions.keys().cloned().collect::<Vec<_>>();
    for key in keys {
        let Some(scope) = key.strip_prefix("selected:") else {
            continue;
        };
        let Ok((workspace_root, mode, agent_alias)) =
            serde_json::from_str::<(String, String, String)>(scope)
        else {
            continue;
        };
        let value = state.selected_sessions.remove(&key).unwrap_or_default();
        let workspace_root = if workspace_root.is_empty() {
            None
        } else {
            Some(workspace_root.as_str())
        };
        let new_key = selected_session_key(connection_id, workspace_root, &mode, &agent_alias)?;
        state.selected_sessions.entry(new_key).or_insert(value);
    }
    Ok(())
}

fn migrate_legacy_session_workspaces(
    state: &mut PersistedLocalState,
    connection_id: &str,
) -> Result<()> {
    let keys = state.session_workspaces.keys().cloned().collect::<Vec<_>>();
    for key in keys {
        if key.contains(':') {
            continue;
        }
        let Some(value) = state.session_workspaces.remove(&key) else {
            continue;
        };
        let new_key = session_workspace_key(connection_id, &key)?;
        state.session_workspaces.entry(new_key).or_insert(value);
    }
    Ok(())
}

fn migrate_legacy_transcripts(state: &mut PersistedLocalState, connection_id: &str) -> Result<()> {
    let keys = state.transcript_cache.keys().cloned().collect::<Vec<_>>();
    for key in keys {
        let Some(rest) = key.strip_prefix("transcript:") else {
            continue;
        };
        let Some((scope, session_id)) = rest.rsplit_once(':') else {
            continue;
        };
        let Ok((workspace_root, mode, agent_alias)) =
            serde_json::from_str::<(String, String, String)>(scope)
        else {
            continue;
        };
        let Some(value) = state.transcript_cache.remove(&key) else {
            continue;
        };
        let workspace_root = if workspace_root.is_empty() {
            None
        } else {
            Some(workspace_root.as_str())
        };
        let new_key = transcript_key(
            connection_id,
            workspace_root,
            &mode,
            &agent_alias,
            session_id,
        )?;
        state.transcript_cache.entry(new_key).or_insert(value);
    }
    Ok(())
}

fn selected_session_key(
    connection_id: &str,
    workspace_root: Option<&str>,
    mode: &str,
    agent_alias: &str,
) -> Result<String> {
    let scope = scoped_key(connection_id, workspace_root, mode, agent_alias)?;
    Ok(format!("selected:{scope}"))
}

fn scoped_key(
    connection_id: &str,
    workspace_root: Option<&str>,
    mode: &str,
    agent_alias: &str,
) -> Result<String> {
    let connection_id = validated_segment("connection id", connection_id)?;
    let workspace_root = workspace_root
        .map(validated_workspace_root)
        .transpose()?
        .unwrap_or("");
    let mode = validated_segment("mode", mode)?;
    let agent_alias = validated_segment("agent alias", agent_alias)?;
    serde_json::to_string(&(connection_id, workspace_root, mode, agent_alias))
        .context("serialize scope key")
}

fn transcript_key(
    connection_id: &str,
    workspace_root: Option<&str>,
    mode: &str,
    agent_alias: &str,
    session_id: &str,
) -> Result<String> {
    let scope = scoped_key(connection_id, workspace_root, mode, agent_alias)?;
    let session_id = validated_segment("session id", session_id)?;
    Ok(format!("transcript:{scope}:{session_id}"))
}

fn session_workspace_key(connection_id: &str, session_id: &str) -> Result<String> {
    let connection_id = validated_segment("connection id", connection_id)?;
    let session_id = validated_segment("session id", session_id)?;
    Ok(format!("{connection_id}:{session_id}"))
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
            store
                .remember_root("conn-a", format!("/repo/{index}"))
                .await
                .unwrap();
        }
        store
            .remember_root("conn-a", "/repo/3".into())
            .await
            .unwrap();

        let snapshot = store.snapshot("conn-a").await.unwrap();
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
            .set_selected_session("conn-a", None, "chat", "zeroclaw", Some("session-1".into()))
            .await
            .unwrap();
        assert_eq!(
            store
                .selected_session("conn-a", None, "chat", "zeroclaw")
                .await
                .unwrap()
                .as_deref(),
            Some("session-1")
        );

        store
            .set_selected_session("conn-a", None, "chat", "zeroclaw", None)
            .await
            .unwrap();
        assert!(
            store
                .selected_session("conn-a", None, "chat", "zeroclaw")
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
                "conn-a",
                Some("/repo/a"),
                "chat",
                "zeroclaw",
                Some("session-a".into()),
            )
            .await
            .unwrap();
        store
            .set_selected_session(
                "conn-a",
                Some("/repo/b"),
                "chat",
                "zeroclaw",
                Some("session-b".into()),
            )
            .await
            .unwrap();

        assert_eq!(
            store
                .selected_session("conn-a", Some("/repo/a"), "chat", "zeroclaw")
                .await
                .unwrap()
                .as_deref(),
            Some("session-a")
        );
        assert_eq!(
            store
                .selected_session("conn-a", Some("/repo/b"), "chat", "zeroclaw")
                .await
                .unwrap()
                .as_deref(),
            Some("session-b")
        );
        assert_eq!(
            store.session_workspaces("conn-a").await.unwrap(),
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
    async fn workspace_selected_session_does_not_fall_back_to_unscoped_session() {
        let store = LocalStateStore::new();
        store
            .set_selected_session(
                "conn-a",
                None,
                "chat",
                "zeroclaw",
                Some("legacy-session".into()),
            )
            .await
            .unwrap();

        assert!(
            store
                .selected_session("conn-a", Some("/repo/a"), "chat", "zeroclaw")
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(
            store
                .selected_session("conn-a", None, "chat", "zeroclaw")
                .await
                .unwrap()
                .as_deref(),
            Some("legacy-session")
        );
    }

    #[tokio::test]
    async fn import_workspace_state_preserves_existing_current_root() {
        let store = LocalStateStore::new();
        store
            .remember_root("conn-a", "/repo/native".into())
            .await
            .unwrap();

        let snapshot = store
            .import_workspace_state(
                "conn-a",
                Some("/repo/legacy-current".into()),
                vec!["/repo/legacy-a".into(), "/repo/native".into()],
            )
            .await
            .unwrap();

        assert_eq!(snapshot.current_root.as_deref(), Some("/repo/native"));
        assert_eq!(
            snapshot.recent_roots,
            vec!["/repo/legacy-a".to_string(), "/repo/native".to_string()]
        );
    }

    #[tokio::test]
    async fn legacy_unscoped_state_migrates_to_first_active_connection_once() {
        let store = LocalStateStore::new();
        let legacy_scope = serde_json::to_string(&("/repo/legacy", "chat", "zeroclaw")).unwrap();
        {
            let mut state = store.state.write().await;
            state.current_root = Some("/repo/legacy".into());
            state.recent_roots = vec!["/repo/legacy".into()];
            state
                .selected_sessions
                .insert(format!("selected:{legacy_scope}"), "session-legacy".into());
            state
                .session_workspaces
                .insert("session-legacy".into(), "/repo/legacy".into());
            state.transcript_cache.insert(
                format!("transcript:{legacy_scope}:session-legacy"),
                vec![serde_json::json!({ "id": "legacy" })],
            );
        }

        let snapshot = store.snapshot("conn-a").await.unwrap();
        assert_eq!(snapshot.current_root.as_deref(), Some("/repo/legacy"));
        assert_eq!(snapshot.recent_roots, vec!["/repo/legacy".to_string()]);
        assert_eq!(
            store
                .selected_session("conn-a", Some("/repo/legacy"), "chat", "zeroclaw")
                .await
                .unwrap()
                .as_deref(),
            Some("session-legacy")
        );
        assert_eq!(
            store.session_workspaces("conn-a").await.unwrap(),
            vec![SessionWorkspaceBinding {
                session_id: "session-legacy".into(),
                workspace_root: "/repo/legacy".into(),
            }]
        );
        assert_eq!(
            store
                .transcript(
                    "conn-a",
                    Some("/repo/legacy"),
                    "chat",
                    "zeroclaw",
                    "session-legacy",
                )
                .await
                .unwrap(),
            Some(vec![serde_json::json!({ "id": "legacy" })])
        );

        let second_snapshot = store.snapshot("conn-b").await.unwrap();
        assert_eq!(second_snapshot, WorkspaceLocalState::default());
        assert!(
            store
                .selected_session("conn-b", Some("/repo/legacy"), "chat", "zeroclaw")
                .await
                .unwrap()
                .is_none()
        );
        assert!(store.session_workspaces("conn-b").await.unwrap().is_empty());
        assert!(
            store
                .transcript(
                    "conn-b",
                    Some("/repo/legacy"),
                    "chat",
                    "zeroclaw",
                    "session-legacy",
                )
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn transcript_cache_truncates_and_clears() {
        let store = LocalStateStore::new();
        let messages = (0..250)
            .map(|index| serde_json::json!({ "id": index }))
            .collect();

        store
            .set_transcript(
                "conn-a",
                Some("/repo/a"),
                "chat",
                "zeroclaw",
                "session-1",
                messages,
            )
            .await
            .unwrap();
        let cached = store
            .transcript("conn-a", Some("/repo/a"), "chat", "zeroclaw", "session-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(cached.len(), MAX_CACHED_MESSAGES);
        assert_eq!(
            cached.first().and_then(|value| value["id"].as_i64()),
            Some(50)
        );

        store
            .clear_transcript("conn-a", Some("/repo/a"), "chat", "zeroclaw", "session-1")
            .await
            .unwrap();
        assert!(
            store
                .transcript("conn-a", Some("/repo/a"), "chat", "zeroclaw", "session-1")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn transcript_cache_is_scoped_to_connection() {
        let store = LocalStateStore::new();
        store
            .set_transcript(
                "conn-a",
                None,
                "chat",
                "zeroclaw",
                "session-1",
                vec![serde_json::json!({ "id": 1 })],
            )
            .await
            .unwrap();

        assert!(
            store
                .transcript("conn-b", None, "chat", "zeroclaw", "session-1")
                .await
                .unwrap()
                .is_none()
        );
        let cached = store
            .transcript("conn-a", None, "chat", "zeroclaw", "session-1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(cached, vec![serde_json::json!({ "id": 1 })]);
    }
}
