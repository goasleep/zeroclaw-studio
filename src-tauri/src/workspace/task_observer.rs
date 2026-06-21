//! Multi-runtime background projections from ZeroClaw runtime state.
//!
//! Studio owns task shells, runtime badges, and approval inbox projections.
//! Execution state stays in each ZeroClaw gateway. This observer follows the
//! IM-style split: every reachable runtime gets lightweight background sync,
//! while the active runtime is reconciled more frequently.

use crate::connection::Connection;
use crate::connection::store::SharedConnectionBook;
use crate::workspace::local_state::SharedLocalStateStore;
use crate::workspace::task_state::{
    SharedTaskStateStore, StudioTask, TaskBackfillSession, TaskStatus, TaskStatusProjection,
};
use anyhow::{Context, Result, anyhow};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::RwLock;

const ACTIVE_POLL_INTERVAL: Duration = Duration::from_secs(5);
const INACTIVE_POLL_INTERVAL: Duration = Duration::from_secs(30);
const MANAGER_INTERVAL: Duration = Duration::from_secs(10);
const RETRY_INTERVAL: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const SYNC_LEVEL_CHECK_INTERVAL: Duration = Duration::from_secs(2);

pub const TASKS_UPDATED_EVENT: &str = "zeroclaw://tasks-updated";
pub const RUNTIME_SUMMARIES_UPDATED_EVENT: &str = "zeroclaw://runtime-summaries-updated";
pub const APPROVALS_UPDATED_EVENT: &str = "zeroclaw://approvals-updated";

#[derive(Debug, Clone, Serialize)]
pub struct TasksUpdatedEvent {
    pub connection_id: String,
    pub tasks: Vec<StudioTask>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeSyncStatus {
    Unknown,
    Online,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct RuntimeSummary {
    pub connection_id: String,
    pub status: RuntimeSyncStatus,
    pub healthy: bool,
    pub last_seen_at: Option<String>,
    pub running_count: u32,
    pub approval_count: u32,
    pub failed_count: u32,
    pub automation_count: u32,
    pub sync_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeSummariesUpdatedEvent {
    pub summaries: Vec<RuntimeSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    Approve,
    Deny,
    Always,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct PendingApproval {
    pub connection_id: String,
    pub request_id: String,
    pub session_id: String,
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub task_title: Option<String>,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub arguments_summary: Option<String>,
    #[serde(default)]
    pub workspace_root: Option<String>,
    #[serde(default)]
    pub agent_alias: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApprovalsUpdatedEvent {
    pub connection_id: String,
    pub approvals: Vec<PendingApproval>,
}

#[derive(Debug, Default)]
pub struct RuntimeSummaryStore {
    summaries: RwLock<HashMap<String, RuntimeSummary>>,
}

pub type SharedRuntimeSummaryStore = Arc<RuntimeSummaryStore>;

#[derive(Debug, Default)]
pub struct ApprovalStateStore {
    approvals: RwLock<HashMap<String, HashMap<String, PendingApproval>>>,
}

pub type SharedApprovalStateStore = Arc<ApprovalStateStore>;

#[derive(Debug, Clone, PartialEq, Eq)]
struct Projection {
    status: TaskStatus,
    last_activity_at: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct RunningSessions {
    ids: HashSet<String>,
    available: bool,
}

#[derive(Debug, Clone)]
struct GatewayTaskClient {
    base_url: String,
    token: Option<String>,
    client: reqwest::Client,
}

#[derive(Debug, Clone, Default)]
struct ReconcileOutcome {
    healthy: bool,
    tasks_changed: bool,
    tasks: Vec<StudioTask>,
    approvals: Vec<PendingApproval>,
    automation_count: u32,
}

struct ObserverContext<R: Runtime + 'static> {
    app: AppHandle<R>,
    book: SharedConnectionBook,
    task_store: SharedTaskStateStore,
    local_store: SharedLocalStateStore,
    summaries: SharedRuntimeSummaryStore,
    approvals: SharedApprovalStateStore,
    http_client: reqwest::Client,
}

impl<R: Runtime + 'static> Clone for ObserverContext<R> {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            book: self.book.clone(),
            task_store: self.task_store.clone(),
            local_store: self.local_store.clone(),
            summaries: self.summaries.clone(),
            approvals: self.approvals.clone(),
            http_client: self.http_client.clone(),
        }
    }
}

impl RuntimeSummaryStore {
    pub fn new() -> SharedRuntimeSummaryStore {
        Arc::new(Self::default())
    }

    pub async fn list(&self) -> Vec<RuntimeSummary> {
        let mut summaries = self
            .summaries
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        summaries.sort_by(|a, b| a.connection_id.cmp(&b.connection_id));
        summaries
    }

    async fn upsert(&self, summary: RuntimeSummary) -> Vec<RuntimeSummary> {
        self.summaries
            .write()
            .await
            .insert(summary.connection_id.clone(), summary);
        self.list().await
    }
}

impl ApprovalStateStore {
    pub fn new() -> SharedApprovalStateStore {
        Arc::new(Self::default())
    }

    pub async fn list(&self, connection_id: Option<&str>) -> Vec<PendingApproval> {
        let state = self.approvals.read().await;
        let mut approvals = if let Some(connection_id) = connection_id {
            state
                .get(connection_id)
                .map(|items| items.values().cloned().collect::<Vec<_>>())
                .unwrap_or_default()
        } else {
            state
                .values()
                .flat_map(|items| items.values().cloned())
                .collect::<Vec<_>>()
        };
        approvals.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        approvals
    }

    async fn replace_connection(
        &self,
        connection_id: &str,
        approvals: Vec<PendingApproval>,
    ) -> Vec<PendingApproval> {
        let mut by_request = HashMap::new();
        for approval in approvals {
            by_request.insert(approval.request_id.clone(), approval);
        }
        self.approvals
            .write()
            .await
            .insert(connection_id.to_string(), by_request);
        self.list(Some(connection_id)).await
    }

    pub async fn remove(&self, connection_id: &str, request_id: &str) -> Vec<PendingApproval> {
        let mut state = self.approvals.write().await;
        if let Some(items) = state.get_mut(connection_id) {
            items.remove(request_id);
        }
        drop(state);
        self.list(Some(connection_id)).await
    }
}

pub fn spawn_runtime_observer<R: Runtime + 'static>(
    app: AppHandle<R>,
    book: SharedConnectionBook,
    task_store: SharedTaskStateStore,
    local_store: SharedLocalStateStore,
    summaries: SharedRuntimeSummaryStore,
    approvals: SharedApprovalStateStore,
    http_client: reqwest::Client,
) {
    let ctx = ObserverContext {
        app,
        book,
        task_store,
        local_store,
        summaries,
        approvals,
        http_client,
    };

    tauri::async_runtime::spawn(async move {
        run_observer_manager(ctx).await;
    });
}

async fn run_observer_manager<R: Runtime + 'static>(ctx: ObserverContext<R>) {
    let mut workers: HashMap<uuid::Uuid, tokio::task::JoinHandle<()>> = HashMap::new();
    loop {
        let connections = ctx.book.list().await;
        let live_ids = connections
            .iter()
            .map(|connection| connection.id)
            .collect::<HashSet<_>>();

        workers.retain(|id, handle| {
            if live_ids.contains(id) {
                true
            } else {
                handle.abort();
                false
            }
        });

        for connection in connections {
            workers.entry(connection.id).or_insert_with(|| {
                let worker_ctx = ctx.clone();
                tokio::spawn(async move {
                    run_connection_worker(worker_ctx, connection.id).await;
                })
            });
        }

        tokio::time::sleep(MANAGER_INTERVAL).await;
    }
}

