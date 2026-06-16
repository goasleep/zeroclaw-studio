//! Process supervisor for `Lifecycle::Managed` connections.
//!
//! Spawns a `zeroclaw` gateway child process, monitors health, restarts
//! with exponential backoff, and cleanly shuts down on app exit.
//!
//! **Ownership tracking:** the supervisor only owns process it spawned
//! itself. It never touches a process it didn't start. On app exit it
//! kills only its own managed processes.

use anyhow::{Context, Result};
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

const MAX_RESTARTS: u32 = 5;
const RESTART_WINDOW: Duration = Duration::from_secs(60);
const BASE_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

/// Resolve the zeroclaw config directory the GUI-spawned gateway should use.
///
/// GUI apps don't reliably inherit the same shell env as a terminal. Passing
/// `--config-dir` explicitly prevents the spawned gateway from booting with an
/// empty/default config while the CLI correctly sees `~/.zeroclaw/config.toml`.
fn config_dir() -> Option<String> {
    if let Ok(v) = std::env::var("ZEROCLAW_CONFIG_DIR")
        && !v.trim().is_empty()
    {
        return Some(v);
    }
    if let Ok(v) = std::env::var("ZEROCLAW_HOME")
        && !v.trim().is_empty()
    {
        return Some(v);
    }
    std::env::var("HOME")
        .ok()
        .map(|home| format!("{home}/.zeroclaw"))
}

/// Argv passed to the zeroclaw binary to bring up the gateway.
///
/// Centralised so the `start` and `ensure_running` spawn sites stay in
/// lockstep — see the regression test below; an earlier version drifted
/// to `gateway --port N`, which is rejected by `zeroclaw 0.8+` because
/// `gateway` requires a subcommand.
fn spawn_args(port: u16) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(dir) = config_dir() {
        args.push("--config-dir".to_string());
        args.push(dir);
    }
    args.extend([
        "gateway".to_string(),
        "start".to_string(),
        "-p".to_string(),
        port.to_string(),
    ]);
    args
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
pub enum SupervisorStatus {
    Stopped,
    Running,
    Exited,
    Backoff,
    Error,
}

#[derive(Debug)]
struct Managed {
    connection_id: Uuid,
    child: Child,
    // Timestamps of recent restarts for rate-limiting.
    restarts: Vec<std::time::Instant>,
}

#[derive(Debug, Default)]
pub struct Supervisor {
    process: Mutex<Option<Managed>>,
}

pub type SharedSupervisor = Arc<Supervisor>;

impl Supervisor {
    pub fn new() -> SharedSupervisor {
        Arc::new(Self::default())
    }

    /// Spawn the gateway process. The binary, port, and any args come from
    /// the connection's stored config (already resolved by the caller).
    pub async fn start(
        &self,
        connection_id: Uuid,
        binary_path: &std::path::Path,
        port: u16,
    ) -> Result<()> {
        let mut guard = self.process.lock().await;
        if guard.is_some() {
            anyhow::bail!("supervisor already has a running process");
        }

        let mut child = Command::new(binary_path)
            .args(spawn_args(port))
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("failed to spawn zeroclaw gateway")?;

        // Drain stdout/stderr into the log. Piped streams with no reader will
        // fill the OS buffer (~64 KB) and stall the gateway; draining also
        // surfaces boot errors instead of a silent crash-loop.
        drain_child_streams(&mut child, connection_id);

        *guard = Some(Managed {
            connection_id,
            child,
            restarts: vec![std::time::Instant::now()],
        });
        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        let mut guard = self.process.lock().await;
        let managed = guard.take();
        if let Some(m) = managed {
            Self::kill_child(m.child, std::time::Duration::from_secs(5)).await?;
        }
        Ok(())
    }

    pub async fn status(&self) -> SupervisorStatus {
        let mut guard = self.process.lock().await;
        match guard.as_mut() {
            None => SupervisorStatus::Stopped,
            Some(m) => match m.child.try_wait() {
                Ok(Some(_status)) => SupervisorStatus::Exited,
                Ok(None) => SupervisorStatus::Running,
                Err(_) => SupervisorStatus::Error,
            },
        }
    }

