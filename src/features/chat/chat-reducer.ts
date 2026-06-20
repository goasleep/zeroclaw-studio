import type { ChatFrame } from "@/api/ws-chat";
import type { SessionListItem, SessionMessage } from "@/api/sessions";
import { buildApprovalPreview } from "./diff-preview";
import type { ApprovalDecision, ChatMessage, NormalizedSession } from "./chat-types";

const MESSAGE_TIMESTAMP_PREFIX =
  /^\[((?:\d{4}-\d{2}-\d{2})[ T](?:\d{2}:\d{2}(?::\d{2})?)(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?)\]\s*/;

export type ChatAction =
  | { type: "reset" }
  | { type: "select-session"; sessionId: string | null }
  | { type: "hydrate"; sessionId: string; messages: ChatMessage[] }
  | {
      type: "push-user";
      content: string;
      attachments?: Array<{ filename: string; mime_type: string; size?: number }>;
    }
  | {
      type: "approval-response";
      requestId: string;
      decision: ApprovalDecision;
      status: "pending" | "sent" | "error";
      error?: string;
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
  const { timestamp, content } = splitMessageTimestamp(message.content);
  return {
    id: uid(),
    role: message.role,
    content,
    timestamp: message.created_at ?? timestamp,
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
    case "push-user": {
      const timestamp = new Date().toISOString();
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: "user",
            content: action.content,
            timestamp,
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
    }
    case "approval-response":
      return {
        ...state,
        messages: state.messages.map((message) =>
          updateApprovalResponse(message, action.requestId, {
            decision: action.decision,
            status: action.status,
            error: action.error,
          }),
        ),
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
          updated.timestamp ??= new Date().toISOString();
          updated.content += frame.content;
          updated.status = "streaming";
          break;
        case "thinking":
          updated.timestamp ??= new Date().toISOString();
          updated.thinking = (updated.thinking ?? "") + frame.content;
          break;
        case "tool_call":
        case "tool_call_start":
          updated.timestamp ??= new Date().toISOString();
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
          updated.timestamp ??= new Date().toISOString();
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
        case "done": {
          const parsed = splitMessageTimestamp(frame.full_response || updated.content);
          updated.timestamp ??= parsed.timestamp ?? new Date().toISOString();
          updated.content = parsed.content;
          updated.status = "done";
          updated.approval = null;
          updated.cost_usd = frame.cost_usd;
          break;
        }
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

function splitMessageTimestamp(content: string) {
  const match = content.match(MESSAGE_TIMESTAMP_PREFIX);
  if (!match) return { timestamp: null, content };
  return {
    timestamp: match[1],
    content: content.slice(match[0].length),
  };
}

function updateApprovalResponse(
  message: ChatMessage,
  requestId: string,
  response: NonNullable<NonNullable<ChatMessage["approval"]>["response"]>,
) {
  if (message.approval?.request_id !== requestId) return message;
  return {
    ...message,
    approval: {
      ...message.approval,
      response,
    },
  };
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
  const parsedA = parseTimestamp(at);
  const parsedB = parseTimestamp(bt);
  if (parsedA !== null && parsedB !== null) return parsedB - parsedA;
  if (parsedA !== null) return -1;
  if (parsedB !== null) return 1;
  return bt.localeCompare(at);
}

export function isVisibleSession(session: NormalizedSession) {
  return session.message_count == null || session.message_count > 0;
}

export function shortSessionName(id: string) {
  return `session ${id.slice(0, 8)}`;
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;

  const legacy = value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T")
    .replace(/\s+(Z|[+-]\d{2}:?\d{2})$/, "$1");
  const parsed = Date.parse(legacy);
  return Number.isFinite(parsed) ? parsed : null;
}
