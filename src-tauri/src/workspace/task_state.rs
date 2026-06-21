//! Native persistence for Studio-owned task metadata.
//!
//! ZeroClaw sessions, cron jobs, logs, memory, and tool results remain the
//! gateway source of truth. This store keeps only the desktop product shell:
//! task labels, local status, and stable references to gateway records.

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;
use tokio::sync::RwLock;

const STORE_FILE: &str = "task-state.json";
const KEY_STATE: &str = "state";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Draft,
    Running,
    NeedsApproval,
    Done,
    Failed,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum TaskMode {
    Chat,
    Acp,
    Automation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum PinnedResultKind {
    Message,
    File,
    Text,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct PinnedResult {
    pub kind: PinnedResultKind,
    pub label: String,
    pub value: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct StudioTask {
    pub id: String,
    pub connection_id: String,
    pub title: String,
    #[serde(default)]
    pub goal: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub cron_job_id: Option<String>,
    #[serde(default)]
    pub workspace_root: Option<String>,
    #[serde(default)]
    pub agent_alias: Option<String>,
    pub mode: TaskMode,
    pub status: TaskStatus,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub pinned_result: Option<PinnedResult>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub last_activity_at: Option<String>,
    #[serde(default)]
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, specta::Type)]
pub struct TaskPatch {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub goal: Option<Option<String>>,
    #[serde(default)]
    pub session_id: Option<Option<String>>,
    #[serde(default)]
    pub cron_job_id: Option<Option<String>>,
    #[serde(default)]
    pub workspace_root: Option<Option<String>>,
    #[serde(default)]
    pub agent_alias: Option<Option<String>>,
    #[serde(default)]
    pub mode: Option<TaskMode>,
    #[serde(default)]
    pub status: Option<TaskStatus>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub pinned_result: Option<Option<PinnedResult>>,
    #[serde(default)]
    pub last_activity_at: Option<Option<String>>,
    #[serde(default)]
    pub archived_at: Option<Option<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct TaskBackfillSession {
    pub session_id: String,
    pub name: String,
    #[serde(default)]
    pub agent_alias: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub last_message_at: Option<String>,
    #[serde(default)]
    pub message_count: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PersistedTaskState {
    #[serde(default)]
    tasks: HashMap<String, StudioTask>,
}

#[derive(Debug, Default)]
pub struct TaskStateStore {
    state: RwLock<PersistedTaskState>,
}

pub type SharedTaskStateStore = Arc<TaskStateStore>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskStatusProjection {
    pub task_id: String,
    pub status: TaskStatus,
    pub last_activity_at: Option<String>,
}

impl TaskStateStore {
    pub fn new() -> SharedTaskStateStore {
        Arc::new(Self::default())
    }

    pub async fn load<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let store = app.store(STORE_FILE).context("open task state store")?;
        let persisted = store
            .get(KEY_STATE)
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        *self.state.write().await = persisted;
        Ok(())
    }

    pub async fn save<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let store = app.store(STORE_FILE).context("open task state store")?;
        let state = self.state.read().await;
        store.set(
            KEY_STATE,
            serde_json::to_value(&*state).context("serialize task state")?,
        );
        store.save().context("persist task state")?;
        Ok(())
    }

    pub async fn list(&self, connection_id: &str) -> Result<Vec<StudioTask>> {
        let connection_id = validated_segment("connection id", connection_id)?;
        let state = self.state.read().await;
        let mut tasks: Vec<_> = state
            .tasks
            .values()
            .filter(|task| task.connection_id == connection_id)
            .cloned()
            .collect();
        tasks.sort_by_key(|task| Reverse(task_sort_key(task)));
        Ok(tasks)
    }

    pub async fn list_all(&self) -> Vec<StudioTask> {
        let state = self.state.read().await;
        let mut tasks = state.tasks.values().cloned().collect::<Vec<_>>();
        tasks.sort_by_key(|task| Reverse(task_sort_key(task)));
        tasks
    }

    pub async fn observer_candidates(&self, connection_id: &str) -> Result<Vec<StudioTask>> {
        let connection_id = validated_segment("connection id", connection_id)?;
        let state = self.state.read().await;
        let mut tasks: Vec<_> = state
            .tasks
            .values()
            .filter(|task| task.connection_id == connection_id)
            .filter(|task| task.status != TaskStatus::Archived)
            .filter(|task| task.session_id.is_some() || task.cron_job_id.is_some())
            .cloned()
            .collect();
        tasks.sort_by_key(|task| Reverse(task_sort_key(task)));
        Ok(tasks)
    }

    pub async fn apply_status_projections(
        &self,
        connection_id: &str,
        projections: Vec<TaskStatusProjection>,
    ) -> Result<Vec<StudioTask>> {
        let connection_id = validated_segment("connection id", connection_id)?.to_string();
        let mut changed = Vec::new();
        let mut state = self.state.write().await;

        for projection in projections {
            let task_id = validated_segment("task id", &projection.task_id)?.to_string();
            let Some(task) = state.tasks.get_mut(&task_id) else {
                continue;
            };
            if task.connection_id != connection_id || task.status == TaskStatus::Archived {
                continue;
            }

            let next_activity = projection
                .last_activity_at
                .clone()
                .or_else(|| task.last_activity_at.clone());
            if task.status == projection.status && task.last_activity_at == next_activity {
                continue;
            }

            task.status = projection.status;
            task.last_activity_at = next_activity;
            task.updated_at = now_iso();
            changed.push(task.clone());
        }

        changed.sort_by_key(|task| Reverse(task_sort_key(task)));
        Ok(changed)
    }

    pub async fn upsert(&self, mut task: StudioTask) -> Result<StudioTask> {
        validate_task(&task)?;
        task.tags = normalized_tags(task.tags);
        let mut state = self.state.write().await;
        state.tasks.insert(task.id.clone(), task.clone());
        Ok(task)
    }

    pub async fn patch(&self, id: &str, patch: TaskPatch) -> Result<StudioTask> {
        let id = validated_segment("task id", id)?.to_string();
        let mut state = self.state.write().await;
        let task = state
            .tasks
            .get_mut(&id)
            .ok_or_else(|| anyhow::anyhow!("task not found"))?;
        apply_patch(task, patch);
        validate_task(task)?;
        task.tags = normalized_tags(std::mem::take(&mut task.tags));
        Ok(task.clone())
    }

    pub async fn archive(&self, id: &str, archived_at: String) -> Result<StudioTask> {
        self.patch(
            id,
            TaskPatch {
                status: Some(TaskStatus::Archived),
                archived_at: Some(Some(archived_at)),
                ..TaskPatch::default()
            },
        )
        .await
    }

    pub async fn delete_local(&self, id: &str) -> Result<()> {
        let id = validated_segment("task id", id)?;
        let mut state = self.state.write().await;
        state.tasks.remove(id);
        Ok(())
    }

    pub async fn link_session(&self, id: &str, session_id: String) -> Result<StudioTask> {
        let id = validated_segment("task id", id)?.to_string();
        let session_id = validated_segment("session id", &session_id)?.to_string();
        let mut state = self.state.write().await;
        let now = now_iso();
        let connection_id = {
            let task = state
                .tasks
                .get_mut(&id)
                .ok_or_else(|| anyhow::anyhow!("task not found"))?;
            task.session_id = Some(session_id.clone());
            task.status = TaskStatus::Running;
            task.last_activity_at = Some(now.clone());
            task.updated_at = now;
            validate_task(task)?;
            task.connection_id.clone()
        };
        detach_duplicate_session_tasks(&mut state.tasks, &connection_id, &id, &session_id);
        state
            .tasks
            .get(&id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("task not found"))
    }

    pub async fn backfill_sessions(
        &self,
        connection_id: &str,
        sessions: Vec<TaskBackfillSession>,
        workspace_bindings: Vec<(String, String)>,
    ) -> Result<Vec<StudioTask>> {
        let connection_id = validated_segment("connection id", connection_id)?.to_string();
        let workspace_by_session: HashMap<_, _> = workspace_bindings.into_iter().collect();
        let current_session_ids: HashSet<String> = sessions
            .iter()
            .map(|session| session.session_id.clone())
            .collect();
        let mut state = self.state.write().await;
        state.tasks.retain(|_, task| {
            task.connection_id != connection_id
                || task
                    .session_id
                    .as_ref()
                    .is_none_or(|session_id| current_session_ids.contains(session_id))
        });
        dedupe_session_tasks(&mut state.tasks, &connection_id);
        let existing_sessions: HashSet<String> = state
            .tasks
            .values()
            .filter(|task| task.connection_id == connection_id)
            .filter_map(|task| task.session_id.clone())
            .collect();

        for session in sessions {
            if !backfill_session_visible(&session) {
                continue;
            }
            if existing_sessions.contains(&session.session_id) {
                continue;
            }
            let timestamp = session
                .last_message_at
                .clone()
                .or(session.updated_at.clone())
                .or(session.created_at.clone())
                .unwrap_or_else(now_iso);
            let task = StudioTask {
                id: format!("session-{}", session.session_id),
                connection_id: connection_id.clone(),
                title: non_empty(session.name).unwrap_or_else(|| "Untitled task".to_string()),
                goal: None,
                session_id: Some(session.session_id.clone()),
                cron_job_id: None,
                workspace_root: workspace_by_session.get(&session.session_id).cloned(),
                agent_alias: session.agent_alias.clone(),
                mode: TaskMode::Chat,
                status: TaskStatus::Done,
                tags: Vec::new(),
                pinned_result: None,
                created_at: session
                    .created_at
                    .clone()
                    .unwrap_or_else(|| timestamp.clone()),
                updated_at: session
                    .updated_at
                    .clone()
                    .unwrap_or_else(|| timestamp.clone()),
                last_activity_at: Some(timestamp),
                archived_at: None,
            };
            validate_task(&task)?;
            state.tasks.insert(task.id.clone(), task);
        }

        let mut tasks: Vec<_> = state
            .tasks
            .values()
            .filter(|task| task.connection_id == connection_id)
            .cloned()
            .collect();
        tasks.sort_by_key(|task| Reverse(task_sort_key(task)));
        Ok(tasks)
    }
}

fn apply_patch(task: &mut StudioTask, patch: TaskPatch) {
    if let Some(value) = patch.title {
        task.title = value;
    }
    if let Some(value) = patch.goal {
        task.goal = value;
    }
    if let Some(value) = patch.session_id {
        task.session_id = value;
    }
    if let Some(value) = patch.cron_job_id {
        task.cron_job_id = value;
    }
    if let Some(value) = patch.workspace_root {
        task.workspace_root = value;
    }
    if let Some(value) = patch.agent_alias {
        task.agent_alias = value;
    }
    if let Some(value) = patch.mode {
        task.mode = value;
    }
    if let Some(value) = patch.status {
        task.status = value;
    }
    if let Some(value) = patch.tags {
        task.tags = value;
    }
    if let Some(value) = patch.pinned_result {
        task.pinned_result = value;
    }
    if let Some(value) = patch.last_activity_at {
        task.last_activity_at = value;
    }
    if let Some(value) = patch.archived_at {
        task.archived_at = value;
    }
    task.updated_at = now_iso();
}

fn validate_task(task: &StudioTask) -> Result<()> {
    validated_segment("task id", &task.id)?;
    validated_segment("connection id", &task.connection_id)?;
    if task.title.trim().is_empty() {
        bail!("task title is required");
    }
    Ok(())
}

fn validated_segment<'a>(label: &str, value: &'a str) -> Result<&'a str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        bail!("{label} is required");
    }
    if trimmed.contains('\0') {
        bail!("{label} contains invalid null byte");
    }
    Ok(trimmed)
}

