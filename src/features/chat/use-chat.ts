// Per-agent chat client. Wraps the WS reconnecting client, tracks the
// growing message log, exposes send/abort.

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { ChatClient, type ChatFrame } from "@/api/ws-chat";
import { apiFetch } from "@/api/client";

const SESSION_KEY = (alias: string) => `zeroclaw_session_id.${alias}`;

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  /** Streaming text. Builds up as `chunk` frames arrive for assistant turns. */
  content: string;
  thinking?: string;
  /** Tool calls emitted during this turn, in order. */
  toolCalls: Array<{ name: string; args: unknown; result?: unknown }>;
  /** Pending approval request (if any) at the moment this message was the live turn. */
  approval?: {
    request_id: string;
    tool: string;
    arguments_summary: string;
    timeout_secs?: number;
  } | null;
  status: "pending" | "streaming" | "done" | "aborted" | "error";
  error?: string;
}

type Action =
  | { type: "reset" }
  | { type: "push-user"; content: string }
  | { type: "frame"; frame: ChatFrame };

interface State {
  messages: ChatMessage[];
  sessionId: string | null;
}

function uid() {
  return crypto.randomUUID();
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return { messages: [], sessionId: state.sessionId };
    case "push-user":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: "user",
            content: action.content,
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
      const last = state.messages[state.messages.length - 1];

      if (frame.type === "session_start") {
        return { ...state, sessionId: frame.session_id };
      }

      // All assistant-side frames mutate the latest assistant message.
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
        case "approval_request":
          updated.approval = {
            request_id: frame.request_id,
            tool: frame.tool,
            arguments_summary: frame.arguments_summary,
            timeout_secs: frame.timeout_secs,
          };
          break;
        case "done":
          updated.content = frame.full_response || updated.content;
          updated.status = "done";
          updated.approval = null;
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

export function useChat(agentAlias: string) {
  const [state, dispatch] = useReducer(reducer, {
    messages: [],
    sessionId: localStorage.getItem(SESSION_KEY(agentAlias)),
  });
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<ChatClient | null>(null);

  useEffect(() => {
    if (!agentAlias) return;
    const client = new ChatClient({
      agentAlias,
      sessionId: state.sessionId ?? undefined,
      onFrame: (frame) => {
        dispatch({ type: "frame", frame });
        if (frame.type === "session_start") {
          localStorage.setItem(SESSION_KEY(agentAlias), frame.session_id);
        }
        // Bridge to native notification handler in App.tsx.
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
        }
      },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    clientRef.current = client;
    void client.start().catch(() => setConnected(false));
    return () => {
      client.close();
      clientRef.current = null;
    };
    // We deliberately depend only on `agentAlias` — re-opening on every state
    // change would tear down the WS on each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentAlias]);

  const send = useCallback(
    (content: string) => {
      if (!clientRef.current) return;
      dispatch({ type: "push-user", content });
      clientRef.current.send({ type: "message", content });
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
      await apiFetch(`/api/sessions/${state.sessionId}/abort`, {
        method: "POST",
      });
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
      connected,
      send,
      respondToApproval,
      abort,
      clear,
    }),
    [state, connected, send, respondToApproval, abort, clear],
  );
}
