// Gateway HTTP client — bearer + 401 dispatch + structured ApiError.
//
// Modeled after `web/src/lib/api.ts` from the main repo (dual MIT/Apache-2.0,
// see docs/reuse-attribution.md). Adapted to read the base URL from the
// active connection rather than a fixed `apiOrigin` — workspace can swap
// connections at runtime and every request follows the new base.

import { getActiveConnection } from "@/api/tauri";

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
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    options.body &&
    typeof options.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${url}${path}`, { ...options, headers });

  if (response.status === 401) {
    cached = null;
    window.dispatchEvent(new Event("zeroclaw-unauthorized"));
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.code === "string" &&
          typeof parsed.message === "string"
        ) {
          throw new ApiError(response.status, parsed);
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
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
export const apiLogs = (params?: URLSearchParams) =>
  apiFetch<{ lines: Array<{ level: string; message: string; ts?: string }> }>(
    `/api/logs${params ? `?${params}` : ""}`,
  );
export const apiDoctor = () =>
  apiFetch<{ results: Array<{ severity: string; message: string }> }>(
    "/api/doctor",
  );
export const apiDevices = () =>
  apiFetch<{ devices: Array<{ id: string; name?: string }> }>("/api/devices");
