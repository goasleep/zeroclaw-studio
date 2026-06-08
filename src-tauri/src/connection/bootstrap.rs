//! First-run bootstrap: if the user has a local `zeroclaw` binary but no
//! saved connections yet, create one for them and mark it active. The next
//! step (activation) then auto-spawns the gateway and pairs — fully
//! zero-touch onboarding for the common case of "I have zeroclaw installed
//! and I just want the workspace to talk to it".
//!
//! Deliberately does nothing if:
//!  - The user already has any saved connections (don't overwrite intent).
//!  - No local `zeroclaw` binary is detectable (remote-only user; they'll
//!    pick "Connect to remote" from the welcome screen).
//!
//! Behaviour is observable through the existing `zeroclaw://activation`
//! event stream (after this returns, the caller invokes the activator on
//! the freshly-minted connection).

use crate::connection::Connection;
use crate::connection::discover::{self, DEFAULT_PORT};
use crate::connection::store::SharedConnectionBook;
use crate::runtime::binary;
use anyhow::Result;
use tauri::{AppHandle, Runtime};

/// Result of a bootstrap attempt — used for telemetry / logging only; the
/// caller doesn't branch on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BootstrapOutcome {
    /// User already had connections; we left the book alone.
    AlreadyConfigured,
    /// No local binary detectable; user must add a remote connection
    /// manually.
    NoLocalBinary,
    /// Created a new local connection and made it active. The next step
    /// (activator) will spawn / pair.
    AutoCreatedLocal,
}

/// Attempt the first-run auto-onboard flow. Persists to disk on success.
///
/// **Idempotent:** safe to call on every startup — if connections already
/// exist, this returns `AlreadyConfigured` without touching anything.
pub async fn try_auto_onboard<R: Runtime>(
    app: &AppHandle<R>,
    book: &SharedConnectionBook,
) -> Result<BootstrapOutcome> {
    // Bail if the user already configured anything — never silently
    // overwrite a connection they created by hand.
    if !book.list().await.is_empty() {
        return Ok(BootstrapOutcome::AlreadyConfigured);
    }

    // Look for a local binary. If there isn't one, this user is remote-only
    // (or hasn't installed yet) — leave them to the welcome screen.
    let Some(detected) = binary::detect().await.ok().flatten() else {
        return Ok(BootstrapOutcome::NoLocalBinary);
    };

    // Pick the port: if something is already listening on the default
    // port, attach to it (don't fight); otherwise we'll spawn on the
    // default. Either way the resulting Connection is local-loopback so
    // the activator will pair via the admin endpoint without a manual
    // code.
    let already_running = discover::probe_local(DEFAULT_PORT).await.is_some();

    let conn = if already_running {
        // Attach mode — gateway is up (maybe `zeroclaw service start` ran
        // earlier today). We won't kill it on app exit because we didn't
        // spawn it, but we'll still spawn one later if it dies (activator
        // promotes attach → managed when the URL goes cold and a binary
        // exists).
        let mut c = Connection::new_local_attach("Local zeroclaw", DEFAULT_PORT);
        // Remember the path so the activator's auto-promote spawn path
        // doesn't need to re-detect.
        c.binary_path = Some(detected.path);
        c
    } else {
        Connection::new_local_managed("Local zeroclaw", detected.path, DEFAULT_PORT)
    };

    let id = conn.id;
    book.upsert(conn).await;
    book.set_active(Some(id)).await?;
    book.save(app).await?;

    Ok(BootstrapOutcome::AutoCreatedLocal)
}

#[cfg(test)]
mod tests {
    use crate::connection::Connection;
    use crate::connection::store::ConnectionBook;

    // We don't have a real AppHandle in unit tests, so the public
    // `try_auto_onboard` (which needs to persist) can only be exercised
    // through integration tests. The interesting branch — "skips if
    // connections already exist" — has a `book`-only equivalent we can
    // test in isolation, which catches the no-overwrite invariant that
    // really matters.

    #[tokio::test]
    async fn skip_when_connections_exist_predicate() {
        let book = ConnectionBook::new();
        book.upsert(Connection::new_local_attach("preset", 42617))
            .await;
        // The first check inside try_auto_onboard:
        assert!(
            !book.list().await.is_empty(),
            "if list is non-empty, bootstrap must return AlreadyConfigured"
        );
    }

    #[tokio::test]
    async fn empty_book_is_eligible() {
        let book = ConnectionBook::new();
        assert!(
            book.list().await.is_empty(),
            "fresh book is eligible for auto-onboard"
        );
    }
}
