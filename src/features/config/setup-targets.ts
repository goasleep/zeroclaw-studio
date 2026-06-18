import type { SetupCapabilityId, SetupContext } from "@/api/tauri";

export interface SetupTarget {
  key: string;
  label: string;
  context: SetupContext;
}

export const CAPABILITY_LABELS: Record<SetupCapabilityId, string> = {
  browser_agent_browser: "Browser",
  python_skills: "Python skills",
  docker_runtime: "Docker",
  sandbox_backend: "Sandbox",
  mcp_stdio: "MCP stdio",
};

export function setupTargetsForPrefix(prefix: string): SetupTarget[] {
  const clean = prefix.trim().replace(/\.$/, "");
  const parts = clean.split(".").filter(Boolean);
  const targets: SetupTarget[] = [];
  const riskAlias = aliasForRiskProfile(parts);

  if (parts[0] === "browser" || clean.includes("agent-browser")) {
    targets.push(target("browser_agent_browser", clean, null));
  }
  if (parts[0] === "runtime" || parts[0] === "runtime_profiles") {
    targets.push(target("docker_runtime", clean, aliasAfterRoot(parts, parts[0])));
  }
  if (parts[0] === "skills") {
    targets.push(target("python_skills", clean, null));
  }
  if (riskAlias) {
    targets.push(target("python_skills", clean, riskAlias));
    targets.push(target("sandbox_backend", clean, riskAlias));
  }
  if (parts[0] === "mcp" && parts[1] === "servers" && parts[2]) {
    targets.push(target("mcp_stdio", clean, parts[2]));
  }

  return targets;
}

function target(
  capabilityId: SetupCapabilityId,
  configPrefix: string,
  alias: string | null,
): SetupTarget {
  return {
    key: `${capabilityId}:${configPrefix}:${alias ?? ""}`,
    label: CAPABILITY_LABELS[capabilityId],
    context: {
      capability_id: capabilityId,
      config_prefix: configPrefix,
      alias,
      mcp_transport: null,
      mcp_command: null,
    },
  };
}

function aliasForRiskProfile(parts: string[]) {
  if (parts[0] !== "risk_profiles") return null;
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

function aliasAfterRoot(parts: string[], root?: string) {
  if (!root || parts[0] !== root || parts.length < 2) return null;
  return parts[parts.length - 1];
}
