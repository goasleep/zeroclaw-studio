// Reconnecting WebSocket chat client.
//
// Gateway endpoint: GET /ws/chat?session_id=&name=&token=
// Subprotocols: ["zeroclaw.v1", "bearer.<token>"]
//
// Server→client frames (tagged via `type` field):
//   session_start, chunk, thinking, tool_call, tool_call_start,
//   tool_result, approval_request, done, aborted, error
//
// Client→server frames:
//   message, approval_response

import { getActiveConnection } from "@/api/tauri";

export type ChatFrame =
  | { type: "session_start"; session_id: string; name?: string; resumed: boolean; message_count: number }
  | { type: "connected"; [k: string]: unknown }
  | { type: "chunk"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_call_start"; name: string }
  | { type: "tool_result"; name: string; output: unknown }
  | {
      type: "approval_request";
      request_id: string;
      tool: string;
      arguments_summary: string;
      timeout_secs?: number;
    }
  | { type: "done"; full_response: string }
  | { type: "aborted" }
  | { type: "error"; message: string };

export type ChatOutbound =
  | { type: "message"; content: string }
  | { type: "approval_response"; request_id: string; decision: "approve" | "deny" | "always" }
  | { type: "connect"; session_id?: string; device_name?: string; capabilities?: string[]; workspace_dir?: string };

export interface ChatClientOpts {
  agentAlias: string;
  /** Optional resume-id. If absent the gateway issues a new session_id. */
  sessionId?: string;
  onFrame: (frame: ChatFrame) => void;
  onOpen?: () => void;
  onClose?: () => void;
  /** Maximum reconnect delay in ms. Default 30s. */
  maxBackoff?: number;
}

export class ChatClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private retryAttempt = 0;
  private connectPromise: Promise<void> | null = null;

  constructor(private opts: ChatClientOpts) {}

  async start(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connect();
    return this.connectPromise;
  }

  send(frame: ChatOutbound) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("chat socket not open");
    }
    this.ws.send(JSON.stringify(frame));
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  private async connect(): Promise<void> {
    const conn = await getActiveConnection();
    if (!conn) throw new Error("no active connection");
    if (!conn.url) throw new Error("active connection has no URL");

    // Build ws URL: http -> ws, https -> wss.
    const httpUrl = new URL(conn.url);
    const protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = new URL(
      `${protocol}//${httpUrl.host}${httpUrl.pathname.replace(/\/$/, "")}/ws/chat`,
    );
    if (this.opts.sessionId) wsUrl.searchParams.set("session_id", this.opts.sessionId);
    if (this.opts.agentAlias) wsUrl.searchParams.set("name", this.opts.agentAlias);
    if (conn.auth.token) wsUrl.searchParams.set("token", conn.auth.token);

    const subprotocols: string[] = ["zeroclaw.v1"];
    if (conn.auth.token) subprotocols.push(`bearer.${conn.auth.token}`);

    this.ws = new WebSocket(wsUrl.toString(), subprotocols);

    this.ws.onopen = () => {
      this.retryAttempt = 0;
      this.opts.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as ChatFrame;
        this.opts.onFrame(frame);
      } catch (err) {
        this.opts.onFrame({
          type: "error",
          message: `bad frame: ${String(err)}`,
        });
      }
    };

    this.ws.onclose = () => {
      this.opts.onClose?.();
      if (!this.closed) void this.reconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror — let it handle reconnect.
    };
  }

  private async reconnect(): Promise<void> {
    this.connectPromise = null;
    const max = this.opts.maxBackoff ?? 30_000;
    const delay = Math.min(1000 * Math.pow(2, this.retryAttempt), max);
    this.retryAttempt += 1;
    await new Promise((r) => setTimeout(r, delay));
    if (this.closed) return;
    return this.start();
  }
}
