//! App-log commands for the Tauri shell/backend process.

use serde::Serialize;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const DEFAULT_LINE_LIMIT: usize = 200;
const MAX_LINE_LIMIT: usize = 1000;
const MAX_TAIL_BYTES: u64 = 1_000_000;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AppLogEntry {
    pub timestamp: String,
    pub severity_text: String,
    pub target: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AppLogTail {
    pub path: String,
    pub entries: Vec<AppLogEntry>,
}

#[tauri::command]
#[specta::specta]
pub async fn app_log_tail<R: Runtime>(
    app: AppHandle<R>,
    limit: Option<usize>,
) -> Result<AppLogTail, String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let log_path = latest_log_file(&log_dir).map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(DEFAULT_LINE_LIMIT).clamp(1, MAX_LINE_LIMIT);
    let lines = read_tail_lines(&log_path, limit).map_err(|e| e.to_string())?;
    let entries = lines
        .into_iter()
        .map(|line| parse_log_line(&line))
        .collect::<Vec<_>>();

    Ok(AppLogTail {
        path: log_path.to_string_lossy().to_string(),
        entries,
    })
}

fn latest_log_file(log_dir: &Path) -> std::io::Result<PathBuf> {
    let mut newest: Option<(PathBuf, std::time::SystemTime)> = None;
    for entry in fs::read_dir(log_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("log") {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if newest
            .as_ref()
            .is_none_or(|(_, newest_modified)| modified > *newest_modified)
        {
            newest = Some((path, modified));
        }
    }
    newest
        .map(|(path, _)| path)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "app log file not found"))
}

fn read_tail_lines(path: &Path, limit: usize) -> std::io::Result<Vec<String>> {
    let mut file = fs::File::open(path)?;
    let len = file.metadata()?.len();
    let start = len.saturating_sub(MAX_TAIL_BYTES);
    file.seek(SeekFrom::Start(start))?;

    let mut text = String::new();
    file.read_to_string(&mut text)?;
    if start > 0
        && let Some((_, rest)) = text.split_once('\n')
    {
        text = rest.to_string();
    }

    let mut lines = text
        .lines()
        .rev()
        .take(limit)
        .map(str::to_string)
        .collect::<Vec<_>>();
    lines.reverse();
    Ok(lines)
}

fn parse_log_line(line: &str) -> AppLogEntry {
    let Some((date, rest)) = take_bracket(line) else {
        return fallback_entry(line);
    };
    let Some((time, rest)) = take_bracket(rest) else {
        return fallback_entry(line);
    };
    let Some((target, rest)) = take_bracket(rest) else {
        return fallback_entry(line);
    };
    let Some((level, message)) = take_bracket(rest) else {
        return fallback_entry(line);
    };

    AppLogEntry {
        timestamp: format!("{date}T{time}"),
        severity_text: level.to_string(),
        target: target.to_string(),
        message: message.trim_start().to_string(),
    }
}

fn take_bracket(input: &str) -> Option<(&str, &str)> {
    let rest = input.strip_prefix('[')?;
    let end = rest.find(']')?;
    Some((&rest[..end], &rest[end + 1..]))
}

fn fallback_entry(line: &str) -> AppLogEntry {
    AppLogEntry {
        timestamp: String::new(),
        severity_text: "INFO".to_string(),
        target: "backend".to_string(),
        message: line.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_backend_log_line() {
        let entry =
            parse_log_line("[2026-06-21][11:30:55][reqwest::connect][DEBUG] starting connection");

        assert_eq!(entry.timestamp, "2026-06-21T11:30:55");
        assert_eq!(entry.target, "reqwest::connect");
        assert_eq!(entry.severity_text, "DEBUG");
        assert_eq!(entry.message, "starting connection");
    }
}
