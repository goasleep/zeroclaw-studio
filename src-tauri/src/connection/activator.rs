//! Connection activation orchestrator.
//!
//! When a connection becomes the active one — either at app startup, after
//! the user picks it in the picker, or after it was just created — this
//! module owns the "make it ready to use" workflow:
//!
//! 1. probe gateway health
//! 2. if down and we have a local binary, spawn it
//! 3. wait for /health to flip
//! 4. ensure_token (pairing flow if needed)
//!
//! Each step is reported via a callback so the UI can show progress
//! without polling.

use crate::connection::store::SharedConnectionBook;
use crate::connection::{Connection, Lifecycle, Transport};
use crate::gateway::client::GatewayClient;
use crate::gateway::pair::{self, PairOutcome};
use crate::runtime::binary;
use crate::runtime::supervisor::SharedSupervisor;
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

/// Lifecycle of an activation attempt, surfaced to the frontend as a
/// `zeroclaw://activation` event payload.
///
/// `serde` produces tagged JSON so the frontend can dispatch on `type`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ActivationStep {
    /// Workflow started — fired exactly once at the top.
    Started {
        connection_id: Uuid,
    },
    Probing,
    StartingGateway {
        binary_path: String,
    },
    AwaitingHealthy,
    Pairing,
    Ready,
    /// Lifecycle is Managed (or auto-promoted Attach) but no binary was
    /// detected — UI should offer the install path.
    BinaryMissing,
    /// Remote gateway requires pairing but we cannot self-mint via the
    /// localhost admin endpoint. UI surfaces a code prompt.
    NeedsManualPairing,
    Failed {
        message: String,
    },
}

const HEALTH_TIMEOUT: Duration = Duration::from_secs(15);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(300);

/// Activate the given connection. Returns Ok regardless of outcome — the
/// outcome is reported via emitted events. Errors are reserved for
/// genuinely unexpected failures (e.g. event emission itself failing).
pub async fn activate<R: Runtime>(
    app: &AppHandle<R>,
    conn: &Connection,
    book: &SharedConnectionBook,
    supervisor: &SharedSupervisor,
) {
    let emit = |step: ActivationStep| {
        let _ = app.emit("zeroclaw://activation", &step);
    };

    emit(ActivationStep::Started {
        connection_id: conn.id,
    });

    // Connections without a resolved URL (e.g. SSH tunnel not yet up) can't
    // be probed — surface and bail. UI is expected to call ssh_open_tunnel
    // first; remote-attach connections always have a URL.
    if conn.url.is_empty() {
        emit(ActivationStep::Failed {
            message: "connection has no resolved URL (open SSH tunnel first?)".into(),
        });
        return;
    }

    // Step 1: probe.
    emit(ActivationStep::Probing);
    let client = GatewayClient::new(&conn.url, None);
    let already_healthy = client.get_health().await.unwrap_or(false);

    // Step 2: spawn if not running AND we have a path to a local binary.
    if !already_healthy {
        match resolve_local_binary(conn).await {
            LocalSpawn::Spawn(binary_path, port) => {
                emit(ActivationStep::StartingGateway {
                    binary_path: binary_path.to_string_lossy().into(),
                });
                if let Err(e) = supervisor.start(conn.id, &binary_path, port).await {
                    // "supervisor already has a running process" is benign —
                    // some other activation is in flight or finished — fall
                    // through to health-wait below.
                    let msg = e.to_string();
                    if !msg.contains("already has a running process") {
                        emit(ActivationStep::Failed { message: msg });
                        return;
                    }
                }

                // Step 3: wait for /health.
                emit(ActivationStep::AwaitingHealthy);
                if !wait_healthy(&client).await {
                    emit(ActivationStep::Failed {
                        message: format!(
                            "gateway did not become healthy on {} within {}s",
                            conn.url,
                            HEALTH_TIMEOUT.as_secs()
                        ),
                    });
                    return;
                }
            }
            LocalSpawn::CannotSpawnRemote => {
                emit(ActivationStep::Failed {
                    message: format!(
                        "gateway at {} is not reachable (workspace cannot start remote gateways)",
                        conn.url
                    ),
                });
                return;
            }
            LocalSpawn::BinaryMissing => {
                emit(ActivationStep::BinaryMissing);
                return;
            }
        }
    }

    // Step 4: ensure_token / pair.
    emit(ActivationStep::Pairing);
    // Reload from book in case the URL/token was just updated upstream.
    let refreshed = book.get(conn.id).await.unwrap_or_else(|| conn.clone());
    match pair::ensure_token(&refreshed, book).await {
        Ok((outcome, _)) => match outcome {
            PairOutcome::NotRequired | PairOutcome::ReusedExisting | PairOutcome::Issued => {
                emit(ActivationStep::Ready)
            }
            PairOutcome::NeedsManual => emit(ActivationStep::NeedsManualPairing),
            PairOutcome::Unreachable => emit(ActivationStep::Failed {
                message: "gateway became unreachable during pairing".into(),
            }),
        },
        Err(e) => emit(ActivationStep::Failed {
            message: format!("pairing failed: {e}"),
        }),
    }
}