async fn run_connection_worker<R: Runtime + 'static>(
    ctx: ObserverContext<R>,
    connection_id: uuid::Uuid,
) {
    loop {
        let Some(conn) = ctx.book.get(connection_id).await else {
            break;
        };
        if conn.url.trim().is_empty() {
            emit_unavailable(&ctx, &conn, "connection has no resolved URL").await;
            tokio::time::sleep(INACTIVE_POLL_INTERVAL).await;
            continue;
        }

        let interval = sync_interval(&ctx.book, conn.id).await;
        if let Err(err) = reconcile_and_emit(&ctx, &conn).await {
            emit_unavailable(&ctx, &conn, &err.to_string()).await;
        }

        if let Err(err) = stream_runtime_events(&ctx, conn.clone(), interval).await {
            log::debug!("[runtime-observer:{}] event stream ended: {err}", conn.id);
        }

        tokio::time::sleep(RETRY_INTERVAL).await;
    }
}

async fn stream_runtime_events<R: Runtime + 'static>(
    ctx: &ObserverContext<R>,
    conn: Connection,
    interval: Duration,
) -> Result<()> {
    let client = GatewayTaskClient::new(&conn, ctx.http_client.clone());
    let response = client
        .event_stream_request("/api/events")
        .send()
        .await
        .context("open event stream")?;
    if !response.status().is_success() {
        return Err(anyhow!("event stream returned {}", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut ticker = tokio::time::interval_at(
        tokio::time::Instant::now() + interval + stagger_offset(conn.id, interval),
        interval,
    );
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut sync_level_check = tokio::time::interval(SYNC_LEVEL_CHECK_INTERVAL);
    sync_level_check.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            maybe = stream.next() => {
                let Some(chunk) = maybe else {
                    break;
                };
                let chunk = chunk.context("read event stream")?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim().to_string();
                    buffer = buffer[pos + 1..].to_string();
                    if let Some(data) = line.strip_prefix("data:")
                        && event_should_reconcile(data.trim())
                    {
                        let current = ctx.book.get(conn.id).await;
                        let Some(current) = current else {
                            return Ok(());
                        };
                        reconcile_and_emit(ctx, &current).await?;
                    }
                }
            }
            _ = ticker.tick() => {
                let current = ctx.book.get(conn.id).await;
                let Some(current) = current else {
                    return Ok(());
                };
                reconcile_and_emit(ctx, &current).await?;
                if sync_interval(&ctx.book, conn.id).await != interval {
                    return Ok(());
                }
            }
            _ = sync_level_check.tick() => {
                if sync_interval(&ctx.book, conn.id).await != interval {
                    return Ok(());
                }
            }
        }
    }
    Ok(())
}

fn stagger_offset(connection_id: uuid::Uuid, interval: Duration) -> Duration {
    if interval <= ACTIVE_POLL_INTERVAL {
        return Duration::ZERO;
    }
    let max_ms = (interval.as_millis() / 2).max(1) as u64;
    let seed = connection_id.as_bytes().iter().fold(0_u64, |acc, byte| {
        acc.wrapping_mul(31).wrapping_add(*byte as u64)
    });
    Duration::from_millis(seed % max_ms)
}

async fn sync_interval(book: &SharedConnectionBook, connection_id: uuid::Uuid) -> Duration {
    let active = book.active().await;
    if active.as_ref().map(|active| active.id) == Some(connection_id) {
        ACTIVE_POLL_INTERVAL
    } else {
        INACTIVE_POLL_INTERVAL
    }
}

