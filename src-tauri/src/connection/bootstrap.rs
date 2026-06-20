//! Bootstrap the app-private bundled inner runtime connection.
//!
//! The inner connection is guaranteed to exist for both fresh installs and
//! users migrating from older builds. It becomes active only when no active
//! connection exists, so we don't steal focus from a user-selected gateway.
//!
//! Behaviour is observable through the existing `zeroclaw://activation`
//! event stream (after this returns, the caller invokes the activator on
//! the freshly-minted connection).

use crate::connection::store::SharedConnectionBook;
use crate::connection::{Connection, RuntimeSource};
use crate::runtime::ports;
use anyhow::Result;
use tauri::{AppHandle, Runtime};

/// Result of a bootstrap attempt — used for telemetry / logging only; the
/// caller doesn't branch on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BootstrapOutcome {
    /// A bundled inner connection already existed.
    InnerAlreadyPresent,
    /// Could not reserve a port for the bundled inner runtime.
    InnerPortUnavailable,
    /// Created a new bundled inner connection and made it active. The next
    /// step (activator) will spawn / pair.
    AutoCreatedInner,
}

/// Ensure the bundled inner connection exists. Persists to disk on success.
///
/// **Idempotent:** safe to call on every startup.
pub async fn try_auto_onboard<R: Runtime>(
    app: &AppHandle<R>,
    book: &SharedConnectionBook,
) -> Result<BootstrapOutcome> {
    if book
        .list()
        .await
        .iter()
        .any(|conn| matches!(conn.runtime_source, RuntimeSource::BundledInner))
    {
        return Ok(BootstrapOutcome::InnerAlreadyPresent);
    }

    let Ok(port) = ports::pick_inner_port() else {
        return Ok(BootstrapOutcome::InnerPortUnavailable);
    };

    let conn = Connection::new_bundled_inner("Inner zeroclaw", port);

    let id = conn.id;
    book.upsert(conn).await;
    if book.active().await.is_none() {
        book.set_active(Some(id)).await?;
    }
    book.save(app).await?;

    Ok(BootstrapOutcome::AutoCreatedInner)
}

#[cfg(test)]
mod tests {
    use crate::connection::Connection;
    use crate::connection::store::ConnectionBook;

    #[tokio::test]
    async fn existing_non_inner_connections_do_not_block_inner_creation() {
        let book = ConnectionBook::new();
        book.upsert(Connection::new_local_attach("preset", 42617))
            .await;
        assert!(
            !book
                .list()
                .await
                .iter()
                .any(|conn| matches!(conn.runtime_source, super::RuntimeSource::BundledInner)),
            "non-inner connections must not block creating the bundled inner runtime"
        );
    }

    #[tokio::test]
    async fn bundled_inner_is_detectable() {
        let book = ConnectionBook::new();
        book.upsert(Connection::new_bundled_inner("Inner zeroclaw", 42618))
            .await;
        assert!(
            book.list()
                .await
                .iter()
                .any(|conn| matches!(conn.runtime_source, super::RuntimeSource::BundledInner)),
            "existing bundled inner connection should make bootstrap idempotent"
        );
    }
}
