// Gateway HTTP client — bearer + 401 dispatch + structured ApiError.
//
// Modeled after `web/src/lib/api.ts` from the main repo (dual MIT/Apache-2.0,
// see docs/reuse-attribution.md). Adapted to read the base URL from the
// active connection rather than a fixed `apiOrigin` — workspace can swap
// connections at runtime and every request follows the new base.

import { getActiveConnection, gatewayRequest, type Connection } from "@/api/tauri";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: {
      code: string;
      message: string;
      path?: string;
      op_index?: number;
    },
  ) {
    super(`[${envelope.code}] ${envelope.message}`);
    this.name = "ApiError";
  }
}

/**
 * Resolved active-connection details cached for a single request burst. Refresh
 * by calling `refreshActive()` (e.g. when the user switches connections).
 *
 * We avoid hitting Tauri on every request because that's an IPC round trip.
 * The connection context keeps this snapshot in sync whenever the active
 * connection changes.
 */
interface ActiveSnapshot {
  url: string;
  token: string | null;
}

let cached: ActiveSnapshot | null = null;

export function cacheActiveConnection(conn: Connection | null): ActiveSnapshot | null {
  cached = conn ? { url: conn.url, token: conn.auth.token } : null;
  return cached;
}

export async function refreshActive(): Promise<ActiveSnapshot | null> {
  const c = await getActiveConnection();
  return cacheActiveConnection(c);
}

async function active(): Promise<ActiveSnapshot> {
  const snap = cached ?? (await refreshActive());
  if (!snap) throw new Error("No active connection");
  if (!snap.url) throw new Error("Active connection has no resolved URL");
  return snap;
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const { url, token } = await active();
  const headers: Array<[string, string]> = [];

  // Seed from any caller-supplied headers
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => headers.push([k, v]));
    } else if (Array.isArray(options.headers)) {
      for (const [k, v] of options.headers) headers.push([k, v]);
    } else {
      for (const [k, v] of Object.entries(options.headers)) {
        if (v !== undefined) headers.push([k, String(v)]);
      }
    }
  }

  if (token) headers.push(["Authorization", `Bearer ${token}`]);
  if (
    options.body &&
    typeof options.body === "string" &&
    !headers.some(([k]) => k.toLowerCase() === "content-type")
  ) {
    headers.push(["Content-Type", "application/json"]);
  }

  const method = options.method ?? "GET";
  const body = options.body && typeof options.body === "string" ? options.body : null;

  const res = await gatewayRequest({
    method,
    url: `${url}${path}`,
    headers,
    body,
  });

  if (res.status === 401) {
    cached = null;
    window.dispatchEvent(new Event("zeroclaw-unauthorized"));
    throw new UnauthorizedError();
  }

  if (res.status < 200 || res.status >= 300) {
    const text = res.body;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.code === "string" &&
          typeof parsed.message === "string"
        ) {
          throw new ApiError(res.status, parsed);
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
    throw new Error(`API ${res.status}: ${text || ""}`);
  }

  if (res.status === 204) return undefined as unknown as T;
  return JSON.parse(res.body) as T;
}

// ---- Endpoint helpers organised by area. Add as we wire features in. ----

export interface StatusResponse {
  version: string;
  uptime_secs?: number;
  agents?: Record<string, unknown>;
  [k: string]: unknown;
}

export const apiStatus = () => apiFetch<StatusResponse>("/api/status");
export const apiHealth = () =>
  apiFetch<{ status: string; require_pairing?: boolean }>("/api/health");
export interface SessionListItem {
  id?: string;
  session_id?: string;
  name?: string | null;
  agent_alias?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  message_count?: number | null;
  [k: string]: unknown;
}

export const apiSessions = () => apiFetch<{ sessions: SessionListItem[] }>("/api/sessions");
export interface SessionMessage {
  role: string;
  content: string;
  created_at?: string | null;
}

export const apiSessionMessages = (sessionId: string) =>
  apiFetch<{
    session_id: string;
    messages: SessionMessage[];
    session_persistence: boolean;
  }>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