    /// Try to restart if the current process has exited. Returns true if
    /// the process is running after this call (either was all along or was
    /// restarted).
    pub async fn ensure_running(&self, binary_path: &std::path::Path, port: u16) -> bool {
        let mut guard = self.process.lock().await;
        let managed = match guard.as_mut() {
            None => return false,
            Some(m) => m,
        };
        match managed.child.try_wait() {
            Ok(Some(_status)) => { /* exited, fall through to restart */ }
            Ok(None) => return true, // still running
            Err(_) => { /* error, will restart */ }
        }

        // Rate-limit restarts.
        let now = std::time::Instant::now();
        managed
            .restarts
            .retain(|t| now.duration_since(*t) < RESTART_WINDOW);

        if managed.restarts.len() >= MAX_RESTARTS as usize {
            log::warn!(
                "[supervisor] too many restarts for {}",
                managed.connection_id
            );
            return false;
        }

        // Exponential backoff.
        let backoff = BASE_BACKOFF
            .checked_mul(2u32.pow(managed.restarts.len() as u32))
            .unwrap_or(MAX_BACKOFF)
            .min(MAX_BACKOFF);
        tokio::time::sleep(backoff).await;

        match Command::new(binary_path)
            .args(spawn_args(port))
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(mut new_child) => {
                drain_child_streams(&mut new_child, managed.connection_id);
                managed.child = new_child;
                managed.restarts.push(std::time::Instant::now());
                true
            }
            Err(e) => {
                log::error!("[supervisor] restart failed: {e}");
                false
            }
        }
    }

    async fn kill_child(mut child: Child, grace: Duration) -> Result<()> {
        let _ = child.kill().await;
        tokio::time::timeout(grace, child.wait()).await.ok();
        Ok(())
    }
}

/// Hand the child's stdout/stderr to the shared line-drain task pool.
///
/// Takes the pipes out of `child` so they have a reader; otherwise a chatty
/// gateway would fill its pipe buffer and block. stdout → info, stderr → warn.
fn drain_child_streams(child: &mut Child, connection_id: Uuid) {
    crate::process_io::spawn_line_drain(
        child.stdout.take(),
        format!("gateway:{connection_id}:out"),
        log::Level::Info,
    );
    crate::process_io::spawn_line_drain(
        child.stderr.take(),
        format!("gateway:{connection_id}:err"),
        log::Level::Warn,
    );
}

/// Helper: shutdown supervisor on app exit.
pub async fn shutdown_on_exit(supervisor: SharedSupervisor) {
    let _ = supervisor.stop().await;
    log::info!("[supervisor] managed process shut down");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn supervisor_empty_initially() {
        let s = Supervisor::new();
        assert_eq!(s.status().await, SupervisorStatus::Stopped);
    }

    #[tokio::test]
    async fn start_with_nonexistent_binary_errors() {
        let s = Supervisor::new();
        let r = s
            .start(
                Uuid::new_v4(),
                PathBuf::from("/nonexistent/zeroclaw").as_path(),
                42617,
            )
            .await;
        assert!(r.is_err());
    }

    #[tokio::test]
    async fn stop_when_stopped_is_ok() {
        let s = Supervisor::new();
        s.stop().await.unwrap();
    }

    #[test]
    fn spawn_args_uses_gateway_start_subcommand() {
        // Regression: `gateway --port N` was rejected by zeroclaw 0.8+
        // because `gateway` requires a subcommand. The correct form is
        // `gateway start -p N`. Pin both the subcommand and the short
        // flag here.
        let args = spawn_args(42617);
        let gateway_pos = args
            .iter()
            .position(|arg| arg == "gateway")
            .expect("spawn args must include gateway subcommand");
        assert_eq!(args[gateway_pos + 1], "start");
        assert_eq!(args[gateway_pos + 2], "-p");
        assert_eq!(args[gateway_pos + 3], "42617");
    }

    #[test]
    fn spawn_args_passes_config_dir_before_command_when_available() {
        let args = spawn_args(42617);
        if let Some(dir) = config_dir() {
            let config_pos = args
                .iter()
                .position(|arg| arg == "--config-dir")
                .expect("spawn args should explicitly pass --config-dir");
            let gateway_pos = args
                .iter()
                .position(|arg| arg == "gateway")
                .expect("spawn args must include gateway");
            assert!(
                config_pos < gateway_pos,
                "global flags must precede command"
            );
            assert_eq!(args[config_pos + 1], dir);
        }
    }
}
