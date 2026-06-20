//! Agent workspace file-system commands.
//!
//! These commands intentionally operate on paths relative to
//! `$ZEROCLAW_CONFIG_DIR/agents/<alias>/workspace` (or `~/.zeroclaw` by
//! default). The frontend never receives a command that can read arbitrary
//! filesystem paths.

use anyhow::{Context, Result, anyhow, bail};
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use tokio::fs;

const MAX_ALIAS_LEN: usize = 128;
const MAX_RELATIVE_PATH_LEN: usize = 512;
const MAX_TEXT_FILE_BYTES: u64 = 1_048_576;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AgentWorkspaceAgent {
    pub alias: String,
    pub workspace_path: String,
    pub workspace_exists: bool,
    pub file_count: u32,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AgentWorkspaceEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[tauri::command]
#[specta::specta]
pub async fn agent_workspace_list_agents() -> Result<Vec<AgentWorkspaceAgent>, String> {
    list_agents().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_workspace_list_dir(
    alias: String,
    path: Option<String>,
) -> Result<Vec<AgentWorkspaceEntry>, String> {
    let root = ensure_agent_workspace_root(&alias)
        .await
        .map_err(|e| e.to_string())?;
    let rel = normalize_relative_path(path.as_deref()).map_err(|e| e.to_string())?;
    let dir = root.join(&rel);
    ensure_inside(&root, &dir).map_err(|e| e.to_string())?;
    list_dir(&root, &dir).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_workspace_read_file(alias: String, path: String) -> Result<String, String> {
    let root = ensure_agent_workspace_root(&alias)
        .await
        .map_err(|e| e.to_string())?;
    let rel = normalize_required_relative_path(&path).map_err(|e| e.to_string())?;
    let target = root.join(&rel);
    ensure_inside(&root, &target).map_err(|e| e.to_string())?;
    read_text_file(&target).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_workspace_write_file(
    alias: String,
    path: String,
    content: String,
) -> Result<(), String> {
    if content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "file is too large to save from the workspace UI (limit {} bytes)",
            MAX_TEXT_FILE_BYTES
        ));
    }
    let root = ensure_agent_workspace_root(&alias)
        .await
        .map_err(|e| e.to_string())?;
    let rel = normalize_required_relative_path(&path).map_err(|e| e.to_string())?;
    let target = root.join(&rel);
    ensure_inside(&root, &target).map_err(|e| e.to_string())?;
    write_text_file(&target, &content, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_workspace_create_file(
    alias: String,
    path: String,
    content: String,
) -> Result<(), String> {
    if content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "file is too large to create from the workspace UI (limit {} bytes)",
            MAX_TEXT_FILE_BYTES
        ));
    }
    let root = ensure_agent_workspace_root(&alias)
        .await
        .map_err(|e| e.to_string())?;
    let rel = normalize_required_relative_path(&path).map_err(|e| e.to_string())?;
    let target = root.join(&rel);
    ensure_inside(&root, &target).map_err(|e| e.to_string())?;
    write_text_file(&target, &content, true)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_workspace_create_dir(alias: String, path: String) -> Result<(), String> {
    let root = ensure_agent_workspace_root(&alias)
        .await
        .map_err(|e| e.to_string())?;
    let rel = normalize_required_relative_path(&path).map_err(|e| e.to_string())?;
    let target = root.join(&rel);
    ensure_inside(&root, &target).map_err(|e| e.to_string())?;
    fs::create_dir_all(&target).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_workspace_delete(alias: String, path: String) -> Result<(), String> {
    let root = ensure_agent_workspace_root(&alias)
        .await
        .map_err(|e| e.to_string())?;
    let rel = normalize_required_relative_path(&path).map_err(|e| e.to_string())?;
    let target = root.join(&rel);
    ensure_inside(&root, &target).map_err(|e| e.to_string())?;
    delete_path(&target).await.map_err(|e| e.to_string())
}

async fn list_agents() -> Result<Vec<AgentWorkspaceAgent>> {
    let agents_root = config_dir()?.join("agents");
    fs::create_dir_all(&agents_root).await?;

    let mut read = fs::read_dir(&agents_root)
        .await
        .context("read agents dir")?;
    let mut agents = Vec::new();
    while let Some(entry) = read.next_entry().await.context("read agent entry")? {
        let name = entry.file_name().to_string_lossy().to_string();
        if validate_alias(&name).is_err() {
            continue;
        }
        let file_type = entry.file_type().await.ok();
        if !file_type.is_some_and(|ft| ft.is_dir()) {
            continue;
        }
        let workspace = entry.path().join("workspace");
        let workspace_exists = fs::metadata(&workspace).await.is_ok_and(|m| m.is_dir());
        let file_count = count_files(&workspace).await.unwrap_or(0);
        agents.push(AgentWorkspaceAgent {
            alias: name,
            workspace_path: workspace.to_string_lossy().to_string(),
            workspace_exists,
            file_count,
        });
    }
    agents.sort_by(|a, b| a.alias.cmp(&b.alias));
    Ok(agents)
}

async fn count_files(dir: &Path) -> Result<u32> {
    let mut count = 0;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let mut read = match fs::read_dir(&current).await {
            Ok(read) => read,
            Err(_) => continue,
        };
        while let Some(entry) = read.next_entry().await? {
            let meta = match fs::symlink_metadata(entry.path()).await {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                stack.push(entry.path());
            } else if meta.is_file() {
                count += 1;
            }
        }
    }
    Ok(count)
}

async fn ensure_agent_workspace_root(alias: &str) -> Result<PathBuf> {
    validate_alias(alias)?;
    let root = config_dir()?.join("agents").join(alias).join("workspace");
    fs::create_dir_all(&root).await?;
    Ok(root)
}

fn config_dir() -> Result<PathBuf> {
    for key in ["ZEROCLAW_CONFIG_DIR", "ZEROCLAW_HOME"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(PathBuf::from(trimmed));
            }
        }
    }
    if let Ok(home) = std::env::var("HOME")
        && !home.trim().is_empty()
    {
        return Ok(PathBuf::from(home).join(".zeroclaw"));
    }
    if let Ok(profile) = std::env::var("USERPROFILE")
        && !profile.trim().is_empty()
    {
        return Ok(PathBuf::from(profile).join(".zeroclaw"));
    }
    bail!("could not resolve ZeroClaw config directory");
}

