use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::connection::store::SharedConnectionBook;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ConfigSummaryError {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ConfigSummaries {
    pub agents: Vec<AgentSummary>,
    pub risk_profiles: Vec<RiskProfileSummary>,
    pub runtime_profiles: Vec<RuntimeProfileSummary>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AgentSummary {
    pub alias: String,
    pub label: String,
    pub picker_badge: Option<String>,
    pub enabled: bool,
    pub dispatchable: bool,
    pub missing: Vec<String>,
    pub model_provider: String,
    pub risk_profile: String,
    pub runtime_profile: String,
    pub channels: Vec<String>,
    pub skill_bundles: Vec<String>,
    pub knowledge_bundles: Vec<String>,
    pub mcp_bundles: Vec<String>,
    pub cron_jobs: Vec<String>,
    pub peer_groups: Vec<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct RiskProfileSummary {
    pub alias: String,
    pub label: String,
    pub picker_badge: Option<String>,
    pub used_by_agents: Vec<String>,
    pub level: String,
    pub workspace_only: Option<bool>,
    pub allowed_commands: Vec<String>,
    pub forbidden_paths: Vec<String>,
    pub allowed_roots: Vec<String>,
    pub require_approval_for_medium_risk: Option<bool>,
    pub block_high_risk_commands: Option<bool>,
    pub auto_approve: Vec<String>,
    pub always_ask: Vec<String>,
    pub allowed_tools: Vec<String>,
    pub excluded_tools: Vec<String>,
    pub sandbox_enabled: Option<bool>,
    pub sandbox_backend: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct RuntimeProfileSummary {
    pub alias: String,
    pub label: String,
    pub picker_badge: Option<String>,
    pub used_by_agents: Vec<String>,
    pub agentic: Option<bool>,
    pub max_tool_iterations: Option<u64>,
    pub max_actions_per_hour: Option<u64>,
    pub max_cost_per_day_cents: Option<u64>,
    pub shell_timeout_secs: Option<u64>,
    pub max_context_tokens: Option<u64>,
    pub max_history_messages: Option<u64>,
    pub compact_context: Option<bool>,
    pub parallel_tools: Option<bool>,
    pub strict_tool_parsing: Option<bool>,
    pub tool_dispatcher: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PickerResponse {
    items: Vec<PickerItem>,
}

#[derive(Debug, Clone, Deserialize)]
struct PickerItem {
    key: String,
    label: String,
    #[allow(dead_code)]
    description: Option<String>,
    badge: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ConfigListResponse {
    entries: Vec<ConfigListEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct ConfigListEntry {
    path: String,
    value: Option<Value>,
    populated: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn config_get_summaries(
    book: tauri::State<'_, SharedConnectionBook>,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<ConfigSummaries, ConfigSummaryError> {
    let conn = book.active().await.ok_or_else(|| ConfigSummaryError {
        message: "No active ZeroClaw runtime connection.".to_string(),
    })?;
    let gateway = GatewaySummaryClient {
        base_url: conn.url.trim_end_matches('/').to_string(),
        token: conn.auth.token.clone(),
        client: client.inner().clone(),
    };

    load_summaries(&gateway)
        .await
        .map_err(|e| ConfigSummaryError {
            message: e.to_string(),
        })
}

struct GatewaySummaryClient {
    base_url: String,
    token: Option<String>,
    client: reqwest::Client,
}

impl GatewaySummaryClient {
    async fn get_json<T: for<'de> Deserialize<'de>>(&self, path: &str) -> anyhow::Result<T> {
        let mut req = self.client.get(format!("{}{}", self.base_url, path));
        if let Some(token) = &self.token {
            req = req.header("Authorization", format!("Bearer {token}"));
        }
        let response = req.send().await?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("gateway {path} returned {status}: {body}");
        }
        Ok(response.json::<T>().await?)
    }
}

async fn load_summaries(gateway: &GatewaySummaryClient) -> anyhow::Result<ConfigSummaries> {
    let (
        agents_picker,
        risk_picker,
        runtime_picker,
        agents_list,
        peer_groups_list,
        risk_list,
        runtime_list,
    ) = tokio::try_join!(
        gateway.get_json::<PickerResponse>("/api/config/sections/agents"),
        gateway.get_json::<PickerResponse>("/api/config/sections/risk_profiles"),
        gateway.get_json::<PickerResponse>("/api/config/sections/runtime_profiles"),
        gateway.get_json::<ConfigListResponse>("/api/config/list?prefix=agents"),
        gateway.get_json::<ConfigListResponse>("/api/config/list?prefix=peer_groups"),
        gateway.get_json::<ConfigListResponse>("/api/config/list?prefix=risk_profiles"),
        gateway.get_json::<ConfigListResponse>("/api/config/list?prefix=runtime_profiles"),
    )?;

    let agent_summaries = build_agent_summaries(
        &agents_picker.items,
        &agents_list.entries,
        &peer_groups_list.entries,
    );
    let risk_summaries =
        build_risk_profile_summaries(&risk_picker.items, &risk_list.entries, &agent_summaries);
    let runtime_summaries = build_runtime_profile_summaries(
        &runtime_picker.items,
        &runtime_list.entries,
        &agent_summaries,
    );

    Ok(ConfigSummaries {
        agents: agent_summaries,
        risk_profiles: risk_summaries,
        runtime_profiles: runtime_summaries,
    })
}

fn build_agent_summaries(
    items: &[PickerItem],
    agent_entries: &[ConfigListEntry],
    peer_group_entries: &[ConfigListEntry],
) -> Vec<AgentSummary> {
    let peer_groups_by_agent = peer_groups_by_agent(peer_group_entries);
    items
        .iter()
        .map(|item| {
            let prefix = format!("agents.{}", item.key);
            let enabled = read_bool(agent_entries, &format!("{prefix}.enabled")).unwrap_or(false);
            let model_provider = read_string(agent_entries, &format!("{prefix}.model_provider"));
            let risk_profile = read_string(agent_entries, &format!("{prefix}.risk_profile"));
            let runtime_profile = read_string(agent_entries, &format!("{prefix}.runtime_profile"));
            let channels = read_string_array(agent_entries, &format!("{prefix}.channels"));
            let skill_bundles =
                read_string_array(agent_entries, &format!("{prefix}.skill_bundles"));
            let knowledge_bundles =
                read_string_array(agent_entries, &format!("{prefix}.knowledge_bundles"));
            let mcp_bundles = read_string_array(agent_entries, &format!("{prefix}.mcp_bundles"));
            let cron_jobs = read_string_array(agent_entries, &format!("{prefix}.cron_jobs"));
            let mut missing = Vec::new();
            if !enabled {
                missing.push("disabled".to_string());
            }
            if model_provider.is_empty() {
                missing.push("model_provider".to_string());
            }
            if risk_profile.is_empty() {
                missing.push("risk_profile".to_string());
            }
            if runtime_profile.is_empty() {
                missing.push("runtime_profile".to_string());
            }
            let dispatchable = enabled
                && !model_provider.is_empty()
                && !risk_profile.is_empty()
                && !runtime_profile.is_empty();

            AgentSummary {
                alias: item.key.clone(),
                label: item.label.clone(),
                picker_badge: item.badge.clone(),
                enabled,
                dispatchable,
                missing,
                model_provider,
                risk_profile,
                runtime_profile,
                channels,
                skill_bundles,
                knowledge_bundles,
                mcp_bundles,
                cron_jobs,
                peer_groups: peer_groups_by_agent
                    .get(&item.key)
                    .cloned()
                    .unwrap_or_default(),
            }
        })
        .collect()
}

fn build_risk_profile_summaries(
    items: &[PickerItem],
    entries: &[ConfigListEntry],
    agents: &[AgentSummary],
) -> Vec<RiskProfileSummary> {
    items
        .iter()
        .map(|item| {
            let prefix = format!("risk_profiles.{}", item.key);
            RiskProfileSummary {
                alias: item.key.clone(),
                label: item.label.clone(),
                picker_badge: item.badge.clone(),
                used_by_agents: agents_using(agents, |agent| agent.risk_profile == item.key),
                level: read_string(entries, &format!("{prefix}.level")),
                workspace_only: read_bool(entries, &format!("{prefix}.workspace_only")),
                allowed_commands: read_string_array(entries, &format!("{prefix}.allowed_commands")),
                forbidden_paths: read_string_array(entries, &format!("{prefix}.forbidden_paths")),
                allowed_roots: read_string_array(entries, &format!("{prefix}.allowed_roots")),
                require_approval_for_medium_risk: read_bool(
                    entries,
                    &format!("{prefix}.require_approval_for_medium_risk"),
                ),
                block_high_risk_commands: read_bool(
                    entries,
                    &format!("{prefix}.block_high_risk_commands"),
                ),
                auto_approve: read_string_array(entries, &format!("{prefix}.auto_approve")),
                always_ask: read_string_array(entries, &format!("{prefix}.always_ask")),
                allowed_tools: read_string_array(entries, &format!("{prefix}.allowed_tools")),
                excluded_tools: read_string_array(entries, &format!("{prefix}.excluded_tools")),
                sandbox_enabled: read_bool(entries, &format!("{prefix}.sandbox_enabled")),
                sandbox_backend: read_string(entries, &format!("{prefix}.sandbox_backend")),
            }
        })
        .collect()
}

fn build_runtime_profile_summaries(
    items: &[PickerItem],
    entries: &[ConfigListEntry],
    agents: &[AgentSummary],
) -> Vec<RuntimeProfileSummary> {
    items
        .iter()
        .map(|item| {
            let prefix = format!("runtime_profiles.{}", item.key);
            RuntimeProfileSummary {
                alias: item.key.clone(),
                label: item.label.clone(),
                picker_badge: item.badge.clone(),
                used_by_agents: agents_using(agents, |agent| agent.runtime_profile == item.key),
                agentic: read_bool(entries, &format!("{prefix}.agentic")),
                max_tool_iterations: read_u64(entries, &format!("{prefix}.max_tool_iterations")),
                max_actions_per_hour: read_u64(entries, &format!("{prefix}.max_actions_per_hour")),
                max_cost_per_day_cents: read_u64(
                    entries,
                    &format!("{prefix}.max_cost_per_day_cents"),
                ),
                shell_timeout_secs: read_u64(entries, &format!("{prefix}.shell_timeout_secs")),
                max_context_tokens: read_u64(entries, &format!("{prefix}.max_context_tokens")),
                max_history_messages: read_u64(entries, &format!("{prefix}.max_history_messages")),
                compact_context: read_bool(entries, &format!("{prefix}.compact_context")),
                parallel_tools: read_bool(entries, &format!("{prefix}.parallel_tools")),
                strict_tool_parsing: read_bool(entries, &format!("{prefix}.strict_tool_parsing")),
                tool_dispatcher: read_string(entries, &format!("{prefix}.tool_dispatcher")),
            }
        })
        .collect()
}

fn peer_groups_by_agent(entries: &[ConfigListEntry]) -> BTreeMap<String, Vec<String>> {
    let mut groups = BTreeMap::<String, BTreeSet<String>>::new();
    for entry in entries {
        let Some(group) = entry
            .path
            .strip_prefix("peer_groups.")
            .and_then(|rest| rest.strip_suffix(".agents"))
        else {
            continue;
        };
        for agent in entry_as_string_array(entry) {
            groups.entry(agent).or_default().insert(group.to_string());
        }
    }
    groups
        .into_iter()
        .map(|(agent, groups)| (agent, groups.into_iter().collect()))
        .collect()
}

fn agents_using<F>(agents: &[AgentSummary], predicate: F) -> Vec<String>
where
    F: Fn(&AgentSummary) -> bool,
{
    agents
        .iter()
        .filter(|agent| predicate(agent))
        .map(|agent| agent.alias.clone())
        .collect()
}

fn read_string(entries: &[ConfigListEntry], path: &str) -> String {
    find_entry(entries, path)
        .and_then(entry_as_string)
        .unwrap_or_default()
}

fn read_bool(entries: &[ConfigListEntry], path: &str) -> Option<bool> {
    find_entry(entries, path).and_then(entry_as_bool)
}

fn read_u64(entries: &[ConfigListEntry], path: &str) -> Option<u64> {
    find_entry(entries, path).and_then(entry_as_u64)
}

fn read_string_array(entries: &[ConfigListEntry], path: &str) -> Vec<String> {
    find_entry(entries, path)
        .map(entry_as_string_array)
        .unwrap_or_default()
}

fn find_entry<'a>(entries: &'a [ConfigListEntry], path: &str) -> Option<&'a ConfigListEntry> {
    entries.iter().find(|entry| entry.path == path)
}

fn entry_as_string(entry: &ConfigListEntry) -> Option<String> {
    if !entry.populated {
        return None;
    }
    match entry.value.as_ref()? {
        Value::String(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() || trimmed == "<unset>" {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Bool(value) => Some(value.to_string()),
        Value::Number(value) => Some(value.to_string()),
        other => Some(other.to_string()),
    }
}

fn entry_as_bool(entry: &ConfigListEntry) -> Option<bool> {
    let value = entry_as_string(entry)?;
    match value.trim().to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn entry_as_u64(entry: &ConfigListEntry) -> Option<u64> {
    let value = entry_as_string(entry)?;
    value.trim().parse::<u64>().ok()
}

fn entry_as_string_array(entry: &ConfigListEntry) -> Vec<String> {
    if !entry.populated {
        return Vec::new();
    }
    let Some(value) = entry.value.as_ref() else {
        return Vec::new();
    };
    if let Some(items) = value.as_array() {
        return items.iter().filter_map(value_to_non_empty_string).collect();
    }
    let Some(raw) = value.as_str() else {
        return value_to_non_empty_string(value).into_iter().collect();
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "<unset>" {
        return Vec::new();
    }
    if let Ok(parsed) = serde_json::from_str::<Vec<Value>>(trimmed) {
        return parsed
            .iter()
            .filter_map(value_to_non_empty_string)
            .collect();
    }
    trimmed
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split([',', '\n'])
        .map(|item| item.trim().trim_matches('"').to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn value_to_non_empty_string(value: &Value) -> Option<String> {
    let value = match value {
        Value::String(value) => value.trim().to_string(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        _ => return None,
    };
    (!value.is_empty()).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, value: Value) -> ConfigListEntry {
        ConfigListEntry {
            path: path.to_string(),
            value: Some(value),
            populated: true,
        }
    }

    fn string_entry(path: &str, value: &str) -> ConfigListEntry {
        entry(path, Value::String(value.to_string()))
    }

    fn item(key: &str, badge: Option<&str>) -> PickerItem {
        PickerItem {
            key: key.to_string(),
            label: key.to_string(),
            description: None,
            badge: badge.map(str::to_string),
        }
    }

    #[test]
    fn parses_scalar_and_array_display_values() {
        assert_eq!(entry_as_bool(&string_entry("x", "true")), Some(true));
        assert_eq!(entry_as_bool(&string_entry("x", "false")), Some(false));
        assert_eq!(entry_as_u64(&string_entry("x", "42")), Some(42));
        assert_eq!(
            entry_as_string_array(&string_entry("x", "")),
            Vec::<String>::new()
        );
        assert_eq!(
            entry_as_string_array(&string_entry("x", r#"["git","cargo"]"#)),
            vec!["git", "cargo"],
        );
        assert_eq!(
            entry_as_string_array(&string_entry("x", "git, cargo\npnpm")),
            vec!["git", "cargo", "pnpm"],
        );
    }

    #[test]
    fn builds_agent_dispatchable_state_and_missing_fields() {
        let entries = vec![
            string_entry("agents.default.enabled", "true"),
            string_entry("agents.default.model_provider", "openai.default"),
            string_entry("agents.default.risk_profile", "locked_down"),
            string_entry("agents.default.runtime_profile", "balanced"),
            string_entry("agents.default.channels", r#"["telegram.default"]"#),
            string_entry("agents.broken.enabled", "true"),
            string_entry("agents.broken.model_provider", ""),
        ];
        let agents = build_agent_summaries(
            &[
                item("default", Some("active")),
                item("broken", Some("configured")),
            ],
            &entries,
            &[],
        );
        assert!(agents[0].dispatchable);
        assert_eq!(agents[0].channels, vec!["telegram.default"]);
        assert!(!agents[1].dispatchable);
        assert_eq!(
            agents[1].missing,
            vec!["model_provider", "risk_profile", "runtime_profile"],
        );
    }

    #[test]
    fn reverse_resolves_peer_groups() {
        let peer_entries = vec![
            string_entry("peer_groups.team.agents", r#"["default","coder"]"#),
            string_entry("peer_groups.ops.agents", "coder"),
        ];
        let groups = peer_groups_by_agent(&peer_entries);
        assert_eq!(groups.get("default").unwrap(), &vec!["team".to_string()]);
        assert_eq!(
            groups.get("coder").unwrap(),
            &vec!["ops".to_string(), "team".to_string()],
        );
    }

    #[test]
    fn reverse_resolves_profile_usage() {
        let agent_entries = vec![
            string_entry("agents.default.enabled", "true"),
            string_entry("agents.default.model_provider", "openai.default"),
            string_entry("agents.default.risk_profile", "locked_down"),
            string_entry("agents.default.runtime_profile", "balanced"),
            string_entry("agents.coder.enabled", "true"),
            string_entry("agents.coder.model_provider", "openai.coder"),
            string_entry("agents.coder.risk_profile", "locked_down"),
            string_entry("agents.coder.runtime_profile", "fast"),
        ];
        let agents = build_agent_summaries(
            &[item("default", None), item("coder", None)],
            &agent_entries,
            &[],
        );
        let risk = build_risk_profile_summaries(&[item("locked_down", None)], &[], &agents);
        let runtime = build_runtime_profile_summaries(
            &[item("balanced", None), item("fast", None)],
            &[],
            &agents,
        );
        assert_eq!(risk[0].used_by_agents, vec!["default", "coder"]);
        assert_eq!(runtime[0].used_by_agents, vec!["default"]);
        assert_eq!(runtime[1].used_by_agents, vec!["coder"]);
    }
}