async fn reconcile_and_emit<R: Runtime + 'static>(
    ctx: &ObserverContext<R>,
    conn: &Connection,
) -> Result<()> {
    let outcome = reconcile_connection(ctx, conn).await?;
    let connection_id = conn.id.to_string();
    if outcome.tasks_changed {
        ctx.task_store.save(&ctx.app).await?;
        let _ = ctx.app.emit(
            TASKS_UPDATED_EVENT,
            TasksUpdatedEvent {
                connection_id: connection_id.clone(),
                tasks: outcome.tasks.clone(),
            },
        );
    }

    let approvals = ctx
        .approvals
        .replace_connection(&connection_id, outcome.approvals)
        .await;
    let _ = ctx.app.emit(
        APPROVALS_UPDATED_EVENT,
        ApprovalsUpdatedEvent {
            connection_id: connection_id.clone(),
            approvals: approvals.clone(),
        },
    );

    let summary = build_runtime_summary(
        &connection_id,
        RuntimeSyncStatus::Online,
        outcome.healthy,
        None,
        &outcome.tasks,
        approvals.len() as u32,
        outcome.automation_count,
    );
    let summaries = ctx.summaries.upsert(summary).await;
    let _ = ctx.app.emit(
        RUNTIME_SUMMARIES_UPDATED_EVENT,
        RuntimeSummariesUpdatedEvent { summaries },
    );
    Ok(())
}

async fn emit_unavailable<R: Runtime + 'static>(
    ctx: &ObserverContext<R>,
    conn: &Connection,
    error: &str,
) {
    let connection_id = conn.id.to_string();
    let tasks = ctx
        .task_store
        .list(&connection_id)
        .await
        .unwrap_or_default();
    let approvals = ctx.approvals.list(Some(&connection_id)).await;
    let summary = build_runtime_summary(
        &connection_id,
        RuntimeSyncStatus::Unavailable,
        false,
        Some(error.to_string()),
        &tasks,
        approvals.len() as u32,
        0,
    );
    let summaries = ctx.summaries.upsert(summary).await;
    let _ = ctx.app.emit(
        RUNTIME_SUMMARIES_UPDATED_EVENT,
        RuntimeSummariesUpdatedEvent { summaries },
    );
}

async fn reconcile_connection<R: Runtime + 'static>(
    ctx: &ObserverContext<R>,
    conn: &Connection,
) -> Result<ReconcileOutcome> {
    if conn.url.trim().is_empty() {
        return Err(anyhow!("connection has no resolved URL"));
    }
    let connection_id = conn.id.to_string();
    let gateway = GatewayTaskClient::new(conn, ctx.http_client.clone());
    gateway.health().await?;

    let sessions = match gateway.sessions().await {
        Ok(sessions) => {
            let session_ids = sessions
                .iter()
                .map(|session| session.session_id.clone())
                .collect::<Vec<_>>();
            ctx.local_store
                .prune_missing_sessions(&connection_id, session_ids)
                .await?;
            ctx.local_store.save(&ctx.app).await?;
            sessions
        }
        Err(_) => Vec::new(),
    };
    let workspace_bindings = ctx
        .local_store
        .session_workspaces(&connection_id)
        .await?
        .into_iter()
        .map(|binding| (binding.session_id, binding.workspace_root))
        .collect::<Vec<_>>();

    let before_backfill = ctx.task_store.list(&connection_id).await?;
    let mut tasks = ctx
        .task_store
        .backfill_sessions(&connection_id, sessions, workspace_bindings)
        .await?;
    let mut tasks_changed = before_backfill != tasks;

    let candidates = ctx.task_store.observer_candidates(&connection_id).await?;
    let cron_jobs = if candidates.iter().any(|task| task.cron_job_id.is_some()) {
        gateway.cron_jobs().await.unwrap_or_default()
    } else {
        HashMap::new()
    };
    let automation_count = gateway
        .cron_jobs()
        .await
        .map(|jobs| active_cron_count(&jobs))
        .unwrap_or_else(|_| active_cron_count(&cron_jobs));
    let projections = build_projections(&gateway, &candidates, Some(&cron_jobs)).await;
    if !projections.is_empty() {
        let changed = ctx
            .task_store
            .apply_status_projections(&connection_id, projections)
            .await?;
        if !changed.is_empty() {
            tasks_changed = true;
        }
    }

    tasks = ctx.task_store.list(&connection_id).await?;
    let approvals = build_approval_projections(&gateway, &tasks).await;

    Ok(ReconcileOutcome {
        healthy: true,
        tasks_changed,
        tasks,
        approvals,
        automation_count,
    })
}

fn build_runtime_summary(
    connection_id: &str,
    status: RuntimeSyncStatus,
    healthy: bool,
    sync_error: Option<String>,
    tasks: &[StudioTask],
    approval_count: u32,
    automation_count: u32,
) -> RuntimeSummary {
    let visible = tasks
        .iter()
        .filter(|task| task.status != TaskStatus::Archived)
        .collect::<Vec<_>>();
    RuntimeSummary {
        connection_id: connection_id.to_string(),
        status,
        healthy,
        last_seen_at: if healthy { Some(now_iso()) } else { None },
        running_count: visible
            .iter()
            .filter(|task| matches!(task.status, TaskStatus::Running | TaskStatus::NeedsApproval))
            .count() as u32,
        approval_count,
        failed_count: visible
            .iter()
            .filter(|task| task.status == TaskStatus::Failed)
            .count() as u32,
        automation_count,
        sync_error,
    }
}