fn normalized_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for tag in tags {
        let tag = tag.trim();
        if tag.is_empty() || !seen.insert(tag.to_lowercase()) {
            continue;
        }
        out.push(tag.to_string());
    }
    out
}

fn backfill_session_visible(session: &TaskBackfillSession) -> bool {
    session.message_count.is_none_or(|count| count > 0)
}

fn dedupe_session_tasks(tasks: &mut HashMap<String, StudioTask>, connection_id: &str) {
    let mut by_session: HashMap<String, Vec<String>> = HashMap::new();
    for task in tasks.values() {
        if task.connection_id != connection_id || task.status == TaskStatus::Archived {
            continue;
        }
        if let Some(session_id) = task.session_id.as_ref() {
            by_session
                .entry(session_id.clone())
                .or_default()
                .push(task.id.clone());
        }
    }

    for (session_id, mut task_ids) in by_session {
        if task_ids.len() < 2 {
            continue;
        }
        task_ids.sort_by(|a, b| {
            let a_task = tasks.get(a).expect("task id collected from map");
            let b_task = tasks.get(b).expect("task id collected from map");
            session_owner_key(b_task, &session_id).cmp(&session_owner_key(a_task, &session_id))
        });
        if let Some(owner_id) = task_ids.first() {
            detach_duplicate_session_tasks(tasks, connection_id, owner_id, &session_id);
        }
    }
}

