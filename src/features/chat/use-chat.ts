// Per-agent chat client. Wraps the WS reconnecting client, tracks the
// message log, exposes session management, attachments, abort, and approvals.

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ChatClient,
  type ChatFrame,
  type ChatMode,
  type FileEntry,
} from "@/api/ws-chat";
import {
  apiSessionAbort,
  apiSessionDelete,
  apiSessionMessages,
  apiSessionRename,
  apiSessions,
  type SessionListItem,
  type SessionMessage,
} from "@/api/client";
import { buildApprovalPreview, type DiffPreview } from "./diff-preview";

const SESSION_KEY = (alias: string, mode: ChatMode) =>
  `zeroclaw_session_id.${mode}.${alias}`;
const TRANSCRIPT_KEY = (alias: string, mode: ChatMode, sessionId: string) =>
  `zeroclaw_transcript.${mode}.${alias}.${sessionId}`;
const MAX_CACHED_MESSAGES = 200;

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

type Action =
  | { type: "reset" }
  | { type: "select-session"; sessionId: string | null }
  | { type: "hydrate"; sessionId: string; messages: ChatMessage[] }
  | {
      type: "push-user";
      content: string;
      attachments?: Array<{ filename: string; mime_type: string; size?: number }>;
    }
  | { type: "frame"; frame: ChatFrame };

interface State {
  messages: ChatMessage[];
  sessionId: string | null;
}

export interface UseChatOptions {
  agentAlias: string;
  mode?: ChatMode;
  workspaceDir?: string | null;
}

function uid() {
  return crypto.randomUUID();
}

function fromSessionMessage(message: SessionMessage): ChatMessage | null {
  if (message.role !== "user" && message.role !== "assistant") return null;
  return {
    id: uid(),
    role: message.role,
    content: message.content,
    toolCalls: [],
    status: "done",
  };
}

