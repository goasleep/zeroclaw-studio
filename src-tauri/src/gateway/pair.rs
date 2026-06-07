//! Auto-pairing helpers.
//!
//! Ported from `apps/tauri/src/lib.rs::auto_pair` (lines 21-55, dual
//! MIT/Apache-2.0). Adapted to operate against a `Connection` reference
//! and persist tokens via `ConnectionBook`.

use crate::connection::store::SharedConnectionBook;
use crate::connection::{Connection, Lifecycle};
use crate::gateway::client::GatewayClient;
use anyhow::Result;
use uuid::Uuid;

/// Outcome of an auto-pair attempt against a connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairOutcome {
    /// Gateway disabled pairing — no token required.
    NotRequired,
    /// We already had a valid token; reused it.
    ReusedExisting,
    /// We minted a fresh token and persisted it.
    Issued,
    /// Pairing is required but we cannot self-mint (remote / non-managed).
    NeedsManual,
    /// Gateway unreachable at the moment.
    Unreachable,
}

/// Attempt to ensure the connection has a valid bearer token. Returns the
/// token if one is available afterwards; persists any newly-issued tokens
/// via the connection book.
pub async fn ensure_token(
    conn: &Connection,
    book: &SharedConnectionBook,
) -> Result<(PairOutcome, Option<String>)> {
    if conn.url.is_empty() {
        return Ok((PairOutcome::Unreachable, None));
    }

    let unauth = GatewayClient::new(&conn.url, None);
    let requires = match unauth.requires_pairing().await {
        Ok(b) => b,
        Err(_) => return Ok((PairOutcome::Unreachable, None)),
    };

    if !requires {
        return Ok((PairOutcome::NotRequired, None));
    }

    // Try existing token first.
    if let Some(ref token) = conn.auth.token {
        let authed = GatewayClient::new(&conn.url, Some(token));
        if authed.validate_token().await.unwrap_or(false) {
            return Ok((PairOutcome::ReusedExisting, Some(token.clone())));
        }
    }

    // Try to self-mint via the localhost admin endpoint. Only Managed
    // connections are guaranteed to be on localhost; Attach may be too,
    // but Remote definitely isn't.
    let can_self_mint = matches!(conn.lifecycle, Lifecycle::Managed | Lifecycle::Attach)
        && (conn.url.starts_with("http://127.0.0.1") || conn.url.starts_with("http://localhost"));

    if !can_self_mint {
        return Ok((PairOutcome::NeedsManual, None));
    }

    match unauth.auto_pair().await {
        Ok(token) => {
            book.set_token(conn.id, Some(token.clone())).await?;
            Ok((PairOutcome::Issued, Some(token)))
        }
        Err(_) => Ok((PairOutcome::NeedsManual, None)),
    }
}

/// Submit a manually-entered pairing code (UI flow for remote / non-loopback
/// connections where `auto_pair` can't reach the localhost admin endpoint).
pub async fn pair_with_code(
    conn_id: Uuid,
    conn: &Connection,
    code: &str,
    book: &SharedConnectionBook,
) -> Result<String> {
    let client = GatewayClient::new(&conn.url, None);
    let token = client.pair_with_code(code).await?;
    book.set_token(conn_id, Some(token.clone())).await?;
    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connection::Connection;
    use crate::connection::store::ConnectionBook;

    #[tokio::test]
    async fn unreachable_url_returns_unreachable() {
        let book = ConnectionBook::new();
        let conn = Connection::new_local_attach("dead", 1);
        let (o, t) = ensure_token(&conn, &book).await.unwrap();
        assert_eq!(o, PairOutcome::Unreachable);
        assert!(t.is_none());
    }

    #[tokio::test]
    async fn empty_url_returns_unreachable() {
        let book = ConnectionBook::new();
        let mut conn = Connection::new_local_attach("no-url", 42617);
        conn.url = String::new();
        let (o, _) = ensure_token(&conn, &book).await.unwrap();
        assert_eq!(o, PairOutcome::Unreachable);
    }
}
