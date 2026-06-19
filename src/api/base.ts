// Gateway HTTP client — bearer + 401 dispatch + structured ApiError.

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