export const apiSessionRename = (sessionId: string, name: string) =>
  apiFetch<SessionListItem>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
export const apiSessionDelete = (sessionId: string) =>
  apiFetch<undefined>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
export const apiSessionAbort = (sessionId: string) =>
  apiFetch<undefined>(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: "POST",
  });
export const apiMemory = () =>
  apiFetch<{ entries: Array<{ key: string; value: unknown }> }>("/api/memory");
export const apiTools = () =>
  apiFetch<{ tools: Array<{ name: string; [k: string]: unknown }> }>("/api/tools");
export interface ChannelInfo {
  name: string;
  type?: string;
  alias?: string;
  owning_agent?: string | null;
  enabled?: boolean;
  compiled?: boolean;
  status?: string;
  message_count?: number;
  last_message_at?: string | null;
  health?: string;
  readiness?: string;
  [k: string]: unknown;
}

export const apiChannels = () => apiFetch<{ channels: ChannelInfo[] }>("/api/channels");
export const apiCron = () =>
  apiFetch<{ jobs: Array<{ id: string; name?: string; [k: string]: unknown }> }>("/api/cron");

export interface IntegrationInfo {
  name: string;
  description?: string;
  category?: "Chat" | "AiModel" | "ToolsAutomation" | "Platform" | string;
  status?: "Active" | "Available" | string;
  [k: string]: unknown;
}

export const apiIntegrations = () =>
  apiFetch<{ integrations: IntegrationInfo[] }>("/api/integrations");
export interface LogEvent {
  "@timestamp": string;
  message: string;
  severity_text: string;
  attributes?: Record<string, unknown>;
}

export const apiLogs = (params?: URLSearchParams) =>
  apiFetch<{ events: LogEvent[]; at_end?: boolean }>(`/api/logs${params ? `?${params}` : ""}`);
export const apiDoctor = () =>
  apiFetch<{ results: Array<{ severity: string; message: string }> }>("/api/doctor");
export const apiDevices = () =>
  apiFetch<{ devices: Array<{ id: string; name?: string }> }>("/api/devices");

export interface AgentWorkspaceEntry {
  name?: string;
  path: string;
  is_dir?: boolean;
  isDir?: boolean;
  [k: string]: unknown;
}

export const apiAgentWorkspaceList = (alias: string, path?: string) =>
  apiFetch<{ entries: AgentWorkspaceEntry[] }>(
    `/api/agents/${encodeURIComponent(alias)}/workspace/list${
      path ? `?path=${encodeURIComponent(path)}` : ""
    }`,
  );

// ---- Gateway config sections ----

export type ConfigSectionShape =
  | "direct_form"
  | "one_tier_alias_map"
  | "typed_family_map"
  | "backend_picker";

export interface ConfigSectionInfo {
  key: string;
  label: string;
  help: string;
  has_picker: boolean;
  completed: boolean;
  ready: boolean;
  group: string;
  is_quickstart: boolean;
  shape?: ConfigSectionShape | null;
}

export interface ConfigListEntry {
  path: string;
  category: string;
  kind: string;
  type_hint: string;
  value?: unknown;
  populated: boolean;
  is_secret: boolean;
  is_env_overridden?: boolean;
  enum_variants?: string[];
  section?: string;
  tab?: string;
}

export interface PickerItem {
  key: string;
  label: string;
  description?: string;
  badge?: string;
}

export interface ConfigListResponse {
  entries: ConfigListEntry[];
  drifted?: Array<{ path: string; [k: string]: unknown }>;
}

export interface SelectItemResponse {
  fields_prefix: string;
  created: boolean;
}

export interface PatchOp {
  op: "add" | "replace" | "remove" | "test" | "comment";
  path: string;
  value?: unknown;
  comment?: string;
}

export const apiConfigSections = () =>
  apiFetch<{ sections: ConfigSectionInfo[] }>("/api/config/sections");

export const apiConfigPicker = (section: string) =>
  apiFetch<{ section: string; items: PickerItem[]; help: string }>(
    `/api/config/sections/${encodeURIComponent(section)}`,
  );

