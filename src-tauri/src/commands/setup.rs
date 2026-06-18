//! Local setup and doctor commands.
//!
//! This module intentionally keeps executable operations behind a static
//! allowlist. Frontend callers select a known action id; they never provide a
//! program or argument list to execute.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::time;

const SHORT_TIMEOUT: Duration = Duration::from_secs(8);
const ACTION_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SetupCapabilityId {
    BrowserAgentBrowser,
    PythonSkills,
    DockerRuntime,
    SandboxBackend,
    McpStdio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SetupActionId {
    BrowserInstallAgentBrowser,
    BrowserInstallChromeForTesting,
    DockerPullAlpine,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SetupCheckStatus {
    Pass,
    Warn,
    Fail,
    Info,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SetupOverallStatus {
    Ready,
    NeedsAction,
    Manual,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SetupContext {
    pub capability_id: SetupCapabilityId,
    pub config_prefix: String,
    pub alias: Option<String>,
    pub mcp_transport: Option<String>,
    pub mcp_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SetupActionRequest {
    pub action_id: SetupActionId,
    pub context: SetupContext,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SetupStatus {
    pub capability_id: SetupCapabilityId,
    pub title: String,
    pub summary: String,
    pub overall: SetupOverallStatus,
    pub checks: Vec<SetupCheck>,
    pub actions: Vec<SetupAction>,
    pub remediations: Vec<SetupRemediation>,
    pub config_recommendations: Vec<SetupConfigRecommendation>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SetupCheck {
    pub id: String,
    pub label: String,
    pub status: SetupCheckStatus,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SetupAction {
    pub id: SetupActionId,
    pub label: String,
    pub description: String,
    pub command: Vec<String>,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SetupRemediation {
    pub title: String,
    pub body: String,
    pub commands: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SetupConfigRecommendation {
    pub id: String,
    pub label: String,
    pub description: String,
    pub path: String,
    pub value: SetupConfigValue,
    pub merge: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum SetupConfigValue {
    Bool(bool),
    String(String),
    StringArray(Vec<String>),
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SetupActionResult {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Copy)]
struct CommandSpec {
    program: &'static str,
    args: &'static [&'static str],
}

#[tauri::command]
#[specta::specta]
pub async fn setup_get_status(context: SetupContext) -> Result<SetupStatus, String> {
    Ok(match context.capability_id {
        SetupCapabilityId::BrowserAgentBrowser => browser_status().await,
        SetupCapabilityId::PythonSkills => python_status(&context).await,
        SetupCapabilityId::DockerRuntime => docker_status(&context).await,
        SetupCapabilityId::SandboxBackend => sandbox_status(&context).await,
        SetupCapabilityId::McpStdio => mcp_stdio_status(&context).await,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn setup_run_action(req: SetupActionRequest) -> Result<SetupActionResult, String> {
    let spec = allowlisted_action_command(req.action_id, req.context.capability_id)
        .ok_or_else(|| "action is not allowed for this capability".to_string())?;
    run_action(spec).await
}

async fn browser_status() -> SetupStatus {
    let node = version_check("node", &["--version"]).await;
    let npm = version_check("npm", &["--version"]).await;
    let agent_browser = version_check("agent-browser", &["--version"]).await;
    let chrome = chrome_for_testing_check();

    let mut checks = vec![
        node.check("node", "Node.js"),
        npm.check("npm", "npm"),
        agent_browser.check("agent_browser", "agent-browser CLI"),
        chrome,
    ];
    let mut actions = Vec::new();
    let mut remediations = Vec::new();

    let npm_ok = checks
        .iter()
        .any(|c| c.id == "npm" && c.status == SetupCheckStatus::Pass);
    let agent_ok = checks
        .iter()
        .any(|c| c.id == "agent_browser" && c.status == SetupCheckStatus::Pass);
    let chrome_ok = checks
        .iter()
        .any(|c| c.id == "chrome_for_testing" && c.status == SetupCheckStatus::Pass);

    if !npm_ok {
        remediations.push(SetupRemediation {
            title: "Install Node.js and npm".into(),
            body:
                "Node.js is a system dependency, so Setup Center will not install it automatically."
                    .into(),
            commands: platform_node_install_commands(),
        });
    }
    if npm_ok && !agent_ok {
        actions.push(action(
            SetupActionId::BrowserInstallAgentBrowser,
            "Install agent-browser",
            "Installs the browser automation CLI in user npm global scope.",
            &["npm", "install", "-g", "agent-browser"],
        ));
    }
    if agent_ok && !chrome_ok {
        actions.push(action(
            SetupActionId::BrowserInstallChromeForTesting,
            "Install Chrome for Testing",
            "Lets agent-browser install its browser runtime without sudo.",
            &["agent-browser", "install"],
        ));
    }
    if !agent_ok && !chrome_ok {
        checks.push(SetupCheck {
            id: "chrome_install_waiting".into(),
            label: "Chrome install path".into(),
            status: SetupCheckStatus::Info,
            detail: "Install agent-browser first, then run its browser installer.".into(),
        });
    }

    let overall = overall_from_checks(&checks, !actions.is_empty(), !remediations.is_empty());
    SetupStatus {
        capability_id: SetupCapabilityId::BrowserAgentBrowser,
        title: "Browser agent-browser".into(),
        summary: "Checks the Node/npm toolchain, agent-browser CLI, and browser runtime.".into(),
        overall,
        checks,
        actions,
        remediations,
        config_recommendations: vec![],
    }
}

async fn python_status(context: &SetupContext) -> SetupStatus {
    let python3 = version_check("python3", &["--version"]).await;
    let python = version_check("python", &["--version"]).await;
    let mut checks = vec![
        python3.check("python3", "python3"),
        python.check("python", "python"),
    ];
    let mut remediations = Vec::new();
    let mut config_recommendations = Vec::new();

    let has_python = checks.iter().any(|c| c.status == SetupCheckStatus::Pass);
    if !has_python {
        remediations.push(SetupRemediation {
            title: "Install Python".into(),
            body: "Python is a system dependency. Install it manually, then return here to re-run checks.".into(),
            commands: platform_python_install_commands(),
        });
    }

    if let Some(alias) = clean_alias(context.alias.as_deref()) {
        config_recommendations.push(SetupConfigRecommendation {
            id: "allow_python_commands".into(),
            label: "Allow Python commands".into(),
            description: "Append python3 and python to this risk profile's allowed_commands."
                .into(),
            path: format!("risk_profiles.{alias}.allowed_commands"),
            value: SetupConfigValue::StringArray(vec!["python3".into(), "python".into()]),
            merge: Some("append_unique_string_array".into()),
        });
    } else {
        checks.push(SetupCheck {
            id: "risk_profile".into(),
            label: "Risk profile target".into(),
            status: SetupCheckStatus::Warn,
            detail: "Open a risk profile alias to apply the allowed_commands recommendation."
                .into(),
        });
    }

    let overall = overall_from_checks(&checks, false, !remediations.is_empty());
    SetupStatus {
        capability_id: SetupCapabilityId::PythonSkills,
        title: "Python skills".into(),
        summary: "Checks local Python availability and prepares the selected risk profile for Python-based skills.".into(),
        overall,
        checks,
        actions: vec![],
        remediations,
        config_recommendations,
    }
}

async fn docker_status(context: &SetupContext) -> SetupStatus {
    let docker = version_check("docker", &["--version"]).await;
    let daemon = command_probe("docker", &["info", "--format", "{{.ServerVersion}}"]).await;
    let mut checks = vec![
        docker.check("docker_cli", "Docker CLI"),
        daemon.check("docker_daemon", "Docker daemon"),
    ];
    let mut actions = Vec::new();
    let mut remediations = Vec::new();
    let mut config_recommendations = Vec::new();

    let cli_ok = checks
        .iter()
        .any(|c| c.id == "docker_cli" && c.status == SetupCheckStatus::Pass);
    let daemon_ok = checks
        .iter()
        .any(|c| c.id == "docker_daemon" && c.status == SetupCheckStatus::Pass);

    if !cli_ok {
        remediations.push(SetupRemediation {
            title: "Install Docker".into(),
            body: "Docker installation is system-level. Install Docker Desktop or the Docker Engine manually.".into(),
            commands: platform_docker_install_commands(),
        });
    } else if !daemon_ok {
        remediations.push(SetupRemediation {
            title: "Start Docker".into(),
            body: "The docker CLI is present, but the daemon is not reachable. Start Docker Desktop or your Docker service.".into(),
            commands: vec![vec!["docker".into(), "info".into()]],
        });
    } else {
        actions.push(action(
            SetupActionId::DockerPullAlpine,
            "Pull alpine:3.20",
            "Verifies image pulls against the active Docker daemon.",
            &["docker", "pull", "alpine:3.20"],
        ));
        let path = if context.config_prefix.trim().is_empty() {
            "runtime.kind".to_string()
        } else {
            format!(
                "{}.kind",
                context.config_prefix.trim().trim_end_matches('.')
            )
        };
        config_recommendations.push(SetupConfigRecommendation {
            id: "runtime_kind_docker".into(),
            label: "Use Docker runtime".into(),
            description: "Set this runtime profile kind to docker.".into(),
            path,
            value: SetupConfigValue::String("docker".into()),
            merge: None,
        });
    }

    if !daemon_ok {
        checks.push(SetupCheck {
            id: "pull_probe".into(),
            label: "Image pull probe".into(),
            status: SetupCheckStatus::Info,
            detail: "The alpine:3.20 pull action is available after the daemon responds.".into(),
        });
    }

    let overall = overall_from_checks(&checks, !actions.is_empty(), !remediations.is_empty());
    SetupStatus {
        capability_id: SetupCapabilityId::DockerRuntime,
        title: "Docker runtime".into(),
        summary: "Checks Docker CLI, daemon reachability, and a small image-pull probe.".into(),
        overall,
        checks,
        actions,
        remediations,
        config_recommendations,
    }
}

async fn sandbox_status(context: &SetupContext) -> SetupStatus {
    let mut checks = vec![
        landlock_check(),
        executable_check("bwrap", "bubblewrap"),
        executable_check("firejail", "firejail"),
        version_check("docker", &["--version"])
            .await
            .check("docker", "Docker"),
        sandbox_exec_check(),
    ];
    let mut config_recommendations = Vec::new();

    if let Some(alias) = clean_alias(context.alias.as_deref()) {
        config_recommendations.push(SetupConfigRecommendation {
            id: "sandbox_enabled".into(),
            label: "Enable sandbox".into(),
            description: "Enable sandboxing for this risk profile.".into(),
            path: format!("risk_profiles.{alias}.sandbox_enabled"),
            value: SetupConfigValue::Bool(true),
            merge: None,
        });
        config_recommendations.push(SetupConfigRecommendation {
            id: "sandbox_backend_auto".into(),
            label: "Use automatic backend".into(),
            description: "Let ZeroClaw select the best available sandbox backend.".into(),
            path: format!("risk_profiles.{alias}.sandbox_backend"),
            value: SetupConfigValue::String("auto".into()),
            merge: None,
        });
    } else {
        checks.push(SetupCheck {
            id: "risk_profile".into(),
            label: "Risk profile target".into(),
            status: SetupCheckStatus::Warn,
            detail: "Open a risk profile alias to apply sandbox recommendations.".into(),
        });
    }

    let has_backend = checks.iter().any(|c| {
        matches!(
            c.id.as_str(),
            "landlock" | "bubblewrap" | "firejail" | "docker" | "sandbox_exec"
        ) && c.status == SetupCheckStatus::Pass
    });
    let remediations = if has_backend {
        vec![]
    } else {
        vec![SetupRemediation {
            title: "Install a sandbox backend".into(),
            body: "No supported sandbox backend was detected. Install one manually or use Docker where available.".into(),
            commands: platform_sandbox_install_commands(),
        }]
    };

    let overall = overall_from_checks(&checks, false, !remediations.is_empty());
    SetupStatus {
        capability_id: SetupCapabilityId::SandboxBackend,
        title: "Sandbox backend".into(),
        summary:
            "Checks available sandbox backends and prepares a risk profile for automatic selection."
                .into(),
        overall,
        checks,
        actions: vec![],
        remediations,
        config_recommendations,
    }
}

async fn mcp_stdio_status(context: &SetupContext) -> SetupStatus {
    let transport = context
        .mcp_transport
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let command = context.mcp_command.as_deref().unwrap_or("").trim();
    let mut checks = Vec::new();

    checks.push(SetupCheck {
        id: "transport".into(),
        label: "Transport".into(),
        status: if transport == "stdio" {
            SetupCheckStatus::Pass
        } else {
            SetupCheckStatus::Fail
        },
        detail: if transport.is_empty() {
            "No transport configured.".into()
        } else {
            format!("Configured transport: {transport}")
        },
    });

    let command_status = mcp_command_check(command);
    checks.push(command_status);

    if let Some((program, args)) = mcp_version_probe(command) {
        checks.push(
            command_probe(program, args)
                .await
                .check("version", "Version probe"),
        );
    } else if !command.is_empty() {
        checks.push(SetupCheck {
            id: "version".into(),
            label: "Version probe".into(),
            status: SetupCheckStatus::Info,
            detail: "Skipped because this command is not on the safe version-probe allowlist."
                .into(),
        });
    }

    let remediations = if command.is_empty() {
        vec![SetupRemediation {
            title: "Configure MCP command".into(),
            body: "Set the stdio command in mcp.servers.<name>.command. Setup Center will not install third-party MCP packages automatically.".into(),
            commands: vec![],
        }]
    } else {
        vec![]
    };

    let overall = overall_from_checks(&checks, false, !remediations.is_empty());
    SetupStatus {
        capability_id: SetupCapabilityId::McpStdio,
        title: "MCP stdio doctor".into(),
        summary: "Checks stdio transport, executable resolution, and safe runtime version probes."
            .into(),
        overall,
        checks,
        actions: vec![],
        remediations,
        config_recommendations: vec![],
    }
}

fn allowlisted_action_command(
    action_id: SetupActionId,
    capability_id: SetupCapabilityId,
) -> Option<CommandSpec> {
    match (action_id, capability_id) {
        (SetupActionId::BrowserInstallAgentBrowser, SetupCapabilityId::BrowserAgentBrowser) => {
            Some(CommandSpec {
                program: "npm",
                args: &["install", "-g", "agent-browser"],
            })
        }
        (SetupActionId::BrowserInstallChromeForTesting, SetupCapabilityId::BrowserAgentBrowser) => {
            Some(CommandSpec {
                program: "agent-browser",
                args: &["install"],
            })
        }
        (SetupActionId::DockerPullAlpine, SetupCapabilityId::DockerRuntime) => Some(CommandSpec {
            program: "docker",
            args: &["pull", "alpine:3.20"],
        }),
        _ => None,
    }
}

async fn run_action(spec: CommandSpec) -> Result<SetupActionResult, String> {
    let output = run_command(spec.program, spec.args, ACTION_TIMEOUT).await?;
    Ok(SetupActionResult {
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

async fn run_command(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let mut command = Command::new(program);
    command.args(args).kill_on_drop(true);
    time::timeout(timeout, command.output())
        .await
        .map_err(|_| format!("{program} timed out"))?
        .map_err(|e| format!("failed to run {program}: {e}"))
}

#[derive(Debug, Clone)]
struct Probe {
    status: SetupCheckStatus,
    detail: String,
}

impl Probe {
    fn check(self, id: &str, label: &str) -> SetupCheck {
        SetupCheck {
            id: id.into(),
            label: label.into(),
            status: self.status,
            detail: self.detail,
        }
    }
}

async fn version_check(program: &str, args: &[&str]) -> Probe {
    if which::which(program).is_err() {
        return Probe {
            status: SetupCheckStatus::Fail,
            detail: format!("{program} was not found on PATH."),
        };
    }
    command_probe(program, args).await
}

async fn command_probe(program: &str, args: &[&str]) -> Probe {
    match run_command(program, args, SHORT_TIMEOUT).await {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let detail = first_non_empty_line(&stdout)
                .or_else(|| first_non_empty_line(&stderr))
                .unwrap_or("command succeeded")
                .to_string();
            Probe {
                status: SetupCheckStatus::Pass,
                detail,
            }
        }
        Ok(output) => Probe {
            status: SetupCheckStatus::Fail,
            detail: format!(
                "exit {:?}: {}{}",
                output.status.code(),
                String::from_utf8_lossy(&output.stdout).trim(),
                String::from_utf8_lossy(&output.stderr).trim()
            )
            .trim()
            .to_string(),
        },
        Err(e) => Probe {
            status: SetupCheckStatus::Fail,
            detail: e,
        },
    }
}

fn executable_check(program: &str, label: &str) -> SetupCheck {
    match which::which(program) {
        Ok(path) => SetupCheck {
            id: label.to_ascii_lowercase().replace(' ', "_"),
            label: label.into(),
            status: SetupCheckStatus::Pass,
            detail: path.to_string_lossy().to_string(),
        },
        Err(_) => SetupCheck {
            id: label.to_ascii_lowercase().replace(' ', "_"),
            label: label.into(),
            status: SetupCheckStatus::Fail,
            detail: format!("{program} was not found on PATH."),
        },
    }
}

fn chrome_for_testing_check() -> SetupCheck {
    let candidates = chrome_for_testing_candidates();
    if let Some(path) = candidates.iter().find(|p| p.exists()) {
        return SetupCheck {
            id: "chrome_for_testing".into(),
            label: "Chrome for Testing".into(),
            status: SetupCheckStatus::Pass,
            detail: path.to_string_lossy().to_string(),
        };
    }
    if let Some(path) = playwright_chromium_cache() {
        return SetupCheck {
            id: "chrome_for_testing".into(),
            label: "Chrome for Testing".into(),
            status: SetupCheckStatus::Pass,
            detail: format!("Chromium cache found at {}", path.to_string_lossy()),
        };
    }
    SetupCheck {
        id: "chrome_for_testing".into(),
        label: "Chrome for Testing".into(),
        status: SetupCheckStatus::Fail,
        detail: "No Chrome for Testing or managed Chromium cache was found.".into(),
    }
}

fn chrome_for_testing_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from(
            "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        ));
        if let Some(home) = home_dir() {
            paths.push(home.join(
                "Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
            ));
        }
    }
    #[cfg(target_os = "linux")]
    {
        paths.push(PathBuf::from("/opt/google/chrome-for-testing/chrome"));
        paths.push(PathBuf::from("/usr/bin/google-chrome-for-testing"));
    }
    #[cfg(target_os = "windows")]
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(local).join(r"Google\Chrome for Testing\Application\chrome.exe"));
    }
    paths
}

fn playwright_chromium_cache() -> Option<PathBuf> {
    let home = home_dir()?;
    let roots = [
        home.join("Library/Caches/ms-playwright"),
        home.join(".cache/ms-playwright"),
        home.join("AppData/Local/ms-playwright"),
    ];
    roots.iter().find_map(|root| {
        std::fs::read_dir(root).ok()?.flatten().find_map(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("chromium-") {
                Some(entry.path())
            } else {
                None
            }
        })
    })
}

fn landlock_check() -> SetupCheck {
    #[cfg(target_os = "linux")]
    {
        let path = Path::new("/sys/kernel/security/landlock");
        return SetupCheck {
            id: "landlock".into(),
            label: "Landlock".into(),
            status: if path.exists() {
                SetupCheckStatus::Pass
            } else {
                SetupCheckStatus::Fail
            },
            detail: if path.exists() {
                "Kernel Landlock interface is present.".into()
            } else {
                "Kernel Landlock interface was not detected.".into()
            },
        };
    }
    #[cfg(not(target_os = "linux"))]
    SetupCheck {
        id: "landlock".into(),
        label: "Landlock".into(),
        status: SetupCheckStatus::Info,
        detail: "Landlock is Linux-only.".into(),
    }
}

fn sandbox_exec_check() -> SetupCheck {
    #[cfg(target_os = "macos")]
    {
        return executable_check("sandbox-exec", "sandbox-exec");
    }
    #[cfg(not(target_os = "macos"))]
    SetupCheck {
        id: "sandbox_exec".into(),
        label: "sandbox-exec".into(),
        status: SetupCheckStatus::Info,
        detail: "sandbox-exec is macOS-only.".into(),
    }
}

fn mcp_command_check(command: &str) -> SetupCheck {
    if command.is_empty() {
        return SetupCheck {
            id: "command".into(),
            label: "Command".into(),
            status: SetupCheckStatus::Fail,
            detail: "No command configured.".into(),
        };
    }
    if !is_safe_command_token(command) {
        return SetupCheck {
            id: "command".into(),
            label: "Command".into(),
            status: SetupCheckStatus::Fail,
            detail: "Command contains unsupported characters.".into(),
        };
    }
    let resolved = if command.contains(std::path::MAIN_SEPARATOR) {
        let path = PathBuf::from(command);
        path.exists().then_some(path)
    } else {
        which::which(command).ok()
    };
    match resolved {
        Some(path) => SetupCheck {
            id: "command".into(),
            label: "Command".into(),
            status: SetupCheckStatus::Pass,
            detail: path.to_string_lossy().to_string(),
        },
        None => SetupCheck {
            id: "command".into(),
            label: "Command".into(),
            status: SetupCheckStatus::Fail,
            detail: format!("{command} was not found."),
        },
    }
}

fn mcp_version_probe(command: &str) -> Option<(&'static str, &'static [&'static str])> {
    let base = Path::new(command).file_name()?.to_str()?;
    match base {
        "node" => Some(("node", &["--version"])),
        "npm" => Some(("npm", &["--version"])),
        "npx" => Some(("npx", &["--version"])),
        "python" => Some(("python", &["--version"])),
        "python3" => Some(("python3", &["--version"])),
        "uvx" => Some(("uvx", &["--version"])),
        "bun" => Some(("bun", &["--version"])),
        "deno" => Some(("deno", &["--version"])),
        "docker" => Some(("docker", &["--version"])),
        _ => None,
    }
}

fn is_safe_command_token(command: &str) -> bool {
    !command.is_empty()
        && command.len() <= 260
        && !command.contains('\0')
        && !command.chars().any(char::is_whitespace)
        && command
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '/' | '\\' | ':'))
}

fn clean_alias(alias: Option<&str>) -> Option<String> {
    let alias = alias?.trim();
    if alias.is_empty()
        || alias.len() > 120
        || alias.contains('.')
        || alias.contains('/')
        || alias.contains('\\')
    {
        return None;
    }
    Some(alias.to_string())
}

fn action(id: SetupActionId, label: &str, description: &str, command: &[&str]) -> SetupAction {
    SetupAction {
        id,
        label: label.into(),
        description: description.into(),
        command: command.iter().map(|s| s.to_string()).collect(),
        requires_confirmation: true,
    }
}

fn overall_from_checks(
    checks: &[SetupCheck],
    has_actions: bool,
    has_manual_remediation: bool,
) -> SetupOverallStatus {
    if has_manual_remediation {
        return SetupOverallStatus::Manual;
    }
    if checks.iter().any(|c| c.status == SetupCheckStatus::Fail) || has_actions {
        return SetupOverallStatus::NeedsAction;
    }
    if checks.iter().any(|c| c.status == SetupCheckStatus::Warn) {
        return SetupOverallStatus::NeedsAction;
    }
    SetupOverallStatus::Ready
}

fn platform_node_install_commands() -> Vec<Vec<String>> {
    #[cfg(target_os = "macos")]
    return vec![vec!["brew".into(), "install".into(), "node".into()]];
    #[cfg(target_os = "linux")]
    return vec![vec![
        "install Node.js with your distribution package manager or from nodejs.org".into(),
    ]];
    #[cfg(target_os = "windows")]
    return vec![vec![
        "winget".into(),
        "install".into(),
        "OpenJS.NodeJS.LTS".into(),
    ]];
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    vec![]
}

fn platform_python_install_commands() -> Vec<Vec<String>> {
    #[cfg(target_os = "macos")]
    return vec![vec!["brew".into(), "install".into(), "python".into()]];
    #[cfg(target_os = "linux")]
    return vec![vec![
        "install python3 with your distribution package manager".into(),
    ]];
    #[cfg(target_os = "windows")]
    return vec![vec![
        "winget".into(),
        "install".into(),
        "Python.Python.3.12".into(),
    ]];
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    vec![]
}

fn platform_docker_install_commands() -> Vec<Vec<String>> {
    #[cfg(target_os = "macos")]
    return vec![vec![
        "brew".into(),
        "install".into(),
        "--cask".into(),
        "docker".into(),
    ]];
    #[cfg(target_os = "linux")]
    return vec![vec![
        "install Docker Engine using your distribution's official Docker docs".into(),
    ]];
    #[cfg(target_os = "windows")]
    return vec![vec![
        "winget".into(),
        "install".into(),
        "Docker.DockerDesktop".into(),
    ]];
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    vec![]
}

fn platform_sandbox_install_commands() -> Vec<Vec<String>> {
    #[cfg(target_os = "macos")]
    return vec![vec!["sandbox-exec".into(), "-h".into()]];
    #[cfg(target_os = "linux")]
    return vec![vec![
        "install bubblewrap, firejail, or Docker with your package manager".into(),
    ]];
    #[cfg(target_os = "windows")]
    return vec![vec![
        "Docker Desktop provides the recommended sandbox backend on Windows".into(),
    ]];
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    vec![]
}

fn first_non_empty_line(value: &str) -> Option<&str> {
    value.lines().map(str::trim).find(|line| !line.is_empty())
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_allowlist_rejects_cross_capability() {
        assert!(
            allowlisted_action_command(
                SetupActionId::DockerPullAlpine,
                SetupCapabilityId::BrowserAgentBrowser
            )
            .is_none()
        );
    }

    #[test]
    fn action_allowlist_contains_no_privileged_installers() {
        let pairs = [
            (
                SetupActionId::BrowserInstallAgentBrowser,
                SetupCapabilityId::BrowserAgentBrowser,
            ),
            (
                SetupActionId::BrowserInstallChromeForTesting,
                SetupCapabilityId::BrowserAgentBrowser,
            ),
            (
                SetupActionId::DockerPullAlpine,
                SetupCapabilityId::DockerRuntime,
            ),
        ];
        let banned = ["sudo", "apt", "dnf", "pacman", "yum", "brew", "winget"];
        for (action, capability) in pairs {
            let spec = allowlisted_action_command(action, capability).unwrap();
            assert!(!banned.contains(&spec.program));
            for arg in spec.args {
                assert!(!banned.contains(arg));
            }
        }
    }

    #[test]
    fn mcp_command_token_rejects_shell_strings() {
        assert!(is_safe_command_token("node"));
        assert!(is_safe_command_token("/usr/local/bin/node"));
        assert!(!is_safe_command_token("node --version"));
        assert!(!is_safe_command_token("node;rm"));
    }

    #[test]
    fn clean_alias_rejects_paths_and_nested_keys() {
        assert_eq!(clean_alias(Some("balanced")).as_deref(), Some("balanced"));
        assert!(clean_alias(Some("risk.profile")).is_none());
        assert!(clean_alias(Some("../x")).is_none());
    }
}
