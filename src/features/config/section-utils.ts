import type { ConfigListEntry, ConfigSectionInfo } from "@/api/config";
import { ApiError } from "@/api/base";
import type { ConfigCategory, StatusFilter, TaskState } from "./types";
import { GROUP_ICONS, GROUP_ORDER } from "./config-categories";
import { Layers3 } from "lucide-react";

export function sectionByRoot(sections: ConfigSectionInfo[], root: string) {
  return (
    sections.find((section) => section.key === root) ??
    sections.find((section) => section.key.startsWith(`${root}.`)) ??
    null
  );
}

export function statusState(section: ConfigSectionInfo | null): TaskState {
  if (!section) return "neutral";
  if (section.ready) return "ready";
  if (section.completed) return "needs";
  return "neutral";
}

export interface SectionStats {
  ready: number;
  completed: number;
  needs: number;
  empty: number;
  quickstart: number;
}

export function getSectionStats(sections: ConfigSectionInfo[]): SectionStats {
  const ready = sections.filter((section) => section.ready).length;
  const completed = sections.filter((section) => section.completed).length;
  const quickstart = sections.filter((section) => section.is_quickstart).length;
  return {
    ready,
    completed,
    needs: sections.length - ready,
    empty: sections.filter((section) => !section.ready && !section.completed).length,
    quickstart,
  };
}

