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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
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

        let child = Command::new(binary_path)
            .args(["gateway", "--port", &port.to_string()])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("failed to spawn zeroclaw gateway")?;

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
            eprintln!(
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
            .args(["gateway", "--port", &port.to_string()])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(new_child) => {
                managed.child = new_child;
                managed.restarts.push(std::time::Instant::now());
                true
            }
            Err(e) => {
                eprintln!("[supervisor] restart failed: {e}");
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

/// Helper: shutdown supervisor on app exit.
pub async fn shutdown_on_exit(supervisor: SharedSupervisor) {
    let _ = supervisor.stop().await;
    eprintln!("[supervisor] managed process shut down");
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
}
