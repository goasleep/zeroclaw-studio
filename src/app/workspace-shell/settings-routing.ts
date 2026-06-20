import type { SettingsSection } from "./types";

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
