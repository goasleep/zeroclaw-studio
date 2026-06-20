import type { ChatMode } from "@/api/ws-chat";
import type { DiffPreview } from "./diff-preview";

export type MessageRole = "user" | "assistant";

export interface NormalizedSession {
  session_id: string;
  name: string;
  agent_alias?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  message_count?: number | null;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  thinking?: string;
  toolCalls: Array<{ name: string; args: unknown; result?: unknown }>;
  attachments?: Array<{ filename: string; mime_type: string; size?: number }>;
  approval?: {
    request_id: string;
    tool: string;
    arguments_summary: string;
    timeout_secs?: number;
    preview?: DiffPreview | null;
  } | null;
  status: "pending" | "streaming" | "done" | "aborted" | "error";
  error?: string;
  cost_usd?: number;
}

export interface UseChatOptions {
  connectionId: string;
  agentAlias: string;
  mode?: ChatMode;
  workspaceRoot?: string | null;
  workspaceDir?: string | null;
}

export interface ChatModelOverride {
  modelProvider?: string | null;
  model?: string | null;
}
