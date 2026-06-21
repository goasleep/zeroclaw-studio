import type { SettingsSection } from "./types";

export function normalizeSettingsSection(section: SettingsSection): SettingsSection {
  if (section === "gateway-config") return "gateway-overview";
  if (section === "tools") return "tools-skills";
  if (section === "cron") return "automations";
  return section;
}

export function settingsSectionForConfigTarget(targetSection: string): SettingsSection {
  if (targetSection === "providers.models" || targetSection.startsWith("providers.models.")) {
    return "models-providers";
  }
  if (targetSection === "agents" || targetSection.startsWith("agents.")) return "agents";
  if (targetSection === "peer_groups" || targetSection.startsWith("peer_groups.")) {
    return "agents";
  }
  if (targetSection === "risk_profiles" || targetSection.startsWith("risk_profiles.")) {
    return "runtime-safety";
  }
  if (targetSection === "runtime_profiles" || targetSection.startsWith("runtime_profiles.")) {
    return "runtime-safety";
  }
  if (targetSection === "channels" || targetSection.startsWith("channels.")) return "channels";
  if (targetSection === "cron" || targetSection.startsWith("cron.")) return "automations";
  if (
    targetSection === "tools" ||
    targetSection.startsWith("tools.") ||
    targetSection === "skills" ||
    targetSection.startsWith("skills.") ||
    targetSection === "skill_bundles" ||
    targetSection.startsWith("skill_bundles.") ||
    targetSection === "mcp" ||
    targetSection.startsWith("mcp.")
  ) {
    return "tools-skills";
  }
  return "gateway-overview";
}