async fn build_projections(
    gateway: &GatewayTaskClient,
    tasks: &[StudioTask],
    cron_jobs: Option<&HashMap<String, Value>>,
) -> Vec<TaskStatusProjection> {
    let session_tasks = tasks
        .iter()
        .filter(|task| task.session_id.is_some())
        .collect::<Vec<_>>();
    let running_sessions = if session_tasks.is_empty() {
        RunningSessions::default()
    } else {
        gateway.running_sessions().await.unwrap_or_default()
    };
    let owned_cron_jobs;
    let cron_jobs = if let Some(cron_jobs) = cron_jobs {
        cron_jobs
    } else if tasks.iter().any(|task| task.cron_job_id.is_some()) {
        owned_cron_jobs = gateway.cron_jobs().await.unwrap_or_default();
        &owned_cron_jobs
    } else {
        owned_cron_jobs = HashMap::new();
        &owned_cron_jobs
    };

    let mut projections = Vec::new();
    for task in tasks {
        let projection = if let Some(session_id) = task.session_id.as_deref() {
            reconcile_session(gateway, task, session_id, &running_sessions).await
        } else if let Some(cron_job_id) = task.cron_job_id.as_deref() {
            reconcile_cron(gateway, cron_job_id, cron_jobs).await
        } else {
            None
        };

        if let Some(projection) = projection {
            projections.push(TaskStatusProjection {
                task_id: task.id.clone(),
                status: projection.status,
                last_activity_at: projection.last_activity_at,
            });
        }
    }
    projections
}

async fn reconcile_session(
    gateway: &GatewayTaskClient,
    task: &StudioTask,
    session_id: &str,
    running_sessions: &RunningSessions,
) -> Option<Projection> {
    let state_projection = gateway.session_state(session_id).await.ok().flatten();
    if let Some(projection) = state_projection.as_ref()
        && matches!(
            projection.status,
            TaskStatus::Failed | TaskStatus::NeedsApproval
        )
    {
        return Some(projection.clone());
    }

    if running_sessions.available && running_sessions.ids.contains(session_id) {
        return Some(Projection {
            status: TaskStatus::Running,
            last_activity_at: None,
        });
    }

    if let Some(projection) = state_projection {
        return Some(projection);
    }

    if running_sessions.available
        && matches!(task.status, TaskStatus::Running | TaskStatus::NeedsApproval)
        && let Ok(Some(projection)) = gateway.session_messages_projection(session_id).await
    {
        return Some(projection);
    }

    None
}

async fn reconcile_cron(
    gateway: &GatewayTaskClient,
    cron_job_id: &str,
    cron_jobs: &HashMap<String, Value>,
) -> Option<Projection> {
    let Some(job) = cron_jobs.get(cron_job_id) else {
        return Some(Projection {
            status: TaskStatus::Failed,
            last_activity_at: None,
        });
    };
    if let Ok(Some(projection)) = gateway.cron_latest_run_projection(cron_job_id).await {
        return Some(projection);
    }
    cron_job_projection(job)
}

async fn build_approval_projections(
    gateway: &GatewayTaskClient,
    tasks: &[StudioTask],
) -> Vec<PendingApproval> {
    let mut approvals = Vec::new();
    for task in tasks {
        if task.status == TaskStatus::Archived {
            continue;
        }
        let Some(session_id) = task.session_id.as_deref() else {
            continue;
        };
        let Ok(value) = gateway.session_state_value(session_id).await else {
            continue;
        };
        let Some(mut approval) = approval_from_value(&value, &task.connection_id, session_id)
        else {
            continue;
        };
        approval.task_id = Some(task.id.clone());
        approval.task_title = Some(task.title.clone());
        approval.workspace_root = task.workspace_root.clone();
        approval.agent_alias = task.agent_alias.clone();
        approvals.push(approval);
    }
    approvals
}

impl GatewayTaskClient {
    fn new(conn: &Connection, client: reqwest::Client) -> Self {
        Self {
            base_url: conn.url.trim_end_matches('/').to_string(),
            token: conn.auth.token.clone(),
            client,
        }
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let mut request = self.client.request(method, url).timeout(REQUEST_TIMEOUT);
        if let Some(token) = self.token.as_deref() {
            request = request.header("Authorization", format!("Bearer {token}"));
        }
        request
    }

    fn event_stream_request(&self, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let mut request = self.client.get(url);
        if let Some(token) = self.token.as_deref() {
            request = request.header("Authorization", format!("Bearer {token}"));
        }
        request
    }

    async fn get_json(&self, path: &str) -> Result<Value> {
        let response = self
            .request(reqwest::Method::GET, path)
            .send()
            .await
            .with_context(|| format!("GET {path}"))?;
        if !response.status().is_success() {
            return Err(anyhow!("GET {path} returned {}", response.status()));
        }
        response
            .json::<Value>()
            .await
            .with_context(|| format!("parse {path}"))
    }

    async fn health(&self) -> Result<()> {
        let value = self.get_json("/api/health").await?;
        let status = health_status_from_json(&value).unwrap_or_else(|| "unknown".to_string());
        if matches!(status.as_str(), "ok" | "healthy" | "online" | "ready") {
            Ok(())
        } else {
            Err(anyhow!("health status {status}"))
        }
    }

    async fn sessions(&self) -> Result<Vec<TaskBackfillSession>> {
        let value = self.get_json("/api/sessions").await?;
        let sessions = value
            .get("sessions")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Ok(sessions.into_iter().filter_map(session_from_json).collect())
    }

