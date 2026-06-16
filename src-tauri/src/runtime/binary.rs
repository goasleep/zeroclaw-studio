//! Local `zeroclaw` binary detection.
//!
//! Search order:
//!   1. `$PATH` (via `which`)
//!   2. `~/.cargo/bin/zeroclaw`
//!   3. `$XDG_BIN_HOME/zeroclaw`
//!   4. Well-known install paths from upstream `install.sh` (`/usr/local/bin`)
//!   5. Tauri bundled sidecar (future — not enabled in Phase 1)
//!
//! Returns the first hit. Reports the resolved path and `zeroclaw --version`
//! so the UI can show it.

use anyhow::{Context, Result};
use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DetectedBinary {
    pub path: PathBuf,
    pub version: Option<String>,
}

fn candidate_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(home) = dirs_home() {
        out.push(home.join(".cargo").join("bin").join("zeroclaw"));
    }
    if let Ok(xdg) = std::env::var("XDG_BIN_HOME") {
        out.push(PathBuf::from(xdg).join("zeroclaw"));
    } else if let Some(home) = dirs_home() {
        out.push(home.join(".local").join("bin").join("zeroclaw"));
    }
    out.push(PathBuf::from("/usr/local/bin/zeroclaw"));
    out.push(PathBuf::from("/opt/homebrew/bin/zeroclaw"));
    out
}

/// Minimal HOME lookup so we don't pull in the `dirs` crate just for this.
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Search for a usable `zeroclaw` binary. Returns `Ok(None)` if nothing was
/// found — that is a normal state for remote-only users, not an error.
pub async fn detect() -> Result<Option<DetectedBinary>> {
    // 1. $PATH
    if let Ok(p) = which::which("zeroclaw") {
        let version = read_version(&p).await.ok();
        return Ok(Some(DetectedBinary { path: p, version }));
    }
    // 2-4. Well-known paths.
    for cand in candidate_paths() {
        if cand.is_file() && is_executable(&cand) {
            let version = read_version(&cand).await.ok();
            return Ok(Some(DetectedBinary {
                path: cand,
                version,
            }));
        }
    }
    Ok(None)
}

#[cfg(unix)]
fn is_executable(p: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(p)
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(p: &std::path::Path) -> bool {
    p.extension().and_then(|s| s.to_str()) == Some("exe")
}

async fn read_version(path: &std::path::Path) -> Result<String> {
    let out = Command::new(path)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
        .context("invoke zeroclaw --version")?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_paths_includes_homebrew() {
        let paths = candidate_paths();
        assert!(
            paths
                .iter()
                .any(|p| p.ends_with("opt/homebrew/bin/zeroclaw"))
        );
    }

    #[tokio::test]
    async fn detect_returns_ok_even_when_missing() {
        // The function must never error just because zeroclaw isn't installed —
        // remote-only users rely on this returning Ok(None).
        let _ = detect().await.expect("detect should never error");
    }
}
