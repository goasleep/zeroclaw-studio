import type { ChatFrame } from "@/api/ws-chat";
import type { SessionListItem, SessionMessage } from "@/api/sessions";
import { buildApprovalPreview } from "./diff-preview";
import type { ChatMessage, NormalizedSession } from "./chat-types";

const MAX_CACHED_MESSAGES = 200;

export type ChatAction =
  | { type: "reset" }
  | { type: "select-session"; sessionId: string | null }
  | { type: "hydrate"; sessionId: string; messages: ChatMessage[] }
  | {
      type: "push-user";
      content: string;
      attachments?: Array<{ filename: string; mime_type: string; size?: number }>;
    }
  | { type: "frame"; frame: ChatFrame };

export interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
}

function uid() {
  return crypto.randomUUID();
}

export function fromSessionMessage(message: SessionMessage): ChatMessage | null {
  if (message.role !== "user" && message.role !== "assistant") return null;
  return {
    id: uid(),
    role: message.role,
    content: message.content,
    toolCalls: [],
    status: "done",
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "reset":
      return { messages: [], sessionId: state.sessionId };
    case "select-session":
      return { messages: [], sessionId: action.sessionId };
    case "hydrate":
      if (state.sessionId !== action.sessionId || state.messages.length > 0) {
        return state;
      }
      return { ...state, messages: action.messages };
    case "push-user":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: "user",
            content: action.content,
            attachments: action.attachments,
            toolCalls: [],
            status: "done",
          },
          {
            id: uid(),
            role: "assistant",
            content: "",
            toolCalls: [],
            status: "pending",
          },
        ],
      };
    case "frame": {
      const frame = action.frame;
      if (frame.type === "session_start") {
        return { ...state, sessionId: frame.session_id };
      }

      const last = state.messages[state.messages.length - 1];
      if (!last || last.role !== "assistant") return state;

      const updated: ChatMessage = { ...last };
      switch (frame.type) {
        case "chunk":
          updated.content += frame.content;
          updated.status = "streaming";
          break;
        case "thinking":
          updated.thinking = (updated.thinking ?? "") + frame.content;
          break;
        case "tool_call":
        case "tool_call_start":
          updated.toolCalls = [
            ...updated.toolCalls,
            { name: frame.name, args: "args" in frame ? frame.args : undefined },
          ];
          break;
        case "tool_result": {
          const idx = updated.toolCalls.map((t) => t.name).lastIndexOf(frame.name);
          if (idx >= 0) {
            updated.toolCalls = updated.toolCalls.map((t, i) =>
              i === idx ? { ...t, result: frame.output } : t,
            );
          }
          break;
        }
        case "approval_request": {
          const recentArgs = [...updated.toolCalls]
            .reverse()
            .find((t) => t.name === frame.tool && t.args !== undefined)?.args;
          updated.approval = {
            request_id: frame.request_id,
            tool: frame.tool,
            arguments_summary: frame.arguments_summary,
            timeout_secs: frame.timeout_secs,
            preview: buildApprovalPreview(frame.tool, recentArgs),
          };
          break;
        }
        case "done":
          updated.content = frame.full_response || updated.content;
          updated.status = "done";
          updated.approval = null;
          updated.cost_usd = frame.cost_usd;
          break;
        case "aborted":
          updated.status = "aborted";
          break;
        case "error":
          updated.status = "error";
          updated.error = frame.message;
          break;
        default:
          return state;
      }
      return {
        ...state,
        messages: [...state.messages.slice(0, -1), updated],
      };
    }
  }
}

export function normalizeSession(item: SessionListItem): NormalizedSession | null {
  const id = item.session_id ?? item.id;
  if (!id) return null;
  return {
    session_id: id,
    name: item.name || shortSessionName(id),
    agent_alias: item.agent_alias,
    created_at: item.created_at,
    updated_at: item.updated_at,
    last_message_at: item.last_message_at,
    message_count: item.message_count,
  };
}

export function sessionSort(a: NormalizedSession, b: NormalizedSession) {
  const at = a.last_message_at ?? a.updated_at ?? a.created_at ?? "";
  const bt = b.last_message_at ?? b.updated_at ?? b.created_at ?? "";
  return bt.localeCompare(at);
}

export function shortSessionName(id: string) {
  return `session ${id.slice(0, 8)}`;
}

export function mergeTranscripts(gatewayMessages: ChatMessage[], cachedMessages: ChatMessage[]) {
  if (cachedMessages.length === 0) return gatewayMessages;
  if (gatewayMessages.length === 0) return cachedMessages;

  const merged = [...gatewayMessages];
  const seen = new Set(gatewayMessages.map(messageSignature));
  for (const message of cachedMessages) {
    const signature = messageSignature(message);
    if (seen.has(signature)) continue;
    merged.push(message);
    seen.add(signature);
  }
  return merged.slice(-MAX_CACHED_MESSAGES);
}

function messageSignature(message: ChatMessage) {
  return [
    message.role,
    message.status,
    message.content,
    message.error ?? "",
    message.attachments?.map((a) => a.filename).join(",") ?? "",
  ].join("\u0000");
}