    async fn running_sessions(&self) -> Result<RunningSessions> {
        let value = self.get_json("/api/sessions/running").await?;
        Ok(RunningSessions {
            ids: parse_running_session_ids(&value),
            available: true,
        })
    }

    async fn session_state_value(&self, session_id: &str) -> Result<Value> {
        self.get_json(&format!(
            "/api/sessions/{}/state",
            url_encode_segment(session_id)
        ))
        .await
    }

    async fn session_state(&self, session_id: &str) -> Result<Option<Projection>> {
        let value = self.session_state_value(session_id).await?;
        Ok(session_state_projection(&value))
    }

    async fn session_messages_projection(&self, session_id: &str) -> Result<Option<Projection>> {
        let value = self
            .get_json(&format!(
                "/api/sessions/{}/messages",
                url_encode_segment(session_id)
            ))
            .await?;
        Ok(session_messages_projection(&value))
    }

    async fn cron_jobs(&self) -> Result<HashMap<String, Value>> {
        let value = self.get_json("/api/cron").await?;
        let jobs = value
            .get("jobs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Ok(jobs
            .into_iter()
            .filter_map(|job| Some((json_string_field(&job, &["id", "job_id"])?, job)))
            .collect())
    }

    async fn cron_latest_run_projection(&self, cron_job_id: &str) -> Result<Option<Projection>> {
        let value = self
            .get_json(&format!(
                "/api/cron/{}/runs?limit=1",
                url_encode_segment(cron_job_id)
            ))
            .await?;
        let Some(run) = value
            .get("runs")
            .and_then(Value::as_array)
            .and_then(|runs| runs.first())
        else {
            return Ok(None);
        };
        Ok(cron_run_projection(run))
    }
}

fn event_should_reconcile(data: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(data) else {
        return false;
    };
    let Some(kind) = value.get("type").and_then(Value::as_str) else {
        return false;
    };
    matches!(
        kind,
        "agent_start" | "agent_end" | "cron_result" | "error" | "approval_request"
    )
}

fn health_status_from_json(value: &Value) -> Option<String> {
    value
        .get("status")
        .and_then(Value::as_str)
        .or_else(|| {
            value
                .get("health")
                .and_then(|health| health.get("status"))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            value
                .get("health")
                .and_then(|health| health.get("components"))
                .and_then(|components| components.get("gateway"))
                .and_then(|gateway| gateway.get("status"))
                .and_then(Value::as_str)
        })
        .map(|status| status.trim().to_ascii_lowercase())
        .filter(|status| !status.is_empty())
}

fn session_from_json(value: Value) -> Option<TaskBackfillSession> {
    let id = json_string_field(&value, &["session_id", "id"])?;
    Some(TaskBackfillSession {
        session_id: id.clone(),
        name: json_string_field(&value, &["name"]).unwrap_or_else(|| short_session_name(&id)),
        agent_alias: json_string_field(&value, &["agent_alias"]),
        created_at: json_string_field(&value, &["created_at"]),
        updated_at: json_string_field(&value, &["updated_at"]),
        last_message_at: json_string_field(&value, &["last_message_at"]),
        message_count: value
            .get("message_count")
            .and_then(Value::as_u64)
            .and_then(|count| u32::try_from(count).ok()),
    })
}

fn short_session_name(id: &str) -> String {
    format!("run {}", id.chars().take(8).collect::<String>())
}

fn active_cron_count(jobs: &HashMap<String, Value>) -> u32 {
    jobs.values()
        .filter(|job| job.get("enabled").and_then(Value::as_bool) != Some(false))
        .count() as u32
}

fn parse_running_session_ids(value: &Value) -> HashSet<String> {
    let mut out = HashSet::new();
    collect_session_ids(value, &mut out);
    out
}

fn collect_session_ids(value: &Value, out: &mut HashSet<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_session_ids(item, out);
            }
        }
        Value::Object(map) => {
            for key in ["session_id", "id"] {
                if let Some(id) = map.get(key).and_then(Value::as_str)
                    && !id.trim().is_empty()
                {
                    out.insert(id.to_string());
                }
            }
            for key in ["sessions", "running", "items"] {
                if let Some(nested) = map.get(key) {
                    collect_session_ids(nested, out);
                }
            }
        }
        _ => {}
    }
}

fn session_state_projection(value: &Value) -> Option<Projection> {
    if has_pending_approval(value) {
        return Some(Projection {
            status: TaskStatus::NeedsApproval,
            last_activity_at: json_activity_time(value),
        });
    }

    status_from_json(value, StatusDomain::Session).map(|status| Projection {
        status,
        last_activity_at: json_activity_time(value),
    })
}

fn session_messages_projection(value: &Value) -> Option<Projection> {
    let messages = value.get("messages").and_then(Value::as_array)?;
    if messages.is_empty() {
        return None;
    }
    if let Some(projection) = messages.iter().rev().find_map(message_projection) {
        return Some(projection);
    }
    Some(Projection {
        status: TaskStatus::Done,
        last_activity_at: messages.last().and_then(json_activity_time),
    })
}

fn message_projection(message: &Value) -> Option<Projection> {
    let status = status_from_json(message, StatusDomain::Session)
        .or_else(|| message_error_status(message))?;
    Some(Projection {
        status,
        last_activity_at: json_activity_time(message),
    })
}

fn cron_job_projection(job: &Value) -> Option<Projection> {
    status_from_json(job, StatusDomain::Cron).map(|status| Projection {
        status,
        last_activity_at: json_activity_time(job),
    })
}

