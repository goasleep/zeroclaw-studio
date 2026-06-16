// Gateway HTTP client — bearer + 401 dispatch + structured ApiError.
//
// Modeled after `web/src/lib/api.ts` from the main repo (dual MIT/Apache-2.0,
// see docs/reuse-attribution.md). Adapted to read the base URL from the
// active connection rather than a fixed `apiOrigin` — workspace can swap
// connections at runtime and every request follows the new base.

import { getActiveConnection, gatewayRequest } from "@/api/tauri";

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
 * We avoid hitting Tauri on every request because that's an IPC round trip;
 * the cache is invalidated explicitly by the connection context.
 */
interface ActiveSnapshot {
  url: string;
  token: string | null;
}

let cached: ActiveSnapshot | null = null;

export async function refreshActive(): Promise<ActiveSnapshot | null> {
  const c = await getActiveConnection();
  cached = c ? { url: c.url, token: c.auth.token } : null;
  return cached;
}

async function active(): Promise<ActiveSnapshot> {
  const snap = cached ?? (await refreshActive());
  if (!snap) throw new Error("No active connection");
  if (!snap.url) throw new Error("Active connection has no resolved URL");
  return snap;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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
  const body =
    options.body && typeof options.body === "string" ? options.body : null;

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
export const apiSessions = () =>
  apiFetch<{ sessions: Array<{ id: string; name?: string }> }>("/api/sessions");
export const apiMemory = () =>
  apiFetch<{ entries: Array<{ key: string; value: unknown }> }>("/api/memory");
export const apiTools = () =>
  apiFetch<{ tools: Array<{ name: string; [k: string]: unknown }> }>(
    "/api/tools",
  );
export const apiChannels = () =>
  apiFetch<{ channels: Array<{ name: string; [k: string]: unknown }> }>(
    "/api/channels",
  );
export const apiCron = () =>
  apiFetch<{ jobs: Array<{ id: string; name?: string; [k: string]: unknown }> }>(
    "/api/cron",
  );
export const apiIntegrations = () =>
  apiFetch<{ integrations: Array<{ name: string; [k: string]: unknown }> }>(
    "/api/integrations",
  );
export interface LogEvent {
  "@timestamp": string;
  message: string;
  severity_text: string;
  attributes?: Record<string, unknown>;
}

export const apiLogs = (params?: URLSearchParams) =>
  apiFetch<{ events: LogEvent[]; at_end?: boolean }>(
    `/api/logs${params ? `?${params}` : ""}`,
  );
export const apiDoctor = () =>
  apiFetch<{ results: Array<{ severity: string; message: string }> }>(
    "/api/doctor",
  );
export const apiDevices = () =>
  apiFetch<{ devices: Array<{ id: string; name?: string }> }>("/api/devices");

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

export type SelectorChoice<T> =
  | { mode: "existing"; value: string }
  | { mode: "fresh"; value: T };

export interface ModelProviderChoice {
  provider_type: string;
  alias: string;
  model: string;
  fields: Record<string, string>;
}

export type MemoryChoice =
  | "none"
  | "sqlite"
  | "postgres"
  | "qdrant"
  | "markdown"
  | "lucid";

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
