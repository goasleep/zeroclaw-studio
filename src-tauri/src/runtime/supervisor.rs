//! Process supervisor for `Lifecycle::Managed` connections.
//!
//! Spawns a `zeroclaw` gateway child process and cleanly shuts it down on app
//! exit. The supervisor only owns processes it spawned itself; attached or
//! user-managed gateways are never killed by this module.

use anyhow::{Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::{
    ShellExt,
    process::{CommandChild, CommandEvent},
};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

const SIDECAR_NAME: &str = "zeroclaw";

/// Resolve the zeroclaw config directory an external GUI-spawned gateway
/// should use. Inner runtimes pass an explicit app-private directory instead.
fn external_config_dir() -> Option<PathBuf> {
    if let Ok(v) = std::env::var("ZEROCLAW_CONFIG_DIR")
        && !v.trim().is_empty()
    {
        return Some(PathBuf::from(v));
    }
    if let Ok(v) = std::env::var("ZEROCLAW_HOME")
        && !v.trim().is_empty()
    {
        return Some(PathBuf::from(v));
    }
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".zeroclaw"))
}

/// Argv passed to the zeroclaw binary to bring up the gateway.
fn spawn_args(port: u16, config_dir: Option<&Path>) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(dir) = config_dir {
        args.push("--config-dir".to_string());
        args.push(dir.to_string_lossy().into_owned());
    }
    args.extend([
        "gateway".to_string(),
        "start".to_string(),
        "-p".to_string(),
        port.to_string(),
    ]);
    args
}

#[derive(Debug, Clone)]
pub enum LaunchKind {
    BundledSidecar,
    ExternalPath(PathBuf),
}

#[derive(Debug, Clone)]
pub struct LaunchSpec {
    pub connection_id: Uuid,
    pub kind: LaunchKind,
    pub port: u16,
    pub config_dir: Option<PathBuf>,
    pub envs: Vec<(String, String)>,
}

impl LaunchSpec {
    pub fn bundled_inner(connection_id: Uuid, port: u16, config_dir: PathBuf) -> Self {
        let config = config_dir.to_string_lossy().into_owned();
        Self {
            connection_id,
            kind: LaunchKind::BundledSidecar,
            port,
            config_dir: Some(config_dir),
            envs: vec![
                ("ZEROCLAW_CONFIG_DIR".to_string(), config.clone()),
                ("ZEROCLAW_HOME".to_string(), config),
            ],
        }
    }

    pub fn external_path(connection_id: Uuid, binary_path: PathBuf, port: u16) -> Self {
        Self {
            connection_id,
            kind: LaunchKind::ExternalPath(binary_path),
            port,
            config_dir: external_config_dir(),
            envs: Vec::new(),
        }
    }

    pub fn display_binary(&self) -> String {
        match &self.kind {
            LaunchKind::BundledSidecar => SIDECAR_NAME.to_string(),
            LaunchKind::ExternalPath(path) => path.to_string_lossy().into_owned(),
        }
    }
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
enum ManagedChild {
    Tokio(Child),
    Sidecar {
        child: CommandChild,
        exit_code: Arc<Mutex<Option<i32>>>,
    },
}

#[derive(Debug)]
struct Managed {
    child: ManagedChild,
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

    pub async fn start<R: Runtime>(&self, app: &AppHandle<R>, spec: LaunchSpec) -> Result<()> {
        let mut guard = self.process.lock().await;
        if guard.is_some() {
            anyhow::bail!("supervisor already has a running process");
        }

        let child = match &spec.kind {
            LaunchKind::BundledSidecar => self.spawn_sidecar(app, &spec)?,
            LaunchKind::ExternalPath(path) => {
                ManagedChild::Tokio(spawn_external(path, &spec).with_context(|| {
                    format!("failed to spawn zeroclaw gateway at {}", path.display())
                })?)
            }
        };

        *guard = Some(Managed { child });
        Ok(())
    }