fn validate_alias(alias: &str) -> Result<()> {
    let alias = alias.trim();
    if alias.is_empty() {
        bail!("agent alias is required");
    }
    if alias.len() > MAX_ALIAS_LEN {
        bail!("agent alias is too long");
    }
    if alias == "." || alias == ".." {
        bail!("invalid agent alias");
    }
    if !alias
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        bail!("agent alias may only contain letters, numbers, dots, dashes, and underscores");
    }
    Ok(())
}

fn normalize_required_relative_path(raw: &str) -> Result<PathBuf> {
    let path = normalize_relative_path(Some(raw))?;
    if path.as_os_str().is_empty() {
        bail!("path is required");
    }
    Ok(path)
}

fn normalize_relative_path(raw: Option<&str>) -> Result<PathBuf> {
    let raw = raw.unwrap_or("").trim();
    if raw.len() > MAX_RELATIVE_PATH_LEN {
        bail!("path is too long");
    }
    if raw.is_empty() {
        return Ok(PathBuf::new());
    }
    let path = Path::new(raw);
    if path.is_absolute() {
        bail!("absolute paths are not allowed");
    }
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                bail!("path must stay inside the agent workspace");
            }
        }
    }
    Ok(clean)
}

fn ensure_inside(root: &Path, target: &Path) -> Result<()> {
    let root = std::path::absolute(root)?;
    let target = std::path::absolute(target)?;
    if !target.starts_with(&root) {
        bail!("path must stay inside the agent workspace");
    }
    Ok(())
}

async fn list_dir(root: &Path, dir: &Path) -> Result<Vec<AgentWorkspaceEntry>> {
    let meta = fs::symlink_metadata(dir)
        .await
        .with_context(|| format!("read {}", dir.display()))?;
    if meta.file_type().is_symlink() {
        bail!("symlink directories are not supported");
    }
    if !meta.is_dir() {
        bail!("path is not a directory");
    }

    let mut entries = Vec::new();
    let mut read = fs::read_dir(dir).await.context("read_dir")?;
    while let Some(entry) = read.next_entry().await.context("next_entry")? {
        let meta = match fs::symlink_metadata(entry.path()).await {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        let is_symlink = meta.file_type().is_symlink();
        let is_dir = !is_symlink && meta.is_dir();
        let relative = entry
            .path()
            .strip_prefix(root)
            .unwrap_or(entry.path().as_path())
            .to_string_lossy()
            .to_string();
        entries.push(AgentWorkspaceEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: relative,
            is_dir,
            size: if meta.is_file() {
                Some(meta.len())
            } else {
                None
            },
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));
    Ok(entries)
}

async fn read_text_file(path: &Path) -> Result<String> {
    let meta = fs::symlink_metadata(path)
        .await
        .with_context(|| format!("read {}", path.display()))?;
    if meta.file_type().is_symlink() {
        bail!("symlink files are not supported");
    }
    if !meta.is_file() {
        bail!("path is not a file");
    }
    if meta.len() > MAX_TEXT_FILE_BYTES {
        bail!(
            "file is too large to open in the workspace UI (limit {} bytes)",
            MAX_TEXT_FILE_BYTES
        );
    }
    let bytes = fs::read(path).await?;
    String::from_utf8(bytes).map_err(|e| anyhow!("file is not valid UTF-8: {e}"))
}

async fn write_text_file(path: &Path, content: &str, create_new: bool) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    if let Ok(meta) = fs::symlink_metadata(path).await {
        if meta.file_type().is_symlink() {
            bail!("symlink files are not supported");
        }
        if meta.is_dir() {
            bail!("path is a directory");
        }
        if create_new {
            bail!("file already exists");
        }
    }
    let mut options = fs::OpenOptions::new();
    options.write(true);
    if create_new {
        options.create_new(true);
    } else {
        options.create(true).truncate(true);
    }
    use tokio::io::AsyncWriteExt;
    let mut file = options.open(path).await?;
    file.write_all(content.as_bytes()).await?;
    Ok(())
}

async fn delete_path(path: &Path) -> Result<()> {
    let meta = fs::symlink_metadata(path)
        .await
        .with_context(|| format!("read {}", path.display()))?;
    if meta.file_type().is_symlink() {
        bail!("symlink paths are not supported");
    }
    if meta.is_dir() {
        fs::remove_dir_all(path).await?;
    } else {
        fs::remove_file(path).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alias_validation_blocks_traversal() {
        assert!(validate_alias("default").is_ok());
        assert!(validate_alias("dev-agent_1").is_ok());
        assert!(validate_alias("../secret").is_err());
        assert!(validate_alias("foo/bar").is_err());
        assert!(validate_alias("").is_err());
    }

    #[test]
    fn relative_path_validation_blocks_escape() {
        assert_eq!(
            normalize_relative_path(Some("notes/IDENTITY.md")).unwrap(),
            PathBuf::from("notes").join("IDENTITY.md")
        );
        assert!(normalize_relative_path(Some("../config.toml")).is_err());
        assert!(normalize_relative_path(Some("/tmp/file")).is_err());
    }
}
