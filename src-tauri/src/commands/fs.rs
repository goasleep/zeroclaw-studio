//! Workspace file-system commands.

use crate::workspace::fs::{self, DirEntry, WorkspaceState};
use crate::workspace::local_state::{SharedLocalStateStore, WorkspaceLocalState};
use notify::{RecommendedWatcher, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Runtime, State};
use tokio::process::Command;
use tokio::sync::Mutex;

/// Live watcher handle. Stored so a `workspace_watch_stop` can drop it.
#[derive(Default)]
pub struct WatcherHandle {
    inner: Mutex<Option<RecommendedWatcher>>,
}

pub type SharedWatcher = Arc<WatcherHandle>;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WorkspaceGitStatus {
    pub root: String,
    pub is_repo: bool,
    pub branch: Option<String>,
    pub changed_count: u32,
    pub diff_stat: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_open_root<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Arc<WorkspaceState>>,
    local_state: State<'_, SharedLocalStateStore>,
    connection_id: String,
    path: String,
) -> Result<WorkspaceLocalState, String> {
    state.set_root(PathBuf::from(&path)).await;
    let snapshot = local_state
        .remember_root(&connection_id, path)
        .await
        .map_err(|e| e.to_string())?;
    local_state.save(&app).await.map_err(|e| e.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_get_state<R: Runtime>(
    app: AppHandle<R>,
    local_state: State<'_, SharedLocalStateStore>,
    connection_id: String,
) -> Result<WorkspaceLocalState, String> {
    let snapshot = local_state
        .snapshot(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    local_state.save(&app).await.map_err(|e| e.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_import_legacy_state<R: Runtime>(
    app: AppHandle<R>,
    local_state: State<'_, SharedLocalStateStore>,
    connection_id: String,
    current_root: Option<String>,
    recent_roots: Vec<String>,
) -> Result<WorkspaceLocalState, String> {
    let snapshot = local_state
        .import_workspace_state(&connection_id, current_root, recent_roots)
        .await
        .map_err(|e| e.to_string())?;
    local_state.save(&app).await.map_err(|e| e.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_get_root(
    state: State<'_, Arc<WorkspaceState>>,
) -> Result<Option<String>, String> {
    Ok(state.root().await.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    fs::list_dir(std::path::Path::new(&path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_read_file(path: String) -> Result<String, String> {
    let bytes = fs::read_file(std::path::Path::new(&path))
        .await
        .map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_write_file(path: String, content: String) -> Result<(), String> {
    fs::write_file(std::path::Path::new(&path), content.as_bytes())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_watch_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Arc<WorkspaceState>>,
    watcher: State<'_, SharedWatcher>,
    path: Option<String>,
) -> Result<(), String> {
    let target = match path {
        Some(p) => PathBuf::from(p),
        None => state
            .root()
            .await
            .ok_or_else(|| "no workspace root selected".to_string())?,
    };

    // Stop the previous watcher (drop releases the OS resource).
    let mut guard = watcher.inner.lock().await;
    if let Some(mut w) = guard.take() {
        let _ = w.unwatch(&target);
    }

    let new_watcher = fs::spawn_watcher(&target, app);
    *guard = Some(new_watcher);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_watch_stop(watcher: State<'_, SharedWatcher>) -> Result<(), String> {
    let mut guard = watcher.inner.lock().await;
    guard.take();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_git_status(root: String) -> Result<WorkspaceGitStatus, String> {
    Ok(git_status_for_root(root).await)
}

async fn git_status_for_root(root: String) -> WorkspaceGitStatus {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() || !git_is_repo(&root_path).await {
        return WorkspaceGitStatus {
            root,
            is_repo: false,
            branch: None,
            changed_count: 0,
            diff_stat: None,
        };
    }

    let mut branch = git_output(&root_path, &["branch", "--show-current"])
        .await
        .filter(|s| !s.is_empty());
    if branch.is_none() {
        // Detached HEAD fallback is best-effort and intentionally quiet.
        branch = git_output(&root_path, &["rev-parse", "--short", "HEAD"])
            .await
            .filter(|s| !s.is_empty());
    }
    let status = git_output(&root_path, &["status", "--porcelain"])
        .await
        .unwrap_or_default();
    let diff_stat = git_output(&root_path, &["diff", "--stat"])
        .await
        .filter(|s| !s.is_empty());

    WorkspaceGitStatus {
        root,
        is_repo: true,
        branch,
        changed_count: count_changed_lines(&status),
        diff_stat,
    }
}

async fn git_is_repo(root: &std::path::Path) -> bool {
    git_output(root, &["rev-parse", "--is-inside-work-tree"])
        .await
        .is_some_and(|s| s == "true")
}

async fn git_output(root: &std::path::Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn count_changed_lines(status: &str) -> u32 {
    status
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u32
}

#[cfg(test)]
mod git_tests {
    use super::*;

    #[test]
    fn count_changed_lines_ignores_blank_rows() {
        assert_eq!(count_changed_lines(" M src/main.rs\n\n?? new.txt\n"), 2);
    }

    #[tokio::test]
    async fn non_repo_returns_quiet_status() {
        let dir = tempfile::tempdir().unwrap();
        let status = git_status_for_root(dir.path().to_string_lossy().to_string()).await;
        assert!(!status.is_repo);
        assert_eq!(status.changed_count, 0);
    }
}
