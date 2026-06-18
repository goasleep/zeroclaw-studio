// Chat WebSocket client — routed through the Rust backend via Tauri IPC.
//
// The WebView cannot reliably open WebSockets to localhost (macOS WKWebView
// blocks them with a bare error), so this client asks the Rust layer to
// maintain the actual `tokio-tungstenite` connection and forwards frames
// through Tauri events.

import { listen } from "@tauri-apps/api/event";
import { chatConnect, chatDisconnect, chatSend, getActiveConnection } from "@/api/tauri";

export type ChatMode = "chat" | "acp";

export type FileEntry = {
  path?: string | null;
  data_b64?: string | null;
  filename: string;
  mime_type: string;
  size?: number;
  source: "file" | "clipboard";
};

export type ChatFrame =
  | {
      type: "session_start";
      session_id: string;
      name?: string;
      resumed: boolean;
      message_count: number;
    }
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
  | { type: "done"; full_response: string; cost_usd?: number }
  | { type: "aborted" }
  | { type: "error"; message: string };

export type ChatOutbound =
  | { type: "message"; content: string; attachments?: FileEntry[] }
  | { type: "approval_response"; request_id: string; decision: "approve" | "deny" | "always" }
  | {
      type: "connect";
      session_id?: string;
      device_name?: string;
      capabilities?: string[];
      workspace_dir?: string;
    };

export interface ChatClientOpts {
  agentAlias: string;
  mode?: ChatMode;
  workspaceDir?: string | null;
  sessionId?: string;
  onFrame: (frame: ChatFrame) => void;
  onOpen?: () => void;
  onClose?: () => void;
  /** Maximum reconnect delay in ms. Default 30s. */
  maxBackoff?: number;
}

const CHAT_FRAME_EVENT = "zeroclaw://chat-frame";
const CHAT_CLOSE_EVENT = "zeroclaw://chat-close";

interface ChatFrameEvent {
  session_id: string;
  frame: string;
}

interface ChatCloseEvent {
  session_id: string;
}

export class ChatClient {
  private sessionId: string | null = null;
  private closed = false;
  private retryAttempt = 0;
  private connectPromise: Promise<void> | null = null;
  private unlisten: (() => void) | null = null;
  private closeListeners: Array<() => void> = [];

  constructor(private opts: ChatClientOpts) {}

  async start(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connect();
    return this.connectPromise;
  }

  send(frame: ChatOutbound) {
    if (!this.sessionId) {
      throw new Error("chat socket not open");
    }
    void chatSend({
      session_id: this.sessionId,
      frame: JSON.stringify(frame),
    });
  }

  close() {
    this.closed = true;
    this.unlisten?.();
    this.unlisten = null;
    this.closeListeners.forEach((u) => u());
    this.closeListeners = [];
    if (this.sessionId) {
      void chatDisconnect({ session_id: this.sessionId });
      this.sessionId = null;
    }
  }

  private async connect(): Promise<void> {
    const conn = await getActiveConnection();
    if (!conn) throw new Error("no active connection");
    if (!conn.url) throw new Error("active connection has no URL");

    const sessionId = this.opts.sessionId ?? crypto.randomUUID();
    this.sessionId = sessionId;

    this.unlisten = await listen<ChatFrameEvent>(CHAT_FRAME_EVENT, (event) => {
      if (event.payload.session_id !== this.sessionId) return;
      try {
        const frame = JSON.parse(event.payload.frame) as ChatFrame;
        this.opts.onFrame(frame);
      } catch (err) {
        this.opts.onFrame({
          type: "error",
          message: `bad frame: ${String(err)}`,
        });
      }
    });

    // Watch for the Rust-side connection closing and reconnect unless the
    // client was explicitly closed.
    const unlistenClose = await listen<ChatCloseEvent>(CHAT_CLOSE_EVENT, (event) => {
      if (event.payload.session_id !== this.sessionId) return;
      this.unlisten?.();
      this.unlisten = null;
      if (!this.closed) {
        void this.reconnect();
      } else {
        this.opts.onClose?.();
      }
    });
    this.closeListeners.push(unlistenClose);

    const info = await chatConnect({
      url: conn.url,
      agent_alias: this.opts.agentAlias,
      session_id: sessionId,
      token: conn.auth.token ?? "",
      mode: this.opts.mode ?? "chat",
      workspace_dir: this.opts.workspaceDir ?? null,
    }).catch((err) => {
      this.unlisten?.();
      this.unlisten = null;
      this.closeListeners.forEach((u) => u());
      this.closeListeners = [];
      this.sessionId = null;
      throw err;
    });

    this.sessionId = info.session_id;
    this.retryAttempt = 0;
    this.opts.onOpen?.();
  }

  private async reconnect(): Promise<void> {
    this.connectPromise = null;
    this.sessionId = null;
    this.unlisten?.();
    this.unlisten = null;
    this.closeListeners.forEach((u) => u());
    this.closeListeners = [];

    const max = this.opts.maxBackoff ?? 30_000;
    const delay = Math.min(1000 * Math.pow(2, this.retryAttempt), max);
    this.retryAttempt += 1;
    await new Promise((r) => setTimeout(r, delay));

    if (this.closed) {
      this.opts.onClose?.();
      return;
    }
    return this.start();
  }
}
