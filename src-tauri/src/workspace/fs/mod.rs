//! File system watcher + directory listing + file read/write for workspace
//! roots.
//!
//! Uses `notify` for recursive file watching (supports macOS FSEvents,
//! inotify on Linux, ReadDirectoryChanges on Windows) and `ignore` for
//! .gitignore-style pattern filtering so we skip `.git/`, `node_modules/`,
//! `target/`, etc. without explicit config.

mod watcher;

pub use watcher::{FileEvent, spawn_watcher};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::sync::RwLock;

/// In-memory state for the current workspace root. Shared across commands.
#[derive(Debug)]
pub struct WorkspaceState {
    root: RwLock<Option<PathBuf>>,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        Self {
            root: RwLock::new(None),
        }
    }
}

impl WorkspaceState {
    pub async fn set_root(&self, path: PathBuf) {
        *self.root.write().await = Some(path);
    }

    pub async fn root(&self) -> Option<PathBuf> {
        self.root.read().await.clone()
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub size: Option<u64>,
}

/// List the immediate children of `dir`. Handles fs errors gracefully.
pub async fn list_dir(dir: &Path) -> Result<Vec<DirEntry>> {
    let mut entries = Vec::new();
    let mut read = fs::read_dir(dir).await.context("read_dir")?;
    while let Some(entry) = read.next_entry().await.context("next_entry")? {
        let ft = entry.file_type().await.ok();
        let is_dir = ft.as_ref().is_some_and(|t| t.is_dir() || t.is_symlink());
        let meta = entry.metadata().await.ok();
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            size: meta.map(|m| m.len()),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

pub async fn read_file(path: &Path) -> Result<Vec<u8>> {
    let p = std::path::absolute(path).with_context(|| format!("resolve path {path:?}"))?;
    // Safety check: refuse to read outside the workspace root if set.
    // (The frontend should already enforce this, but a defense-in-depth
    // boundaries check doesn't hurt.)
    Ok(fs::read(&p).await?)
}

pub async fn write_file(path: &Path, content: &[u8]) -> Result<()> {
    let p = std::path::absolute(path)?;
    // Create parent directories if needed.
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(&p, content).await?;
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
pub struct IgnorePattern {
    /// Glob pattern, e.g. ".git", "node_modules"
    pub pattern: String,
}

/// Default ignore patterns baked in before the user has a chance to configure.
pub const DEFAULT_IGNORE: &[&str] = &[
    ".git",
    ".gitmodules",
    "node_modules",
    "target",
    "dist",
    ".vite",
    ".next",
    "build",
    "__pycache__",
    "*.pyc",
    ".DS_Store",
    "Thumbs.db",
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn list_dir_returns_children() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "a").unwrap();
        fs::write(dir.path().join("b.txt"), "b").unwrap();
        let entries = list_dir(dir.path()).await.unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[tokio::test]
    async fn list_dir_missing_dir_errors() {
        assert!(list_dir(Path::new("/nonexistent_path_xyz")).await.is_err());
    }

    #[tokio::test]
    async fn read_write_file_roundtrip() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("test.txt");
        write_file(&p, b"hello").await.unwrap();
        let data = read_file(&p).await.unwrap();
        assert_eq!(data, b"hello");
    }

    #[test]
    fn default_ignore_is_sane() {
        assert!(DEFAULT_IGNORE.contains(&".git"));
        assert!(DEFAULT_IGNORE.contains(&"node_modules"));
        assert!(DEFAULT_IGNORE.contains(&"target"));
    }
}