export const apiConfigSelectItem = (section: string, key: string, alias?: string) =>
  apiFetch<SelectItemResponse>(
    `/api/config/sections/${encodeURIComponent(section)}/items/${encodeURIComponent(key)}`,
    {
      method: "POST",
      body: alias ? JSON.stringify({ alias }) : undefined,
    },
  );

export const apiConfigList = (prefix?: string) =>
  apiFetch<ConfigListResponse>(
    `/api/config/list${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
  );

export const apiConfigPatch = (ops: PatchOp[]) =>
  apiFetch<{ saved: boolean; results: unknown[]; warnings?: unknown[] }>("/api/config", {
    method: "PATCH",
    body: JSON.stringify(ops),
  });

export interface ConfigTemplate {
  key?: string;
  name?: string;
  label?: string;
  description?: string;
  section?: string;
  family?: string;
  type?: string;
  values?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ConfigMapKey {
  key: string;
  label?: string;
  type?: string;
  path?: string;
  [k: string]: unknown;
}

export const apiConfigProp = (path: string, reveal = false) =>
  apiFetch<{ value?: unknown; populated?: boolean; is_secret?: boolean }>(
    `/api/config/prop?path=${encodeURIComponent(path)}${reveal ? "&reveal=true" : ""}`,
  );

export const apiConfigPutProp = (path: string, value: unknown) =>
  apiFetch<{ saved?: boolean }>(`/api/config/prop?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ path, value }),
  });

export const apiConfigDeleteProp = (path: string) =>
  apiFetch<{ saved?: boolean }>(`/api/config/prop?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });

export const apiConfigTemplates = (section?: string) =>
  apiFetch<{ templates: ConfigTemplate[] }>(
    `/api/config/templates${section ? `?section=${encodeURIComponent(section)}` : ""}`,
  );

export const apiConfigMapKeys = (path: string) =>
  apiFetch<{ keys: ConfigMapKey[] }>(`/api/config/map-key?path=${encodeURIComponent(path)}`);

export const apiConfigCreateMapKey = (path: string, key: string, template?: string) =>
  apiFetch<{ path?: string; created?: boolean; fields_prefix?: string }>("/api/config/map-key", {
    method: "POST",
    body: JSON.stringify({ path, key, template }),
  });

export const apiConfigDeleteMapKey = (path: string, key: string) =>
  apiFetch<{ deleted?: boolean }>("/api/config/map-key", {
    method: "DELETE",
    body: JSON.stringify({ path, key }),
  });

export const apiConfigCatalog = (path?: string) =>
  apiFetch<unknown>(`/api/config/catalog${path ? `?path=${encodeURIComponent(path)}` : ""}`);

export const apiConfigDrift = () =>
  apiFetch<{ drifted?: unknown[]; [k: string]: unknown }>("/api/config/drift");

export const apiConfigReloadStatus = () =>
  apiFetch<{ status?: string; last_reload_at?: string; [k: string]: unknown }>(
    "/api/config/reload-status",
  );

export interface SkillBundle {
  id?: string;
  name?: string;
  bundles?: SkillBundle[];
  skills?: Array<{ id?: string; name?: string; enabled?: boolean; [k: string]: unknown }>;
  [k: string]: unknown;
}

export const apiSkillBundles = () => apiFetch<{ bundles: SkillBundle[] }>("/api/skills/bundles");

export const apiSkillBundle = (bundleId: string) =>
  apiFetch<SkillBundle>(`/api/skills/bundles/${encodeURIComponent(bundleId)}`);

export const apiSkillBundlePatch = (bundleId: string, body: unknown) =>
  apiFetch<SkillBundle>(`/api/skills/bundles/${encodeURIComponent(bundleId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

// ---- Quickstart / Agent Setup ----

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
  risk_presets: Array<{
    key: string;
    label: string;
    description: string;
  }>;
  runtime_presets: Array<{
    key: string;
    label: string;
    description: string;
  }>;
  memory_kinds: string[];
  personality_files: string[];
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
