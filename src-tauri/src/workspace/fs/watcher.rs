//! Recursive file-system watcher backed by `notify`.
//!
//! Emits Tauri events (`workspace://fs-changed`) so the file tree panel
//! updates live when files change outside the app.
//!
//! Uses `ignore::gitignore` for pattern filtering. This respects
//! `.gitignore` and our `DEFAULT_IGNORE` list.

use crate::workspace::fs::DEFAULT_IGNORE;
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Debug, Clone, Serialize)]
pub struct FileEvent {
    pub path: String,
    pub kind: &'static str,
}

/// Build a combined ignore matcher from our defaults + any `.gitignore` found
/// at the workspace root.
fn build_ignore_matcher(root: &Path) -> Gitignore {
    let mut builder = GitignoreBuilder::new(root);

    // Default ignores.
    for pat in DEFAULT_IGNORE {
        let _ = builder.add_line(None, pat);
    }

    // Project-level .gitignore, if one exists.
    let _ = builder.add(root.join(".gitignore"));

    builder
        .build()
        .unwrap_or_else(|_| Gitignore::empty())
}

/// Spawn a `notify` watcher on `root`. All emitted events are filtered
/// through the ignore matcher before being forwarded to the frontend.
pub fn spawn_watcher<R: Runtime>(
    root: &Path,
    app: AppHandle<R>,
) -> RecommendedWatcher {
    let ignore = Arc::new(build_ignore_matcher(root));
    let root = root.to_path_buf();

    let (tx, rx) = std::sync::mpsc::channel::<Result<notify::Event, notify::Error>>();

    let mut watcher = RecommendedWatcher::new(tx, Config::default()).expect("create watcher");
    let _ = watcher.watch(&root, RecursiveMode::Recursive);

    let ignore_clone = ignore;
    tauri::async_runtime::spawn(async move {
        for res in rx {
            let ev = match res {
                Ok(e) => e,
                Err(_) => continue,
            };
            for p in &ev.paths {
                let rel = p.strip_prefix(&root).unwrap_or(p);
                let rel_str = rel.to_string_lossy();

                // Check against ignore patterns.
                if ignore_clone.matched(rel, false).is_ignore() {
                    continue;
                }

                let kind = match ev.kind {
                    EventKind::Create(_) => "created",
                    EventKind::Modify(_) => "modified",
                    EventKind::Remove(_) => "removed",
                    _ => "other",
                };

                let _ = app.emit(
                    "workspace://fs-changed",
                    FileEvent {
                        path: rel_str.to_string(),
                        kind,
                    },
                );
            }
        }
    });
    watcher
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn default_ignores_are_included() {
        let root = std::env::temp_dir();
        let ig = build_ignore_matcher(&root);
        assert!(ig.matched(".git", false).is_ignore());
        assert!(ig.matched("node_modules", false).is_ignore());
        assert!(!ig.matched("src/main.rs", false).is_ignore());
    }

    #[test]
    fn gitignore_is_respected() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".gitignore"), b"*.log").unwrap();
        let ig = build_ignore_matcher(dir.path());
        assert!(ig.matched("app.log", false).is_ignore());
        assert!(!ig.matched("app.rs", false).is_ignore());
    }
}