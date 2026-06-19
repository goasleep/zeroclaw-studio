import type { LucideIcon } from "lucide-react";
import type { ConfigSectionInfo } from "@/api/config";
import type { AgentSummary, RiskProfileSummary, RuntimeProfileSummary } from "@/api/tauri";

export type PanelMode = "overview" | "sections" | "advanced";
export type StatusFilter = "all" | "needs" | "ready";
export type FormTarget = {
  prefix: string;
  title: string;
  subtitle?: string;
  initialTab?: "fields" | "setup";
};
export type TaskState = "ready" | "needs" | "neutral";
export type ConfigCategoryId =
  | "models-providers"
  | "agents"
  | "runtime-safety"
  | "channels"
  | "tools-skills";
export type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; sections: ConfigSectionInfo[] }
  | { kind: "error"; message: string };

export interface ConfigCategory {
  id: ConfigCategoryId;
  label: string;
  description: string;
  sectionKeys: string[];
  icon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
}

export type SummaryKind = "agents" | "risk_profiles" | "runtime_profiles";
export type ConfigSummaryRows = {
  agents: AgentSummary[];
  risk_profiles: RiskProfileSummary[];
  runtime_profiles: RuntimeProfileSummary[];
};

export type ModelConnection = {
  providerKey: string;
  providerLabel: string;
  alias: string;
  badge?: string;
};

export type ChannelConnection = {
  channelKey: string;
  channelLabel: string;
  name: string;
  badge?: string;
};
