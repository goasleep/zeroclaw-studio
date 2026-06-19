import { useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import {
  Activity,
  Boxes,
  Database,
  Layers3,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ConfigCategory, ConfigCategoryId } from "./types";

export const GROUP_ORDER = [
  "Foundation",
  "Agent",
  "Multi-agent",
  "Tools",
  "Integrations",
  "Network",
  "Storage",
  "Operations",
  "Other",
] as const;

export const CONFIG_CATEGORIES: Record<ConfigCategoryId, ConfigCategory> = {
  "models-providers": {
    id: "models-providers",
    label: "Model Connections",
    description: "Connect a model service, add credentials, and make it available to agents.",
    sectionKeys: ["providers.models"],
    icon: Sparkles,
    emptyTitle: "No model provider sections",
    emptyBody: "This gateway did not report provider config sections.",
  },
  agents: {
    id: "agents",
    label: "Agents",
    description: "Configure agent identities, prompts, default profiles, and peer groups.",
    sectionKeys: ["agents", "peer_groups"],
    icon: Activity,
    emptyTitle: "No agent sections",
    emptyBody: "This gateway did not report agent or peer group config sections.",
  },
  "runtime-safety": {
    id: "runtime-safety",
    label: "Runtime & Safety",
    description: "Manage risk profiles, runtime tuning, sandbox settings, and command policy.",
    sectionKeys: ["risk_profiles", "runtime_profiles"],
    icon: ShieldCheck,
    emptyTitle: "No runtime or safety sections",
    emptyBody: "This gateway did not report risk profile or runtime profile sections.",
  },
  channels: {
    id: "channels",
    label: "Channels",
    description: "Configure chat channels, webhooks, tokens, aliases, and agent routing.",
    sectionKeys: ["channels"],
    icon: Network,
    emptyTitle: "No channel sections",
    emptyBody: "This gateway did not report channel config sections.",
  },
  "tools-skills": {
    id: "tools-skills",
    label: "Tools & Skills",
    description: "Add capabilities, connect tools, and check setup.",
    sectionKeys: ["tools", "skills", "skill_bundles", "mcp"],
    icon: Wrench,
    emptyTitle: "No tools or skills sections",
    emptyBody: "This gateway did not report tools, skills, bundles, or MCP sections.",
  },
};

export type LinguiI18n = ReturnType<typeof useLingui>["i18n"];

export function configCategoryLabel(id: ConfigCategoryId, i18n: LinguiI18n) {
  switch (id) {
    case "models-providers":
      return i18n._(msg`Model Connections`);
    case "agents":
      return i18n._(msg`Agents`);
    case "runtime-safety":
      return i18n._(msg`Runtime & Safety`);
    case "channels":
      return i18n._(msg`Channels`);
    case "tools-skills":
      return i18n._(msg`Tools & Skills`);
  }
}

export function configCategoryDescription(id: ConfigCategoryId, i18n: LinguiI18n) {
  switch (id) {
    case "models-providers":
      return i18n._(
        msg`Connect a model service, add credentials, and make it available to agents.`,
      );
    case "agents":
      return i18n._(msg`Configure agent identities, prompts, default profiles, and peer groups.`);
    case "runtime-safety":
      return i18n._(
        msg`Manage risk profiles, runtime tuning, sandbox settings, and command policy.`,
      );
    case "channels":
      return i18n._(msg`Configure chat channels, webhooks, tokens, aliases, and agent routing.`);
    case "tools-skills":
      return i18n._(msg`Add capabilities, connect tools, and check setup.`);
  }
}

export function configCategoryEmptyTitle(id: ConfigCategoryId, i18n: LinguiI18n) {
  switch (id) {
    case "models-providers":
      return i18n._(msg`No model provider sections`);
    case "agents":
      return i18n._(msg`No agent sections`);
    case "runtime-safety":
      return i18n._(msg`No runtime or safety sections`);
    case "channels":
      return i18n._(msg`No channel sections`);
    case "tools-skills":
      return i18n._(msg`No tools or skills sections`);
  }
}

export function configCategoryEmptyBody(id: ConfigCategoryId, i18n: LinguiI18n) {
  switch (id) {
    case "models-providers":
      return i18n._(msg`This gateway did not report provider config sections.`);
    case "agents":
      return i18n._(msg`This gateway did not report agent or peer group config sections.`);
    case "runtime-safety":
      return i18n._(msg`This gateway did not report risk profile or runtime profile sections.`);
    case "channels":
      return i18n._(msg`This gateway did not report channel config sections.`);
    case "tools-skills":
      return i18n._(msg`This gateway did not report tools, skills, bundles, or MCP sections.`);
  }
}

export function configGroupLabel(group: string, i18n: LinguiI18n) {
  switch (group) {
    case "Foundation":
      return i18n._(msg`Foundation`);
    case "Agent":
      return i18n._(msg`Agent`);
    case "Multi-agent":
      return i18n._(msg`Multi-agent`);
    case "Tools":
      return i18n._(msg`Tools`);
    case "Integrations":
      return i18n._(msg`Integrations`);
    case "Network":
      return i18n._(msg`Network`);
    case "Storage":
      return i18n._(msg`Storage`);
    case "Operations":
      return i18n._(msg`Operations`);
    case "Other":
      return i18n._(msg`Other`);
    default:
      return group;
  }
}

export const OVERVIEW_CARDS: Array<
  | { kind: "category"; categoryId: ConfigCategoryId }
  | {
      kind: "link";
      target: string;
      label: string;
      description: string;
      sectionKeys: string[];
      icon: LucideIcon;
    }
> = [
  { kind: "category", categoryId: "models-providers" },
  { kind: "category", categoryId: "agents" },
  { kind: "category", categoryId: "runtime-safety" },
  { kind: "category", categoryId: "channels" },
  {
    kind: "link",
    target: "memory",
    label: "Memory",
    description: "Configure memory backends and choose active memory per agent or profile.",
    sectionKeys: ["memory"],
    icon: Database,
  },
  { kind: "category", categoryId: "tools-skills" },
  {
    kind: "link",
    target: "integrations",
    label: "Integrations",
    description: "Browse integration status and jump into the right gateway configuration.",
    sectionKeys: ["channels", "providers.models", "mcp", "plugins"],
    icon: Boxes,
  },
];

export const GROUP_ICONS: Record<string, LucideIcon> = {
  Foundation: Sparkles,
  Agent: Activity,
  "Multi-agent": Network,
  Tools: Wrench,
  Integrations: Boxes,
  Network,
  Storage: Database,
  Operations: SlidersHorizontal,
  Other: Layers3,
};
