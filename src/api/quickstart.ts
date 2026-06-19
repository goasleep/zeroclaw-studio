import { apiFetch } from "./base";

export interface QuickstartState {
  quickstart_completed: boolean;
  agents: string[];
  risk_profiles: string[];
  runtime_profiles: string[];
  model_providers: string[];
  channels: string[];
  unassigned_channels: string[];
  storage: string[];
  model_provider_types: Array<{
    kind: string;
    display_name: string;
    local: boolean;
  }>;
  channel_types: Array<{
    kind: string;
    display_name: string;
    local: boolean;
  }>;
  risk_presets: QuickstartPreset[];
  runtime_presets: QuickstartPreset[];
  memory_kinds: string[];
  personality_files: string[];
}

export interface QuickstartPreset {
  preset_name?: string;
  key?: string;
  label: string;
  help?: string;
  description?: string;
}

export interface NormalizedQuickstartPreset {
  key: string;
  label: string;
  description: string;
}

export interface FieldDescriptor {
  key: string;
  label: string;
  help: string;
  kind: string;
  is_secret: boolean;
  enum_variants: string[] | null;
  required: boolean;
  default: string | null;
}

export interface QuickstartFieldsRequest {
  section: "model_provider" | "channel" | "peer_group";
  type_key: string;
}

export interface QuickstartFieldsResult {
  fields: FieldDescriptor[];
}

export interface BuilderSubmission {
  model_provider: SelectorChoice<ModelProviderChoice>;
  risk_profile: SelectorChoice<string>;
  runtime_profile: SelectorChoice<string>;
  memory: SelectorChoice<MemoryChoice>;
  channels: SelectorChoice<ChannelQuickStart>[];
  peer_groups: QuickstartPeerGroup[];
  agent: AgentIdentity;
}

export type SelectorChoice<T> = { mode: "existing"; value: string } | { mode: "fresh"; value: T };

export interface ModelProviderChoice {
  provider_type: string;
  alias: string;
  model: string;
  fields: Record<string, string>;
}

export type MemoryChoice = "none" | "sqlite" | "postgres" | "qdrant" | "markdown" | "lucid";

export interface ChannelQuickStart {
  channel_type: string;
  alias: string;
  token?: string;
}

export interface QuickstartPeerGroup {
  name: string;
  channel: string;
  external_peers?: string[];
  ignore?: string[];
}

export interface AgentIdentity {
  name: string;
  system_prompt: string;
  personality_file?: string;
  personality_files?: Array<{ filename: string; content: string }>;
}

export type ValidateResult =
  | { kind: "ok" }
  | { kind: "errors"; errors: Array<{ step: string; field: string; message: string }> };

export type ApplyResult =
  | {
      kind: "applied";
      agent: {
        alias: string;
        model_provider: string;
        risk_profile: string;
        runtime_profile: string;
        channels: string[];
        memory_backend: string;
      };
      daemon_restarted: boolean;
    }
  | { kind: "errors"; errors: Array<{ step: string; field: string; message: string }> };

export const apiQuickstartState = () => apiFetch<QuickstartState>("/api/quickstart/state");

export const apiQuickstartFields = (req: QuickstartFieldsRequest) =>
  apiFetch<QuickstartFieldsResult>("/api/quickstart/fields", {
    method: "POST",
    body: JSON.stringify(req),
  });

export const apiQuickstartValidate = (submission: BuilderSubmission) =>
  apiFetch<ValidateResult>("/api/quickstart/validate", {
    method: "POST",
    body: JSON.stringify(submission),
  });

export const apiQuickstartApply = (submission: BuilderSubmission) =>
  apiFetch<ApplyResult>("/api/quickstart/apply", {
    method: "POST",
    body: JSON.stringify(submission),
  });

export const apiQuickstartDismiss = (req: {
  run_id: string;
  surface: "web" | "tui" | "cli" | "test";
  last_step?: string;
}) =>
  apiFetch<undefined>("/api/quickstart/dismiss", {
    method: "POST",
    body: JSON.stringify(req),
  });

export function normalizeQuickstartPreset(preset: QuickstartPreset): NormalizedQuickstartPreset {
  return {
    key: preset.preset_name ?? preset.key ?? "",
    label: preset.label,
    description: preset.help ?? preset.description ?? "",
  };
}
