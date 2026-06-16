//! SSH tunnel orchestration for remote-attached connections.
//!
//! Uses the system `ssh` binary with `-L <local>:127.0.0.1:<remote>` for port
//! forwarding. This keeps our binary small (no russh dependency yet) and
//! works with the user's existing ssh-agent / ~/.ssh/config.
//!
//! A more native implementation (russh) is a Phase-6+ option if pain shows.

use crate::connection::SshConfig;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::net::{SocketAddr, TcpListener};
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

/// Picks a free port on 127.0.0.1 by binding ephemeral, recording, and dropping.
fn pick_free_port() -> Result<u16> {
    let listener =
        TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).context("bind ephemeral port")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

/// A live SSH tunnel owned by the workspace.
#[derive(Debug)]
pub struct Tunnel {
    pub connection_id: Uuid,
    pub local_port: u16,
    child: Child,
}

impl Tunnel {
    /// Kill the underlying `ssh` process on drop.
    pub async fn shutdown(mut self) {
        let _ = self.child.kill().await;
    }
}

/// Tracks all open tunnels keyed by connection id. Cheap clone (Arc).
#[derive(Debug, Clone, Default)]
pub struct TunnelRegistry {
    inner: Arc<Mutex<HashMap<Uuid, Tunnel>>>,
}

impl TunnelRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Open a tunnel for `(connection_id, ssh)` if not already open. Returns
    /// the local URL the workspace should use as the gateway base URL.
    pub async fn ensure_tunnel(&self, connection_id: Uuid, ssh: &SshConfig) -> Result<String> {
        let mut map = self.inner.lock().await;
        if let Some(t) = map.get(&connection_id) {
            return Ok(format!("http://127.0.0.1:{}", t.local_port));
        }

        let local_port = match ssh.local_forward_port {
            Some(p) => p,
            None => pick_free_port()?,
        };

        let target = match &ssh.user {
            u if u.is_empty() => ssh.host.clone(),
            u => format!("{u}@{}", ssh.host),
        };

        let mut cmd = Command::new("ssh");
        cmd.arg("-N") // no remote command
            .arg("-T") // no TTY
            .arg("-o")
            .arg("ServerAliveInterval=30")
            .arg("-o")
            .arg("ExitOnForwardFailure=yes")
            .arg("-o")
            .arg("StrictHostKeyChecking=accept-new")
            .arg("-L")
            .arg(format!(
                "127.0.0.1:{local_port}:127.0.0.1:{}",
                ssh.remote_port
            ));

        if let Some(port) = ssh.port {
            cmd.arg("-p").arg(port.to_string());
        }
        if let Some(key) = &ssh.key_path {
            cmd.arg("-i").arg(key);
        }
        cmd.arg(&target);

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        // Don't inherit stdin — ssh would try to read from terminal.
        cmd.stdin(Stdio::null());

        let mut child = cmd.spawn().context("spawn ssh")?;

        // Drain both streams into the log. A misconfigured host produces a
        // useful error message instead of a silent failure, and draining is
        // required anyway — ssh writing to a full pipe buffer would block and
        // stall the forward.
        crate::process_io::spawn_line_drain(
            child.stdout.take(),
            format!("ssh:{connection_id}"),
            log::Level::Info,
        );
        crate::process_io::spawn_line_drain(
            child.stderr.take(),
            format!("ssh:{connection_id}"),
            log::Level::Warn,
        );

        // Poll the local port for a few seconds until the forward is accepted.
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            if tokio::time::Instant::now() > deadline {
                let _ = child.kill().await;
                anyhow::bail!("ssh tunnel did not come up within 10s");
            }
            if tokio::net::TcpStream::connect(("127.0.0.1", local_port))
                .await
                .is_ok()
            {
                break;
            }
            if let Ok(Some(_status)) = child.try_wait() {
                anyhow::bail!("ssh exited before tunnel was ready");
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }

        map.insert(
            connection_id,
            Tunnel {
                connection_id,
                local_port,
                child,
            },
        );
        Ok(format!("http://127.0.0.1:{local_port}"))
    }

    /// Tear down a tunnel.
    pub async fn close(&self, connection_id: Uuid) {
        let mut map = self.inner.lock().await;
        if let Some(tunnel) = map.remove(&connection_id) {
            tunnel.shutdown().await;
        }
    }

    /// Close every active tunnel — called on app exit.
    pub async fn shutdown_all(&self) {
        let mut map = self.inner.lock().await;
        for (_id, tunnel) in map.drain() {
            tunnel.shutdown().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_free_port_returns_nonzero() {
        let p = pick_free_port().unwrap();
        assert!(p > 1024);
    }

    #[tokio::test]
    async fn registry_default_is_empty() {
        let r = TunnelRegistry::new();
        assert_eq!(r.inner.lock().await.len(), 0);
    }
}