    pub async fn start_external_path(
        &self,
        connection_id: Uuid,
        binary_path: &Path,
        port: u16,
    ) -> Result<()> {
        let spec = LaunchSpec::external_path(connection_id, binary_path.to_path_buf(), port);
        let mut guard = self.process.lock().await;
        if guard.is_some() {
            anyhow::bail!("supervisor already has a running process");
        }
        *guard = Some(Managed {
            child: ManagedChild::Tokio(spawn_external(binary_path, &spec)?),
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
            Some(m) => match &mut m.child {
                ManagedChild::Tokio(child) => match child.try_wait() {
                    Ok(Some(_status)) => SupervisorStatus::Exited,
                    Ok(None) => SupervisorStatus::Running,
                    Err(_) => SupervisorStatus::Error,
                },
                ManagedChild::Sidecar { exit_code, .. } => {
                    if exit_code.lock().await.is_some() {
                        SupervisorStatus::Exited
                    } else {
                        SupervisorStatus::Running
                    }
                }
            },
        }
    }

    fn spawn_sidecar<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        spec: &LaunchSpec,
    ) -> Result<ManagedChild> {
        let args = spawn_args(spec.port, spec.config_dir.as_deref());
        let mut command = app.shell().sidecar(SIDECAR_NAME)?.args(args);
        for (key, value) in &spec.envs {
            command = command.env(key, value);
        }

        let (mut rx, child) = command
            .spawn()
            .context("failed to spawn bundled zeroclaw sidecar")?;
        let exit_code = Arc::new(Mutex::new(None));
        let exit_code_for_task = exit_code.clone();
        let connection_id = spec.connection_id;
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        log_sidecar_line(connection_id, log::Level::Info, &bytes);
                    }
                    CommandEvent::Stderr(bytes) => {
                        log_sidecar_line(connection_id, log::Level::Warn, &bytes);
                    }
                    CommandEvent::Error(message) => {
                        log::warn!("[gateway:{connection_id}:sidecar] {message}");
                    }
                    CommandEvent::Terminated(payload) => {
                        *exit_code_for_task.lock().await = payload.code;
                        log::info!(
                            "[gateway:{connection_id}:sidecar] terminated code={:?} signal={:?}",
                            payload.code,
                            payload.signal
                        );
                        break;
                    }
                    _ => {}
                }
            }
        });
        Ok(ManagedChild::Sidecar { child, exit_code })
    }

    async fn kill_child(child: ManagedChild, grace: Duration) -> Result<()> {
        match child {
            ManagedChild::Tokio(mut child) => {
                let _ = child.kill().await;
                tokio::time::timeout(grace, child.wait()).await.ok();
            }
            ManagedChild::Sidecar { child, .. } => {
                let _ = child.kill();
                tokio::time::sleep(grace.min(Duration::from_millis(200))).await;
            }
        }
        Ok(())
    }
}

fn spawn_external(binary_path: &Path, spec: &LaunchSpec) -> Result<Child> {
    let mut child = Command::new(binary_path)
        .args(spawn_args(spec.port, spec.config_dir.as_deref()))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    drain_child_streams(&mut child, spec.connection_id);
    Ok(child)
}

fn log_sidecar_line(connection_id: Uuid, level: log::Level, bytes: &[u8]) {
    let line = String::from_utf8_lossy(bytes);
    for part in line.lines().filter(|line| !line.trim().is_empty()) {
        log::log!(level, "[gateway:{connection_id}:sidecar] {part}");
    }
}

/// Hand the child's stdout/stderr to the shared line-drain task pool.
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

    #[tokio::test]
    async fn supervisor_empty_initially() {
        let s = Supervisor::new();
        assert_eq!(s.status().await, SupervisorStatus::Stopped);
    }

    #[tokio::test]
    async fn start_with_nonexistent_binary_errors() {
        let s = Supervisor::new();
        let r = s
            .start_external_path(
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
        let args = spawn_args(42617, None);
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
        let dir = PathBuf::from("/tmp/zeroclaw-inner");
        let args = spawn_args(42618, Some(&dir));
        let config_pos = args
            .iter()
            .position(|arg| arg == "--config-dir")
            .expect("spawn args should explicitly pass --config-dir");
        let gateway_pos = args
            .iter()
            .position(|arg| arg == "gateway")
            .expect("spawn args must include gateway");
        assert!(config_pos < gateway_pos);
        assert_eq!(args[config_pos + 1], "/tmp/zeroclaw-inner");
    }

    #[test]
    fn bundled_inner_launch_spec_uses_private_config_env() {
        let config_dir = PathBuf::from("/tmp/app/inner-zeroclaw");
        let spec = LaunchSpec::bundled_inner(Uuid::new_v4(), 42618, config_dir.clone());
        assert!(matches!(spec.kind, LaunchKind::BundledSidecar));
        assert_eq!(spec.config_dir.as_deref(), Some(config_dir.as_path()));
        assert!(
            spec.envs
                .iter()
                .any(|(key, value)| key == "ZEROCLAW_CONFIG_DIR"
                    && value.ends_with("inner-zeroclaw"))
        );
    }
}
