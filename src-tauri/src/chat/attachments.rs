use std::path::{Path, PathBuf};

use serde::Serialize;

pub const MAX_ATTACHMENT_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ChatCapabilities {
    pub max_attachment_bytes: u64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ChatFileEntry {
    pub path: Option<String>,
    pub data_b64: Option<String>,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub source: String,
}

pub fn capabilities() -> ChatCapabilities {
    ChatCapabilities {
        max_attachment_bytes: MAX_ATTACHMENT_BYTES,
    }
}

pub fn prepare_many(paths: &[String], embed_bytes: bool) -> Result<Vec<ChatFileEntry>, String> {
    paths
        .iter()
        .map(|raw| prepare_one(raw, embed_bytes))
        .collect()
}

fn prepare_one(raw: &str, embed_bytes: bool) -> Result<ChatFileEntry, String> {
    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err(format!(
            "attachment path must be absolute: {}",
            path.display()
        ));
    }
    let meta =
        std::fs::metadata(&path).map_err(|e| format!("cannot access {}: {e}", path.display()))?;
    if !meta.is_file() {
        return Err(format!("not a regular file: {}", path.display()));
    }
    if meta.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!(
            "file too large: {} (limit 10 MB)",
            format_size(meta.len())
        ));
    }
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "upload".to_string());
    let mime_type = mime_from_path(&path);
    if embed_bytes {
        let bytes =
            std::fs::read(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
        Ok(ChatFileEntry {
            path: None,
            data_b64: Some(base64_encode(&bytes)),
            filename,
            mime_type,
            size: meta.len(),
            source: "file".to_string(),
        })
    } else {
        Ok(ChatFileEntry {
            path: Some(path.to_string_lossy().to_string()),
            data_b64: None,
            filename,
            mime_type,
            size: meta.len(),
            source: "file".to_string(),
        })
    }
}

fn mime_from_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "json" => "application/json",
        "csv" => "text/csv",
        "md" | "markdown" => "text/markdown",
        "txt" | "log" | "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "toml" | "yaml" | "yml"
        | "html" | "css" => "text/plain",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::base64_encode;

    #[test]
    fn base64_encoder_handles_padding() {
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
    }
}
