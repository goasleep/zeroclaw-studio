//! Commands for background runtime observer projections.

use crate::chat::session_manager::ChatSessionManager;
use crate::workspace::task_observer::{
    ApprovalDecision, ApprovalStateStore, PendingApproval, RuntimeSummary, RuntimeSummaryStore,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime, State};

#[tauri::command]
#[specta::specta]
pub async fn runtime_summaries_list(
    summaries: State<'_, Arc<RuntimeSummaryStore>>,
) -> Result<Vec<RuntimeSummary>, String> {
    Ok(summaries.list().await)
}

#[tauri::command]
#[specta::specta]
pub async fn approval_list(
    approvals: State<'_, Arc<ApprovalStateStore>>,
    connection_id: Option<String>,
) -> Result<Vec<PendingApproval>, String> {
    Ok(approvals.list(connection_id.as_deref()).await)
}

#[tauri::command]
#[specta::specta]
pub async fn approval_respond<R: Runtime>(
    app: AppHandle<R>,
    manager: State<'_, Arc<ChatSessionManager>>,
    approvals: State<'_, Arc<ApprovalStateStore>>,
    connection_id: String,
    session_id: String,
    request_id: String,
    decision: ApprovalDecision,
) -> Result<(), String> {
    let frame = serde_json::json!({
        "type": "approval_response",
        "request_id": request_id,
        "decision": approval_decision_wire(decision),
    })
    .to_string();
    manager.send(&session_id, frame).await?;
    let updated = approvals.remove(&connection_id, &request_id).await;
    let _ = app.emit(
        crate::workspace::task_observer::APPROVALS_UPDATED_EVENT,
        crate::workspace::task_observer::ApprovalsUpdatedEvent {
            connection_id,
            approvals: updated,
        },
    );
    Ok(())
}

fn approval_decision_wire(decision: ApprovalDecision) -> &'static str {
    match decision {
        ApprovalDecision::Approve => "approve",
        ApprovalDecision::Deny => "deny",
        ApprovalDecision::Always => "always",
    }
}