fn detach_duplicate_session_tasks(
    tasks: &mut HashMap<String, StudioTask>,
    connection_id: &str,
    owner_id: &str,
    session_id: &str,
) {
    let duplicate_ids = tasks
        .values()
        .filter(|task| task.id != owner_id)
        .filter(|task| task.connection_id == connection_id)
        .filter(|task| task.status != TaskStatus::Archived)
        .filter(|task| task.session_id.as_deref() == Some(session_id))
        .map(|task| task.id.clone())
        .collect::<Vec<_>>();
    if duplicate_ids.is_empty() {
        return;
    }

    let now = now_iso();
    for duplicate_id in duplicate_ids {
        if let Some(task) = tasks.get(&duplicate_id)
            && disposable_session_duplicate(task, session_id)
        {
            tasks.remove(&duplicate_id);
            continue;
        }

        if let Some(task) = tasks.get_mut(&duplicate_id) {
            task.session_id = None;
            if task.cron_job_id.is_none() {
                task.status = TaskStatus::Draft;
                task.last_activity_at = None;
            }
            task.updated_at = now.clone();
        }
    }
}

fn session_owner_key(task: &StudioTask, session_id: &str) -> (u8, u8, String) {
    (
        u8::from(task.id != backfilled_session_task_id(session_id)),
        u8::from(!default_task_title(&task.title)),
        task_sort_key(task),
    )
}

