//! Connection management — the unit the UI manages.
//!
//! A `Connection` describes "which zeroclaw gateway am I talking to and how
//! do I reach it". Multiple saved connections, switchable like SSH hosts in
//! an IDE.
//!
//! Three lifecycle modes:
//! - `Managed`: workspace spawns and owns a local `zeroclaw` process.
//! - `Attach`: gateway is already running (local service, container) — we
//!   just connect, never spawn, never kill.
//! - `Remote`: gateway lives elsewhere (URL, SSH-tunneled, Tailscale).

pub mod activator;
pub mod bootstrap;
pub mod discover;
pub mod ssh;
pub mod store;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Transport {
    /// Direct loopback (`http://127.0.0.1:PORT`).
    Local,
    /// Direct HTTP(S) to a hostname.
    Http,
    /// SSH-tunneled (workspace runs `ssh -L ...` and points local to the tunnel).
    Ssh,
    /// Tailscale-routed (semantically `Http` over MagicDNS; kept separate for UI).
    Tailscale,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Lifecycle {
    /// We spawn `zeroclaw` ourselves and own its lifetime.
    Managed,
    /// Gateway is already running — we never spawn, never kill.
    Attach,
    /// Gateway lives on a different host; lifecycle is owned remotely.
    Remote,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SshConfig {
    pub host: String,
    pub user: String,
    pub port: Option<u16>,
    /// Path to the SSH private key. `None` falls back to ssh-agent / default ids.
    pub key_path: Option<PathBuf>,
    /// Gateway port on the REMOTE host (default 42617).
    pub remote_port: u16,
    /// Local port the workspace forwards to. `None` → pick an ephemeral port.
    pub local_forward_port: Option<u16>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMode {
    /// Use the gateway's pairing flow to mint a fresh token.
    Pairing,
    /// User supplied a token directly.
    Token,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub mode: AuthMode,
    /// Stored bearer token. Persisted alongside the connection (Phase 2 will
    /// move this to OS keychain).
    pub token: Option<String>,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            mode: AuthMode::Pairing,
            token: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: Uuid,
    pub name: String,
    pub transport: Transport,
    /// Gateway base URL as seen FROM the workspace. For SSH connections this
    /// is `http://127.0.0.1:<local_forward_port>` (set after tunnel comes up).
    pub url: String,
    pub ssh: Option<SshConfig>,
    pub auth: AuthConfig,
    pub lifecycle: Lifecycle,
    /// For `Lifecycle::Managed` connections only.
    pub binary_path: Option<PathBuf>,
}

impl Connection {
    /// Build a managed-local connection at the default port.
    pub fn new_local_managed(name: impl Into<String>, binary_path: PathBuf, port: u16) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            transport: Transport::Local,
            url: format!("http://127.0.0.1:{port}"),
            ssh: None,
            auth: AuthConfig::default(),
            lifecycle: Lifecycle::Managed,
            binary_path: Some(binary_path),
        }
    }

    /// Build a local-attach connection (gateway already running on this machine).
    pub fn new_local_attach(name: impl Into<String>, port: u16) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            transport: Transport::Local,
            url: format!("http://127.0.0.1:{port}"),
            ssh: None,
            auth: AuthConfig::default(),
            lifecycle: Lifecycle::Attach,
            binary_path: None,
        }
    }

    /// Build a remote HTTP(S) connection.
    pub fn new_remote_http(name: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            transport: Transport::Http,
            url: url.into(),
            ssh: None,
            auth: AuthConfig::default(),
            lifecycle: Lifecycle::Remote,
            binary_path: None,
        }
    }

    /// Build a remote SSH-tunneled connection. The `url` is filled in after the
    /// tunnel is opened (see `ssh::ensure_tunnel`).
    pub fn new_remote_ssh(name: impl Into<String>, ssh: SshConfig) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            transport: Transport::Ssh,
            // Filled in by ssh::ensure_tunnel once the forward is up.
            url: String::new(),
            ssh: Some(ssh),
            auth: AuthConfig::default(),
            lifecycle: Lifecycle::Remote,
            binary_path: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_managed_defaults() {
        let c = Connection::new_local_managed(
            "My Mac",
            PathBuf::from("/usr/local/bin/zeroclaw"),
            42617,
        );
        assert_eq!(c.transport, Transport::Local);
        assert_eq!(c.lifecycle, Lifecycle::Managed);
        assert_eq!(c.url, "http://127.0.0.1:42617");
        assert!(c.binary_path.is_some());
    }

    #[test]
    fn local_attach_no_binary() {
        let c = Connection::new_local_attach("Service", 42617);
        assert_eq!(c.lifecycle, Lifecycle::Attach);
        assert!(c.binary_path.is_none());
    }

    #[test]
    fn remote_http() {
        let c = Connection::new_remote_http("Homelab", "https://pi.tailnet.ts.net:42617");
        assert_eq!(c.transport, Transport::Http);
        assert_eq!(c.lifecycle, Lifecycle::Remote);
    }

    #[test]
    fn remote_ssh_url_empty_until_tunnel() {
        let ssh = SshConfig {
            host: "pi".into(),
            user: "fp".into(),
            port: None,
            key_path: None,
            remote_port: 42617,
            local_forward_port: None,
        };
        let c = Connection::new_remote_ssh("Pi", ssh);
        assert_eq!(c.transport, Transport::Ssh);
        assert!(
            c.url.is_empty(),
            "url is set by ssh::ensure_tunnel after forward comes up"
        );
    }

    #[test]
    fn connection_roundtrip_json() {
        let c = Connection::new_local_attach("test", 42617);
        let s = serde_json::to_string(&c).unwrap();
        let c2: Connection = serde_json::from_str(&s).unwrap();
        assert_eq!(c.id, c2.id);
        assert_eq!(c.name, c2.name);
    }
}