export function groupSections(sections: ConfigSectionInfo[]) {
  const groups = new Map<string, ConfigSectionInfo[]>();
  for (const section of sections) {
    const group = section.group || "Other";
    groups.set(group, [...(groups.get(group) ?? []), section]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
    .map(([group, items]) => ({ group, items }));
}

export function filterSections(sections: ConfigSectionInfo[], filter: string) {
  const q = filter.trim().toLowerCase();
  if (!q) return sections;
  return sections.filter((section) =>
    [section.key, section.label, section.group, section.help]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  );
}

export function filterSectionsByStatus(sections: ConfigSectionInfo[], statusFilter: StatusFilter) {
  if (statusFilter === "ready") return sections.filter((section) => section.ready);
  if (statusFilter === "needs") return sections.filter((section) => !section.ready);
  return sections;
}

export function sectionMatchesCategory(section: ConfigSectionInfo, category: ConfigCategory) {
  return sectionMatchesKeys(section, category.sectionKeys);
}

export function sectionMatchesKeys(section: ConfigSectionInfo, keys: string[]) {
  return keys.some((key) => section.key === key || section.key.startsWith(`${key}.`));
}

export function orderSectionsForCategory(sections: ConfigSectionInfo[], category: ConfigCategory) {
  return [...sections].sort((a, b) => {
    const aRank = categoryKeyRank(a.key, category.sectionKeys);
    const bRank = categoryKeyRank(b.key, category.sectionKeys);
    return aRank - bRank || a.label.localeCompare(b.label);
  });
}

export function categoryKeyRank(sectionKey: string, keys: string[]) {
  const idx = keys.findIndex((key) => sectionKey === key || sectionKey.startsWith(`${key}.`));
  return idx >= 0 ? idx : keys.length;
}

export function categorySectionLabel(category: ConfigCategory, section: ConfigSectionInfo) {
  if (category.id === "models-providers" && section.key === "providers.models") {
    return "Providers";
  }
  if (category.id === "agents" && section.key === "agents") return "Agent aliases";
  if (category.id === "agents" && section.key === "peer_groups") return "Peer groups";
  if (category.id === "runtime-safety" && section.key === "risk_profiles") {
    return "Risk profiles";
  }
  if (category.id === "runtime-safety" && section.key === "runtime_profiles") {
    return "Runtime profiles";
  }
  if (category.id === "channels" && section.key === "channels") return "Channel aliases";
  if (category.id === "tools-skills" && section.key === "tools") return "Tools";
  if (category.id === "tools-skills" && section.key === "skills") return "Skills";
  if (category.id === "tools-skills" && section.key === "skill_bundles") {
    return "Skill bundles";
  }
  if (category.id === "tools-skills" && section.key === "mcp") return "MCP servers";
  return section.label;
}

export function entryNoun(section: ConfigSectionInfo) {
  if (section.key === "risk_profiles") return "risk profile";
  if (section.key === "agents" || section.key.startsWith("agents.")) return "agent";
  if (section.key === "channels" || section.key.startsWith("channels.")) return "channel alias";
  if (section.key === "providers.models" || section.key.startsWith("providers.models.")) {
    return "provider";
  }
  return section.shape === "typed_family_map" ? "alias" : "entry";
}

export function entryPluralNoun(section: ConfigSectionInfo) {
  const noun = entryNoun(section);
  if (noun === "entry") return "entries";
  if (noun === "alias") return "aliases";
  if (noun === "channel alias") return "channel aliases";
  return `${noun}s`;
}

export function groupRank(group: string) {
  const idx = GROUP_ORDER.indexOf(group as (typeof GROUP_ORDER)[number]);
  return idx >= 0 ? idx : GROUP_ORDER.length;
}

export function iconForGroup(group: string) {
  return GROUP_ICONS[group] ?? Layers3;
}

export function sectionStatusLabel(section: ConfigSectionInfo) {
  if (section.ready) return "ready";
  if (section.completed) return "partial";
  return "empty";
}

export function groupFields(entries: ConfigListEntry[]) {
  const groups = new Map<string, ConfigListEntry[]>();
  for (const entry of [...entries].sort(fieldSort)) {
    const group = entry.tab || entry.category || "Fields";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }
  return Array.from(groups.entries()).map(([label, fields]) => ({ label, fields }));
}

export function fieldSort(a: ConfigListEntry, b: ConfigListEntry) {
  return fieldPriority(a) - fieldPriority(b) || a.path.localeCompare(b.path);
}

export function fieldPriority(entry: ConfigListEntry) {
  const leaf = entry.path.split(".").pop() ?? "";
  const order = [
    "enabled",
    "model",
    "api_key",
    "requires_openai_auth",
    "uri",
    "model_provider",
    "risk_profile",
    "runtime_profile",
    "channels",
  ];
  const idx = order.indexOf(leaf);
  return idx >= 0 ? idx : 100;
}

export function aliasesFromEntries(entries: ConfigListEntry[], prefix: string) {
  const prefixDot = `${prefix}.`;
  const aliases = new Set<string>();
  for (const entry of entries) {
    const rest = entry.path.startsWith(prefixDot) ? entry.path.slice(prefixDot.length) : "";
    const alias = rest.split(".")[0];
    if (alias) aliases.add(alias);
  }
  return Array.from(aliases).sort();
}

export function dottedToPointer(path: string) {
  return `/${path
    .split(".")
    .map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
}

export function leafLabel(path: string) {
  const leaf = path.split(".").pop() || path;
  return leaf.replace(/[-_]/g, " ");
}

export function createEntryLabel(section: ConfigSectionInfo) {
  return `New ${entryNoun(section)}`;
}

export function createButtonLabel(section: ConfigSectionInfo) {
  return `Create ${entryNoun(section)}`;
}

export function entryNameLabel(section: ConfigSectionInfo) {
  if (section.key === "channels" || section.key.startsWith("channels.")) return "Channel alias";
  if (section.key === "agents" || section.key.startsWith("agents.")) return "Agent alias";
  if (section.key === "risk_profiles") return "Risk profile name";
  return "Entry name";
}

export function entryNamePlaceholder(section: ConfigSectionInfo) {
  if (section.key === "risk_profiles") return "profile name, e.g. dev";
  if (section.key === "agents" || section.key.startsWith("agents.")) return "agent alias, e.g. dev";
  if (section.key === "channels" || section.key.startsWith("channels.")) return "channel alias";
  return "entry name";
}

export function pickerSelectionLabel(section: ConfigSectionInfo) {
  if (section.key === "providers.models") return "Provider type";
  return "Selection";
}

export function pickerSelectionOption(section: ConfigSectionInfo) {
  if (section.key === "providers.models") return "provider type";
  return entryNoun(section);
}

export function choiceCountLabel(section: ConfigSectionInfo, count: number) {
  if (section.key === "providers.models") {
    return `${count} provider ${count === 1 ? "type" : "types"}`;
  }
  return `${count} choices`;
}

export function formTasksForPrefix(prefix: string, entries: ConfigListEntry[]) {
  if (prefix.startsWith("providers.models.")) {
    return [
      {
        label: "Credentials",
        detail: configuredDetail(
          entries,
          ["api_key", "token", "credential"],
          "Secret field is set",
        ),
        state: configuredState(entries, ["api_key", "token", "credential"]),
      },
      {
        label: "Model",
        detail: configuredDetail(entries, ["model", "deployment"], "Model value is set"),
        state: configuredState(entries, ["model", "deployment"]),
      },
      {
        label: "Endpoint",
        detail: configuredDetail(
          entries,
          ["base_url", "uri", "endpoint"],
          "Endpoint override is set",
        ),
        state: configuredState(entries, ["base_url", "uri", "endpoint"], "neutral"),
      },
    ];
  }

  if (prefix === "channels" || prefix.startsWith("channels.")) {
    return [
      {
        label: "Enabled",
        detail: configuredDetail(entries, ["enabled"], "Enabled field is set"),
        state: configuredState(entries, ["enabled"], "neutral"),
      },
      {
        label: "Token/webhook",
        detail: configuredDetail(entries, ["token", "secret", "webhook"], "Secret field is set"),
        state: configuredState(entries, ["token", "secret", "webhook"]),
      },
      {
        label: "Agent routing",
        detail: configuredDetail(
          entries,
          ["owning_agent", "agent", "peer_group"],
          "Routing field is set",
        ),
        state: configuredState(entries, ["owning_agent", "agent", "peer_group"], "neutral"),
      },
    ];
  }

  return [];
}

export function configuredState(
  entries: ConfigListEntry[],
  leaves: string[],
  fallback: TaskState = "needs",
): TaskState {
  return entries.some((entry) => entryMatchesLeaf(entry, leaves) && entryHasValue(entry))
    ? "ready"
    : fallback;
}

export function configuredDetail(
  entries: ConfigListEntry[],
  leaves: string[],
  readyDetail: string,
) {
  const match = entries.find((entry) => entryMatchesLeaf(entry, leaves));
  if (!match) return "No matching field reported";
  if (entryHasValue(match)) return readyDetail;
  return match.is_secret ? "Secret is not set yet" : "Value is not set yet";
}

export function entryMatchesLeaf(entry: ConfigListEntry, leaves: string[]) {
  const leaf = entry.path.split(".").pop() ?? "";
  return leaves.some((name) => leaf === name || leaf.includes(name));
}

export function entryHasValue(entry: ConfigListEntry) {
  return Boolean(entry.populated || entry.is_env_overridden);
}

export function formatRawValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return `[${e.envelope.code}] ${e.envelope.message}`;
  return e instanceof Error ? e.message : String(e);
}