fn cron_run_projection(run: &Value) -> Option<Projection> {
    status_from_json(run, StatusDomain::Cron).map(|status| Projection {
        status,
        last_activity_at: json_activity_time(run),
    })
}

#[derive(Debug, Clone, Copy)]
enum StatusDomain {
    Session,
    Cron,
}

fn status_from_json(value: &Value, domain: StatusDomain) -> Option<TaskStatus> {
    let mut statuses = Vec::new();
    collect_status_strings(value, &mut statuses);
    statuses
        .into_iter()
        .find_map(|status| map_runtime_status(&status, domain))
}

fn collect_status_strings(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                if matches!(
                    key.as_str(),
                    "status" | "state" | "phase" | "last_status" | "run_status"
                ) && let Some(status) = value.as_str()
                {
                    out.push(status.to_string());
                }
                collect_status_strings(value, out);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_status_strings(item, out);
            }
        }
        _ => {}
    }
}

fn map_runtime_status(raw: &str, domain: StatusDomain) -> Option<TaskStatus> {
    let normalized = raw.trim().to_ascii_lowercase().replace('-', "_");
    match normalized.as_str() {
        "needs_approval" | "approval_required" | "awaiting_approval" | "pending_approval" => {
            Some(TaskStatus::NeedsApproval)
        }
        "running" | "pending" | "streaming" | "active" | "started" | "in_progress" => {
            Some(TaskStatus::Running)
        }
        "done" | "complete" | "completed" | "success" | "succeeded" | "ok" => {
            Some(TaskStatus::Done)
        }
        "failed" | "failure" | "error" | "errored" | "aborted" | "cancelled" | "canceled" => {
            Some(TaskStatus::Failed)
        }
        "degraded" if matches!(domain, StatusDomain::Cron) => Some(TaskStatus::Failed),
        _ => None,
    }
}

fn message_error_status(value: &Value) -> Option<TaskStatus> {
    let map = value.as_object()?;
    if map
        .get("error")
        .is_some_and(|value| !matches!(value, Value::Null | Value::Bool(false)))
    {
        return Some(TaskStatus::Failed);
    }
    None
}

fn approval_from_value(
    value: &Value,
    connection_id: &str,
    fallback_session_id: &str,
) -> Option<PendingApproval> {
    let candidate = find_approval_value(value)?;
    let request_id = json_string_field(candidate, &["request_id", "id"])?;
    Some(PendingApproval {
        connection_id: connection_id.to_string(),
        request_id,
        session_id: json_string_field(candidate, &["session_id"])
            .unwrap_or_else(|| fallback_session_id.to_string()),
        task_id: None,
        task_title: None,
        tool: json_string_field(candidate, &["tool", "tool_name", "name"]),
        arguments_summary: json_string_field(candidate, &["arguments_summary", "summary", "args"])
            .or_else(|| json_compact_field(candidate, &["arguments", "input"])),
        workspace_root: None,
        agent_alias: json_string_field(candidate, &["agent_alias", "agent"]),
        created_at: json_activity_time(candidate).unwrap_or_else(now_iso),
    })
}

fn find_approval_value(value: &Value) -> Option<&Value> {
    match value {
        Value::Object(map) => {
            if map.contains_key("request_id") && approval_value_is_pending(value) {
                return Some(value);
            }
            for (key, value) in map {
                let key = key.to_ascii_lowercase();
                if key.contains("approval") && approval_value_is_pending(value) {
                    return Some(value);
                }
                if let Some(found) = find_approval_value(value) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => items.iter().find_map(find_approval_value),
        _ => None,
    }
}

fn has_pending_approval(value: &Value) -> bool {
    find_approval_value(value).is_some()
}

fn approval_value_is_pending(value: &Value) -> bool {
    match value {
        Value::Bool(value) => *value,
        Value::String(value) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "pending" | "requested" | "required" | "needs_approval" | "awaiting_approval"
        ),
        Value::Object(map) => {
            if let Some(status) = map.get("status").and_then(Value::as_str) {
                return matches!(
                    status.trim().to_ascii_lowercase().as_str(),
                    "pending" | "requested" | "required" | "needs_approval" | "awaiting_approval"
                );
            }
            !map.contains_key("response")
        }
        Value::Array(items) => items.iter().any(approval_value_is_pending),
        _ => false,
    }
}

fn json_activity_time(value: &Value) -> Option<String> {
    for key in [
        "last_activity_at",
        "last_message_at",
        "updated_at",
        "finished_at",
        "started_at",
        "timestamp",
        "created_at",
        "last_run",
    ] {
        if let Some(value) = json_string_field(value, &[key]) {
            return Some(value);
        }
    }
    None
}

fn json_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    let map = value.as_object()?;
    keys.iter()
        .find_map(|key| map.get(*key).and_then(Value::as_str))
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
}

fn json_compact_field(value: &Value, keys: &[&str]) -> Option<String> {
    let map = value.as_object()?;
    keys.iter()
        .find_map(|key| map.get(*key))
        .and_then(|value| serde_json::to_string(value).ok())
}

