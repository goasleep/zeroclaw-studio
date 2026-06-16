//! Connection CRUD commands.

use crate::connection::Connection;
use crate::connection::activator;
use crate::connection::store::SharedConnectionBook;
use crate::runtime::supervisor::SharedSupervisor;
use tauri::{AppHandle, Runtime, State};
use uuid::Uuid;

#[tauri::command]
#[specta::specta]
pub async fn list_connections(
    book: State<'_, SharedConnectionBook>,
) -> Result<Vec<Connection>, String> {
    Ok(book.list().await)
}

#[tauri::command]
#[specta::specta]
pub async fn get_active_connection(
    book: State<'_, SharedConnectionBook>,
) -> Result<Option<Connection>, String> {
    Ok(book.active().await)
}

#[tauri::command]
#[specta::specta]
pub async fn upsert_connection<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    conn: Connection,
) -> Result<(), String> {
    book.upsert(conn).await;
    book.save(&app).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn remove_connection<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    id: Uuid,
) -> Result<(), String> {
    book.remove(id).await;
    book.save(&app).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_active_connection<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    supervisor: State<'_, SharedSupervisor>,
    id: Option<Uuid>,
) -> Result<(), String> {
    book.set_active(id).await.map_err(|e| e.to_string())?;
    book.save(&app).await.map_err(|e| e.to_string())?;

    // Auto-activate: probe → spawn local if needed → wait healthy → pair.
    // Fire-and-forget; events drive the UI.
    if let Some(id) = id
        && let Some(conn) = book.get(id).await
    {
        let app = app.clone();
        let book = book.inner().clone();
        let supervisor = supervisor.inner().clone();
        tauri::async_runtime::spawn(async move {
            activator::activate(&app, &conn, &book, &supervisor).await;
        });
    }
    Ok(())
}

/// Explicit "re-run activation for the current active connection" command.
/// Exposed so the UI can offer a retry button when activation fails.
#[tauri::command]
#[specta::specta]
pub async fn reactivate<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    supervisor: State<'_, SharedSupervisor>,
) -> Result<(), String> {
    if let Some(conn) = book.active().await {
        let app = app.clone();
        let book = book.inner().clone();
        let supervisor = supervisor.inner().clone();
        tauri::async_runtime::spawn(async move {
            activator::activate(&app, &conn, &book, &supervisor).await;
        });
    }
    Ok(())
}