fn disposable_session_duplicate(task: &StudioTask, session_id: &str) -> bool {
    task.id == backfilled_session_task_id(session_id)
        || (default_task_title(&task.title)
            && task.goal.is_none()
            && task.cron_job_id.is_none()
            && task.tags.is_empty()
            && task.pinned_result.is_none())
}

fn default_task_title(title: &str) -> bool {
    matches!(title.trim(), "New chat" | "New task" | "Untitled task")
}

fn backfilled_session_task_id(session_id: &str) -> String {
    format!("session-{session_id}")
}

fn non_empty(value: String) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn task_sort_key(task: &StudioTask) -> String {
    task.last_activity_at
        .as_ref()
        .or(Some(&task.updated_at))
        .cloned()
        .unwrap_or_default()
}

fn now_iso() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| format!("{}", duration.as_secs()))
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, connection_id: &str) -> StudioTask {
        StudioTask {
            id: id.to_string(),
            connection_id: connection_id.to_string(),
            title: format!("Task {id}"),
            goal: None,
            session_id: None,
            cron_job_id: None,
            workspace_root: None,
            agent_alias: None,
            mode: TaskMode::Chat,
            status: TaskStatus::Draft,
            tags: vec!["alpha".into(), "Alpha".into(), " ".into()],
            pinned_result: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            last_activity_at: None,
            archived_at: None,
        }
    }

    #[tokio::test]
    async fn upsert_lists_by_connection_and_normalizes_tags() {
        let store = TaskStateStore::new();
        store.upsert(task("a", "conn-a")).await.unwrap();
        store.upsert(task("b", "conn-b")).await.unwrap();

        let tasks = store.list("conn-a").await.unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, "a");
        assert_eq!(tasks[0].tags, vec!["alpha"]);
    }

    #[tokio::test]
    async fn patch_archive_delete_and_link_session() {
        let store = TaskStateStore::new();
        store.upsert(task("a", "conn-a")).await.unwrap();

        let linked = store.link_session("a", "session-1".into()).await.unwrap();
        assert_eq!(linked.session_id.as_deref(), Some("session-1"));

        let archived = store
            .archive("a", "2026-01-02T00:00:00Z".into())
            .await
            .unwrap();
        assert_eq!(archived.status, TaskStatus::Archived);
        assert_eq!(
            archived.archived_at.as_deref(),
            Some("2026-01-02T00:00:00Z")
        );

        store.delete_local("a").await.unwrap();
        assert!(store.list("conn-a").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn backfills_sessions_without_duplicates() {
        let store = TaskStateStore::new();
        store
            .backfill_sessions(
                "conn-a",
                vec![TaskBackfillSession {
                    session_id: "s1".into(),
                    name: "Research".into(),
                    agent_alias: Some("default".into()),
                    created_at: Some("2026-01-01T00:00:00Z".into()),
                    updated_at: None,
                    last_message_at: None,
                    message_count: Some(2),
                }],
                vec![("s1".into(), "/repo".into())],
            )
            .await
            .unwrap();
        store
            .backfill_sessions(
                "conn-a",
                vec![TaskBackfillSession {
                    session_id: "s1".into(),
                    name: "Research again".into(),
                    agent_alias: None,
                    created_at: None,
                    updated_at: None,
                    last_message_at: None,
                    message_count: None,
                }],
                Vec::new(),
            )
            .await
            .unwrap();

        let tasks = store.list("conn-a").await.unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Research");
        assert_eq!(tasks[0].workspace_root.as_deref(), Some("/repo"));
    }

    #[tokio::test]
    async fn link_session_removes_backfilled_duplicate() {
        let store = TaskStateStore::new();
        store.upsert(task("manual", "conn-a")).await.unwrap();
        store
            .backfill_sessions(
                "conn-a",
                vec![TaskBackfillSession {
                    session_id: "s1".into(),
                    name: "New chat".into(),
                    agent_alias: None,
                    created_at: None,
                    updated_at: None,
                    last_message_at: None,
                    message_count: Some(1),
                }],
                Vec::new(),
            )
            .await
            .unwrap();

        let linked = store.link_session("manual", "s1".into()).await.unwrap();
        assert_eq!(linked.session_id.as_deref(), Some("s1"));

        let tasks = store.list("conn-a").await.unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, "manual");
    }

    #[tokio::test]
    async fn backfill_detaches_user_duplicate_session_task() {
        let store = TaskStateStore::new();
        let mut owner = task("owner", "conn-a");
        owner.title = "Important chat".into();
        owner.session_id = Some("s1".into());
        owner.last_activity_at = Some("2026-01-02T00:00:00Z".into());
        store.upsert(owner).await.unwrap();

        let mut duplicate = task("duplicate", "conn-a");
        duplicate.title = "Follow-up notes".into();
        duplicate.goal = Some("Keep these notes".into());
        duplicate.session_id = Some("s1".into());
        store.upsert(duplicate).await.unwrap();

        let tasks = store
            .backfill_sessions(
                "conn-a",
                vec![TaskBackfillSession {
                    session_id: "s1".into(),
                    name: "Runtime session".into(),
                    agent_alias: None,
                    created_at: None,
                    updated_at: None,
                    last_message_at: None,
                    message_count: Some(1),
                }],
                Vec::new(),
            )
            .await
            .unwrap();
        let owner = tasks.iter().find(|task| task.id == "owner").unwrap();
        let duplicate = tasks.iter().find(|task| task.id == "duplicate").unwrap();

        assert_eq!(owner.session_id.as_deref(), Some("s1"));
        assert_eq!(duplicate.session_id, None);
        assert_eq!(duplicate.goal.as_deref(), Some("Keep these notes"));
    }

    #[tokio::test]
    async fn backfill_prunes_missing_sessions_but_retains_invisible_current_sessions() {
        let store = TaskStateStore::new();
        let mut stale = task("stale", "conn-a");
        stale.session_id = Some("stale-session".into());
        store.upsert(stale).await.unwrap();
        let mut invisible = task("invisible", "conn-a");
        invisible.session_id = Some("empty-session".into());
        store.upsert(invisible).await.unwrap();
        store.upsert(task("draft", "conn-a")).await.unwrap();

        let tasks = store
            .backfill_sessions(
                "conn-a",
                vec![TaskBackfillSession {
                    session_id: "empty-session".into(),
                    name: "Empty".into(),
                    agent_alias: None,
                    created_at: None,
                    updated_at: None,
                    last_message_at: None,
                    message_count: Some(0),
                }],
                Vec::new(),
            )
            .await
            .unwrap();
        let ids = tasks
            .iter()
            .map(|task| task.id.as_str())
            .collect::<Vec<_>>();

        assert!(!ids.contains(&"stale"));
        assert!(ids.contains(&"invisible"));
        assert!(ids.contains(&"draft"));
        assert!(!ids.contains(&"session-empty-session"));
    }
}