function reducer(state: State, action: Action): State {
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
          const idx = updated.toolCalls
            .map((t) => t.name)
            .lastIndexOf(frame.name);
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

export function useChat({
  agentAlias,
  mode = "chat",
  workspaceDir = null,
}: UseChatOptions) {
  const storageKey = SESSION_KEY(agentAlias, mode);
  const [state, dispatch] = useReducer(reducer, {
    messages: [],
    sessionId: localStorage.getItem(storageKey),
  });
  const [sessions, setSessions] = useState<NormalizedSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionSeed, setConnectionSeed] = useState(0);
  const clientRef = useRef<ChatClient | null>(null);
  const hydratedSessionRef = useRef<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionError(null);
    try {
      const data = await apiSessions();
      const normalized = data.sessions
        .map(normalizeSession)
        .filter((s): s is NormalizedSession => s !== null)
        .filter((s) => !s.agent_alias || s.agent_alias === agentAlias)
        .sort(sessionSort);
      setSessions(normalized);
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSessionsLoading(false);
    }
  }, [agentAlias]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!state.sessionId || state.messages.length === 0) return;
    writeTranscriptCache(agentAlias, mode, state.sessionId, state.messages);
  }, [agentAlias, mode, state.sessionId, state.messages]);

  useEffect(() => {
    if (!agentAlias) return;
    const storedSessionId = localStorage.getItem(storageKey);
    hydratedSessionRef.current = null;
    dispatch({ type: "select-session", sessionId: storedSessionId });
    setConnected(false);

    async function hydrateSession(sessionId: string, messageCount?: number) {
      if (hydratedSessionRef.current === sessionId) return;
      hydratedSessionRef.current = sessionId;
      const cachedMessages = readTranscriptCache(agentAlias, mode, sessionId);
      if (messageCount !== undefined && messageCount <= 0) {
        if (cachedMessages.length > 0) {
          dispatch({ type: "hydrate", sessionId, messages: cachedMessages });
        }
        return;
      }
      try {
        const transcript = await apiSessionMessages(sessionId);
        const gatewayMessages = transcript.messages
          .map(fromSessionMessage)
          .filter((m): m is ChatMessage => m !== null);
        const messages = mergeTranscripts(gatewayMessages, cachedMessages);
        dispatch({ type: "hydrate", sessionId, messages });
      } catch {
        if (cachedMessages.length > 0) {
          dispatch({ type: "hydrate", sessionId, messages: cachedMessages });
        }
        hydratedSessionRef.current = null;
      }
    }

    const client = new ChatClient({
      agentAlias,
      mode,
      workspaceDir,
      sessionId: storedSessionId ?? undefined,
      onFrame: (frame) => {
        dispatch({ type: "frame", frame });
        if (frame.type === "session_start") {
          localStorage.setItem(storageKey, frame.session_id);
          void hydrateSession(frame.session_id, frame.message_count);
          void refreshSessions();
        }
        if (frame.type === "approval_request") {
          window.dispatchEvent(
            new CustomEvent("zeroclaw://approval-request", {
              detail: { tool: frame.tool },
            }),
          );
        }
        if (frame.type === "done") {
          window.dispatchEvent(
            new CustomEvent("zeroclaw://chat-done", {
              detail: { agent: agentAlias },
            }),
          );
          void refreshSessions();
        }
      },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    clientRef.current = client;
    void client.start().catch((e) => {
      setConnected(false);
      setSessionError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [
    agentAlias,
    mode,
    workspaceDir,
    storageKey,
    connectionSeed,
    refreshSessions,
  ]);

  const selectSession = useCallback(
    (sessionId: string | null) => {
      if (sessionId) localStorage.setItem(storageKey, sessionId);
      else localStorage.removeItem(storageKey);
      hydratedSessionRef.current = null;
      dispatch({ type: "select-session", sessionId });
      setConnectionSeed((n) => n + 1);
    },
    [storageKey],
  );

  const newSession = useCallback(() => {
    selectSession(null);
  }, [selectSession]);

  const renameSession = useCallback(
    async (sessionId: string, name: string) => {
      await apiSessionRename(sessionId, name);
      await refreshSessions();
    },
    [refreshSessions],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await apiSessionDelete(sessionId);
      clearTranscriptCache(agentAlias, mode, sessionId);
      if (state.sessionId === sessionId) {
        localStorage.removeItem(storageKey);
        selectSession(null);
      }
      await refreshSessions();
    },
    [agentAlias, mode, refreshSessions, selectSession, state.sessionId, storageKey],
  );

  const send = useCallback(
    (content: string, attachments?: FileEntry[]) => {
      if (!clientRef.current) return;
      const attachmentSummary = attachments?.map((a) => ({
        filename: a.filename,
        mime_type: a.mime_type,
        size: a.size,
      }));
      dispatch({ type: "push-user", content, attachments: attachmentSummary });
      clientRef.current.send({
        type: "message",
        content,
        attachments: attachments?.length ? attachments : undefined,
      });
    },
    [],
  );

  const respondToApproval = useCallback(
    (request_id: string, decision: "approve" | "deny" | "always") => {
      if (!clientRef.current) return;
      clientRef.current.send({
        type: "approval_response",
        request_id,
        decision,
      });
    },
    [],
  );

  const abort = useCallback(async () => {
    if (!state.sessionId) return;
    try {
      await apiSessionAbort(state.sessionId);
    } catch {
      // ignore — UI just shows the current state
    }
  }, [state.sessionId]);

  const clear = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  return useMemo(
    () => ({
      messages: state.messages,
      sessionId: state.sessionId,
      sessions,
      sessionsLoading,
      sessionError,
      connected,
      send,
      respondToApproval,
      abort,
      clear,
      refreshSessions,
      selectSession,
      newSession,
      renameSession,
      deleteSession,
    }),
    [
      state,
      sessions,
      sessionsLoading,
      sessionError,
      connected,
      send,
      respondToApproval,
      abort,
      clear,
      refreshSessions,
      selectSession,
      newSession,
      renameSession,
      deleteSession,
    ],
  );
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

function writeTranscriptCache(
  alias: string,
  mode: ChatMode,
  sessionId: string,
  messages: ChatMessage[],
) {
  try {
    localStorage.setItem(
      TRANSCRIPT_KEY(alias, mode, sessionId),
      JSON.stringify(messages.slice(-MAX_CACHED_MESSAGES)),
    );
  } catch {
    // Best effort cache; gateway remains the source of persisted transcript.
  }
}

function readTranscriptCache(
  alias: string,
  mode: ChatMode,
  sessionId: string,
): ChatMessage[] {
  try {
    const raw = localStorage.getItem(TRANSCRIPT_KEY(alias, mode, sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessage);
  } catch {
    return [];
  }
}

function clearTranscriptCache(alias: string, mode: ChatMode, sessionId: string) {
  try {
    localStorage.removeItem(TRANSCRIPT_KEY(alias, mode, sessionId));
  } catch {
    // Best effort cache cleanup.
  }
}

function mergeTranscripts(
  gatewayMessages: ChatMessage[],
  cachedMessages: ChatMessage[],
) {
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

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<ChatMessage>;
  return (
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    Array.isArray(m.toolCalls) &&
    (m.status === "pending" ||
      m.status === "streaming" ||
      m.status === "done" ||
      m.status === "aborted" ||
      m.status === "error")
  );
}
