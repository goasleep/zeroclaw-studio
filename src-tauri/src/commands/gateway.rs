//! Gateway-facing commands: discover local, pair, health.

use crate::connection::discover::{self, DEFAULT_PORT, DiscoveredLocal};
use crate::connection::store::SharedConnectionBook;
use crate::gateway::pair::{self, PairOutcome};
use serde::Serialize;
use tauri::{AppHandle, Runtime, State};
use uuid::Uuid;

#[tauri::command]
#[specta::specta]
pub async fn discover_local_gateway() -> Result<Option<DiscoveredLocal>, String> {
    Ok(discover::probe_local(DEFAULT_PORT).await)
}

#[derive(Debug, Serialize, specta::Type)]
pub struct PairResult {
    pub outcome: String,
    pub token: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn ensure_token<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    id: Uuid,
) -> Result<PairResult, String> {
    let conn = book
        .get(id)
        .await
        .ok_or_else(|| "connection not found".to_string())?;
    let (outcome, token) = pair::ensure_token(&conn, &book)
        .await
        .map_err(|e| e.to_string())?;
    // Persist if a new token was issued.
    if matches!(outcome, PairOutcome::Issued) {
        book.save(&app).await.map_err(|e| e.to_string())?;
    }
    Ok(PairResult {
        outcome: format!("{outcome:?}"),
        token,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn pair_with_code<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    id: Uuid,
    code: String,
) -> Result<String, String> {
    let conn = book
        .get(id)
        .await
        .ok_or_else(|| "connection not found".to_string())?;
    let token = pair::pair_with_code(id, &conn, &code, &book)
        .await
        .map_err(|e| e.to_string())?;
    book.save(&app).await.map_err(|e| e.to_string())?;
    Ok(token)
}
