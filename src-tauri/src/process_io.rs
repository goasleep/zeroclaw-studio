//! Shared helpers for draining child-process stdout/stderr into the log.
//!
//! Child pipes **must** be drained: if a child fills the OS pipe buffer
//! (~64 KB) and nothing reads it, the child's next write stalls and the
//! process effectively deadlocks. Every managed child (`ssh`, the
//! supervised gateway) takes its `stdout`/`stderr` via `child.stdout.take()`
//! and hands them here so the buffer always has a reader.

use tokio::io::{AsyncBufReadExt, BufReader};

/// Spawn a background task that reads `stream` line-by-line and logs each
/// line at `level` under `label` (e.g. `"ssh:<uuid>"`). `None` streams are a
/// no-op.
pub fn spawn_line_drain<S>(stream: Option<S>, label: String, level: log::Level)
where
    S: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    let Some(stream) = stream else { return };
    tokio::spawn(async move {
        let mut lines = BufReader::new(stream).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::log!(level, "[{label}] {line}");
        }
    });
}