fn url_encode_segment(segment: &str) -> String {
    url::form_urlencoded::byte_serialize(segment.as_bytes()).collect()
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
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread::JoinHandle;

    #[test]
    fn maps_chat_state_json_to_task_status() {
        assert_eq!(
            session_state_projection(&json!({ "status": "running" }))
                .unwrap()
                .status,
            TaskStatus::Running
        );
        assert_eq!(
            session_state_projection(&json!({ "approval": { "request_id": "a1" } }))
                .unwrap()
                .status,
            TaskStatus::NeedsApproval
        );
        assert_eq!(
            session_state_projection(&json!({ "state": "completed" }))
                .unwrap()
                .status,
            TaskStatus::Done
        );
        assert_eq!(
            session_state_projection(&json!({ "phase": "aborted" }))
                .unwrap()
                .status,
            TaskStatus::Failed
        );
    }

    #[test]
    fn maps_cron_job_and_latest_run_status() {
        assert_eq!(
            cron_run_projection(&json!({ "status": "pending" }))
                .unwrap()
                .status,
            TaskStatus::Running
        );
        assert_eq!(
            cron_run_projection(&json!({ "status": "success" }))
                .unwrap()
                .status,
            TaskStatus::Done
        );
        assert_eq!(
            cron_run_projection(&json!({ "status": "degraded" }))
                .unwrap()
                .status,
            TaskStatus::Failed
        );
        assert_eq!(
            cron_job_projection(&json!({ "last_status": "error" }))
                .unwrap()
                .status,
            TaskStatus::Failed
        );
    }

    #[test]
    fn accepts_nested_gateway_health_status() {
        assert_eq!(
            health_status_from_json(&json!({
                "health": {
                    "components": {
                        "gateway": {
                            "status": "ok"
                        }
                    }
                }
            }))
            .as_deref(),
            Some("ok")
        );
        assert_eq!(
            health_status_from_json(&json!({ "status": "ready" })).as_deref(),
            Some("ready")
        );
    }

    #[test]
    fn projects_pending_approval_details() {
        let approval = approval_from_value(
            &json!({
                "approval": {
                    "request_id": "approval-1",
                    "session_id": "session-1",
                    "tool": "shell",
                    "arguments_summary": "echo hi",
                    "status": "pending",
                    "created_at": "2026-01-01T00:00:00Z"
                }
            }),
            "conn",
            "fallback",
        )
        .unwrap();

        assert_eq!(approval.connection_id, "conn");
        assert_eq!(approval.request_id, "approval-1");
        assert_eq!(approval.session_id, "session-1");
        assert_eq!(approval.tool.as_deref(), Some("shell"));
    }

    #[tokio::test]
    async fn missing_cron_job_maps_to_failed() {
        let gateway = GatewayTaskClient {
            base_url: "http://127.0.0.1:1".into(),
            token: None,
            client: reqwest::Client::new(),
        };
        let projection = reconcile_cron(&gateway, "missing", &HashMap::new())
            .await
            .unwrap();

        assert_eq!(projection.status, TaskStatus::Failed);
    }

    #[tokio::test]
    async fn failed_session_state_overrides_stale_running_list() {
        let (base_url, server) = spawn_json_server(
            "/api/sessions/session-1/state",
            r#"{"status":"error","updated_at":"2026-01-02T00:00:00Z"}"#,
        );
        let gateway = GatewayTaskClient {
            base_url,
            token: None,
            client: reqwest::Client::new(),
        };
        let mut running_sessions = RunningSessions {
            ids: HashSet::new(),
            available: true,
        };
        running_sessions.ids.insert("session-1".into());

        let projection = reconcile_session(
            &gateway,
            &task("running", TaskStatus::Running),
            "session-1",
            &running_sessions,
        )
        .await
        .unwrap();

        assert_eq!(projection.status, TaskStatus::Failed);
        assert_eq!(
            projection.last_activity_at.as_deref(),
            Some("2026-01-02T00:00:00Z")
        );
        server.join().unwrap();
    }

    #[tokio::test]
    async fn gateway_reconcile_marks_idle_session_with_messages_done() {
        let (base_url, server) = spawn_route_server(vec![
            (
                "/api/health",
                r#"{"health":{"components":{"gateway":{"status":"ok"}}}}"#,
            ),
            ("/api/sessions/running", r#"{"sessions":[]}"#),
            (
                "/api/sessions/session-1/state",
                r#"{"session_id":"session-1","state":"idle"}"#,
            ),
            (
                "/api/sessions/session-1/messages",
                r#"{
                    "messages": [
                        {
                            "role": "user",
                            "content": "hi",
                            "created_at": "2026-01-01T00:00:00Z"
                        },
                        {
                            "role": "assistant",
                            "content": "hello",
                            "created_at": "2026-01-02T00:00:00Z"
                        }
                    ]
                }"#,
            ),
        ]);
        let gateway = GatewayTaskClient {
            base_url,
            token: None,
            client: reqwest::Client::new(),
        };
        gateway.health().await.unwrap();

        let store = crate::workspace::task_state::TaskStateStore::new();
        let mut running = task("running", TaskStatus::Running);
        running.session_id = Some("session-1".into());
        store.upsert(running).await.unwrap();

        let candidates = store.observer_candidates("conn").await.unwrap();
        let projections = build_projections(&gateway, &candidates, None).await;
        assert_eq!(projections.len(), 1);
        assert_eq!(projections[0].status, TaskStatus::Done);
        assert_eq!(
            projections[0].last_activity_at.as_deref(),
            Some("2026-01-02T00:00:00Z")
        );

        let changed = store
            .apply_status_projections("conn", projections)
            .await
            .unwrap();
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].status, TaskStatus::Done);

        let stored = store.list("conn").await.unwrap();
        assert_eq!(stored[0].status, TaskStatus::Done);
        server.join().unwrap();
    }

    #[tokio::test]
    async fn observer_store_update_skips_archived_and_untracked_drafts() {
        let store = crate::workspace::task_state::TaskStateStore::new();
        let mut running = task("running", TaskStatus::Running);
        running.session_id = Some("s1".into());
        store.upsert(running).await.unwrap();
        let mut archived = task("archived", TaskStatus::Archived);
        archived.session_id = Some("s2".into());
        store.upsert(archived).await.unwrap();
        store
            .upsert(task("draft", TaskStatus::Draft))
            .await
            .unwrap();

        let candidates = store.observer_candidates("conn").await.unwrap();
        assert_eq!(
            candidates
                .iter()
                .map(|task| task.id.as_str())
                .collect::<Vec<_>>(),
            vec!["running"]
        );

        let changed = store
            .apply_status_projections(
                "conn",
                vec![
                    TaskStatusProjection {
                        task_id: "running".into(),
                        status: TaskStatus::Done,
                        last_activity_at: Some("2026-01-02T00:00:00Z".into()),
                    },
                    TaskStatusProjection {
                        task_id: "archived".into(),
                        status: TaskStatus::Done,
                        last_activity_at: None,
                    },
                ],
            )
            .await
            .unwrap();

        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].id, "running");
        let tasks = store.list("conn").await.unwrap();
        assert_eq!(
            tasks
                .iter()
                .find(|task| task.id == "archived")
                .unwrap()
                .status,
            TaskStatus::Archived
        );
    }

    #[tokio::test]
    async fn approval_store_is_scoped_by_connection_and_dedupes() {
        let store = ApprovalStateStore::new();
        store
            .replace_connection(
                "conn-a",
                vec![
                    approval("conn-a", "r1"),
                    approval("conn-a", "r1"),
                    approval("conn-a", "r2"),
                ],
            )
            .await;
        store
            .replace_connection("conn-b", vec![approval("conn-b", "r1")])
            .await;

        assert_eq!(store.list(Some("conn-a")).await.len(), 2);
        assert_eq!(store.list(None).await.len(), 3);
        assert_eq!(store.remove("conn-a", "r1").await.len(), 1);
    }

    #[test]
    fn runtime_summary_counts_visible_tasks() {
        let mut running = task("running", TaskStatus::Running);
        running.connection_id = "conn".into();
        let mut approval = task("approval", TaskStatus::NeedsApproval);
        approval.connection_id = "conn".into();
        let mut failed = task("failed", TaskStatus::Failed);
        failed.connection_id = "conn".into();
        let mut archived = task("archived", TaskStatus::Archived);
        archived.connection_id = "conn".into();

        let summary = build_runtime_summary(
            "conn",
            RuntimeSyncStatus::Online,
            true,
            None,
            &[running, approval, failed, archived],
            1,
            2,
        );

        assert_eq!(summary.running_count, 2);
        assert_eq!(summary.failed_count, 1);
        assert_eq!(summary.approval_count, 1);
        assert_eq!(summary.automation_count, 2);
    }

    #[test]
    fn unknown_or_unavailable_shapes_do_not_force_terminal_status() {
        assert!(session_state_projection(&json!({ "phase": "mystery" })).is_none());
        assert!(cron_run_projection(&json!({ "status": "active_idle" })).is_none());
        assert!(session_messages_projection(&json!({ "messages": [] })).is_none());
    }

    #[test]
    fn session_messages_projection_uses_last_message_error() {
        let projection = session_messages_projection(&json!({
            "messages": [
                { "role": "user", "content": "hi", "created_at": "2026-01-01T00:00:00Z" },
                {
                    "role": "assistant",
                    "content": "",
                    "status": "error",
                    "error": "factory: custom provider missing uri",
                    "created_at": "2026-01-02T00:00:00Z"
                }
            ]
        }))
        .unwrap();

        assert_eq!(projection.status, TaskStatus::Failed);
        assert_eq!(
            projection.last_activity_at.as_deref(),
            Some("2026-01-02T00:00:00Z")
        );
    }

    fn task(id: &str, status: TaskStatus) -> StudioTask {
        StudioTask {
            id: id.to_string(),
            connection_id: "conn".into(),
            title: id.into(),
            goal: None,
            session_id: None,
            cron_job_id: None,
            workspace_root: None,
            agent_alias: None,
            mode: crate::workspace::task_state::TaskMode::Chat,
            status,
            tags: Vec::new(),
            pinned_result: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            last_activity_at: None,
            archived_at: None,
        }
    }

    fn approval(connection_id: &str, request_id: &str) -> PendingApproval {
        PendingApproval {
            connection_id: connection_id.into(),
            request_id: request_id.into(),
            session_id: "session".into(),
            task_id: None,
            task_title: None,
            tool: None,
            arguments_summary: None,
            workspace_root: None,
            agent_alias: None,
            created_at: request_id.into(),
        }
    }

    fn spawn_json_server(path: &str, body: &str) -> (String, JoinHandle<()>) {
        spawn_route_server(vec![(path, body)])
    }

    fn spawn_route_server(routes: Vec<(&str, &str)>) -> (String, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let expected_requests = routes.len();
        let routes = routes
            .into_iter()
            .map(|(path, body)| (path.to_string(), body.to_string()))
            .collect::<HashMap<_, _>>();
        let handle = std::thread::spawn(move || {
            for _ in 0..expected_requests {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0_u8; 4096];
                let bytes = stream.read(&mut buffer).unwrap();
                let request = String::from_utf8_lossy(&buffer[..bytes]);
                let path = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .unwrap_or_default();
                let body = routes
                    .get(path)
                    .unwrap_or_else(|| panic!("unexpected request path: {path}"));
                let response = format!(
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                stream.write_all(response.as_bytes()).unwrap();
            }
        });
        (format!("http://{addr}"), handle)
    }
}
