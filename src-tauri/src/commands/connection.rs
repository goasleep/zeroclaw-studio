//! Connection CRUD commands.

use crate::connection::Connection;
use crate::connection::store::SharedConnectionBook;
use tauri::{AppHandle, Runtime, State};
use uuid::Uuid;

#[tauri::command]
pub async fn list_connections(
    book: State<'_, SharedConnectionBook>,
) -> Result<Vec<Connection>, String> {
    Ok(book.list().await)
}

#[tauri::command]
pub async fn get_active_connection(
    book: State<'_, SharedConnectionBook>,
) -> Result<Option<Connection>, String> {
    Ok(book.active().await)
}

#[tauri::command]
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
pub async fn set_active_connection<R: Runtime>(
    app: AppHandle<R>,
    book: State<'_, SharedConnectionBook>,
    id: Option<Uuid>,
) -> Result<(), String> {
    book.set_active(id).await.map_err(|e| e.to_string())?;
    book.save(&app).await.map_err(|e| e.to_string())?;
    Ok(())
}