/// Outcome of "can / should we spawn a local zeroclaw for this connection?"
enum LocalSpawn {
    /// Yes — spawn this binary on this port.
    Spawn(PathBuf, u16),
    /// No — connection points at a remote URL we can't control.
    CannotSpawnRemote,
    /// We should be able to spawn but no binary was found anywhere on PATH.
    BinaryMissing,
}

async fn resolve_local_binary(conn: &Connection) -> LocalSpawn {
    // Spawning only makes sense for local-loopback URLs.
    let is_local_url =
        conn.url.starts_with("http://127.0.0.1") || conn.url.starts_with("http://localhost");
    if !is_local_url || !matches!(conn.transport, Transport::Local) {
        return LocalSpawn::CannotSpawnRemote;
    }

    // Lifecycle::Remote should never reach this branch (those aren't local
    // URLs), but be explicit.
    if matches!(conn.lifecycle, Lifecycle::Remote) {
        return LocalSpawn::CannotSpawnRemote;
    }

    // Prefer the binary the connection was created with; otherwise re-run
    // detection (covers `attach` connections and the case where the user
    // installed zeroclaw after creating the connection).
    let path = match &conn.binary_path {
        Some(p) if p.exists() => p.clone(),
        _ => match binary::detect().await.ok().flatten() {
            Some(detected) => detected.path,
            None => return LocalSpawn::BinaryMissing,
        },
    };

    let port = url_port(&conn.url).unwrap_or(crate::connection::discover::DEFAULT_PORT);
    LocalSpawn::Spawn(path, port)
}

fn url_port(url: &str) -> Option<u16> {
    url::Url::parse(url).ok().and_then(|u| u.port())
}

async fn wait_healthy(client: &GatewayClient) -> bool {
    let deadline = tokio::time::Instant::now() + HEALTH_TIMEOUT;
    while tokio::time::Instant::now() < deadline {
        if client.get_health().await.unwrap_or(false) {
            return true;
        }
        tokio::time::sleep(HEALTH_POLL_INTERVAL).await;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn resolve_returns_cannot_spawn_for_remote_http() {
        let c = Connection::new_remote_http("Pi", "https://pi.local:42617");
        assert!(matches!(
            resolve_local_binary(&c).await,
            LocalSpawn::CannotSpawnRemote
        ));
    }

    #[tokio::test]
    async fn resolve_returns_binary_missing_when_path_invalid_and_undetected() {
        // Force a missing binary path and rely on detect() returning None
        // when PATH+well-known locations don't have zeroclaw. On dev
        // machines this test is best-effort; we skip the assertion when a
        // binary IS detectable.
        let mut c = Connection::new_local_managed("test", PathBuf::from("/nope/zeroclaw"), 42617);
        c.binary_path = Some(PathBuf::from("/definitely/not/a/binary"));
        let detected = binary::detect().await.ok().flatten();
        match resolve_local_binary(&c).await {
            LocalSpawn::BinaryMissing => assert!(
                detected.is_none(),
                "BinaryMissing only valid when no detect-hit"
            ),
            LocalSpawn::Spawn(p, _) => assert!(detected.is_some() && p == detected.unwrap().path),
            LocalSpawn::CannotSpawnRemote => panic!("local URL must be spawnable"),
        }
    }

    #[test]
    fn url_port_parses_loopback() {
        assert_eq!(url_port("http://127.0.0.1:42617"), Some(42617));
        assert_eq!(url_port("http://localhost"), None);
    }
}
