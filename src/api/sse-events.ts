// SSE event stream client for /api/events.
//
// Native EventSource doesn't support custom headers (so it can't carry
// Authorization). We use fetch + ReadableStream instead, mirroring the
// approach used by `web/`.

import { getActiveConnection } from "@/api/tauri";

export type GatewayEvent =
  | { type: "llm_request"; [k: string]: unknown }
  | { type: "tool_call"; [k: string]: unknown }
  | { type: "tool_call_start"; [k: string]: unknown }
  | { type: "tool_result"; [k: string]: unknown }
  | { type: "agent_start"; [k: string]: unknown }
  | { type: "agent_end"; [k: string]: unknown }
  | { type: "cron_result"; [k: string]: unknown }
  | { type: "error"; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

export interface SseStreamOpts {
  onEvent: (event: GatewayEvent) => void;
  onError?: (err: unknown) => void;
  /** Optional AbortSignal to stop streaming. */
  signal?: AbortSignal;
}

export async function subscribeEvents(opts: SseStreamOpts): Promise<void> {
  const conn = await getActiveConnection();
  if (!conn) throw new Error("no active connection");
  if (!conn.url) throw new Error("active connection has no URL");

  const headers = new Headers({ Accept: "text/event-stream" });
  if (conn.auth.token) headers.set("Authorization", `Bearer ${conn.auth.token}`);

  const resp = await fetch(`${conn.url}/api/events`, {
    headers,
    signal: opts.signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`SSE failed: ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by "\n\n".
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      // Strip "data: " prefix on each line; combine multi-line `data:` frames.
      const dataLines = raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart());
      if (!dataLines.length) continue;
      const payload = dataLines.join("\n");
      try {
        const evt = JSON.parse(payload) as GatewayEvent;
        opts.onEvent(evt);
      } catch (err) {
        opts.onError?.(err);
      }
    }
  }
}
