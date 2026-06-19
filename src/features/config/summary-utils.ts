import type { PickerItem } from "@/api/config";
import type { AgentSummary, RiskProfileSummary, RuntimeProfileSummary } from "@/api/tauri";
import type { SummaryKind } from "./types";

export function summaryKindForSection(sectionKey: string): SummaryKind | null {
  if (sectionKey === "agents") return "agents";
  if (sectionKey === "risk_profiles") return "risk_profiles";
  if (sectionKey === "runtime_profiles") return "runtime_profiles";
  return null;
}

export function summaryBadge(
  summary: AgentSummary | RiskProfileSummary | RuntimeProfileSummary | undefined,
  item: PickerItem,
) {
  if (summary && "dispatchable" in summary) {
    return summary.dispatchable ? "ready" : "needs setup";
  }
  return item.badge;
}

export function statusDotClass(
  summary: AgentSummary | RiskProfileSummary | RuntimeProfileSummary | undefined,
  item: PickerItem,
) {
  if (summary && "dispatchable" in summary) {
    return summary.dispatchable ? "bg-emerald-400" : "bg-amber-400";
  }
  return item.badge ? "bg-emerald-400" : "bg-white/[0.12]";
}

export function bundleCount(summary: AgentSummary) {
  return (
    summary.skill_bundles.length + summary.knowledge_bundles.length + summary.mcp_bundles.length
  );
}

export function usedByLabel(agents: string[]) {
  return agents.length ? `used by ${agents.length}` : "unused";
}

export function inheritNumber(value: number | null) {
  return value && value > 0 ? String(value) : "inherit";
}

export function secondsLabel(value: number | null) {
  return value && value > 0 ? `${value}s` : "inherit";
}

export function centsLabel(value: number | null) {
  return value && value > 0 ? `$${(value / 100).toFixed(2)}/day` : "budget inherit";
}
