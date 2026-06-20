// Per-agent chat client. Wraps transport, message state, session management,
// Session selection, attachments, abort, and approvals behind one public hook.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ChatMode, FileEntry } from "@/api/ws-chat";
import { apiSessionAbort } from "@/api/sessions";
import { chatReducer } from "./chat-reducer";
import { useChatTransport } from "./use-chat-transport";
import { useSessionService } from "./use-session-service";
import { useChatLocalState } from "./use-chat-local-state";
import type { ChatModelOverride, UseChatOptions } from "./chat-types";

export type {
  ApprovalDecision,
  ChatMessage,
  ChatModelOverride,
  MessageRole,
  NormalizedSession,
  UseChatOptions,
} from "./chat-types";
export { isVisibleSession, normalizeSession, sessionSort, shortSessionName } from "./chat-reducer";

export function useChat({
  connectionId,
  agentAlias,
  mode = "chat",
  workspaceRoot = null,
  workspaceDir = null,
}: UseChatOptions) {
  const [state, dispatch] = useReducer(chatReducer, {
    messages: [],
    sessionId: null,
  });
  const [connectionSeed, setConnectionSeed] = useState(0);
  const [modelOverride, setModelOverride] = useState<ChatModelOverride | null>(null);
  const hydratedSessionRef = useRef<string | null>(null);

  const sessions = useSessionService(connectionId, agentAlias, workspaceRoot);
  const chatLocalState = useChatLocalState({
    connectionId,
    workspaceRoot,
    agentAlias,
    mode,
  });
  const {
    sessions: sessionList,
    sessionsLoading,
    sessionError,
    setSessionError,
    refreshSessions,
    loadMessages,
    renameSession: renameStoredSession,
    deleteSession: deleteStoredSession,
  } = sessions;
  const { loadSelected, saveSelected, assignWorkspace } = chatLocalState;

  useEffect(() => {
    hydratedSessionRef.current = null;
  }, [agentAlias, connectionId, mode, workspaceRoot, workspaceDir, connectionSeed]);

  const hydrateSession = useCallback(
    async (sessionId: string, messageCount?: number) => {
      if (hydratedSessionRef.current === sessionId) return;
      hydratedSessionRef.current = sessionId;
      if (messageCount !== undefined && messageCount <= 0) {
        return;
      }
      try {
        const messages = await loadMessages(sessionId);
        dispatch({ type: "hydrate", sessionId, messages });
      } catch {
        hydratedSessionRef.current = null;
      }
    },
    [loadMessages],
  );

  const { connected, clientRef } = useChatTransport({
    agentAlias,
    connectionId,
    mode: mode as ChatMode,
    workspaceRoot,
    workspaceDir,
    modelOverride,
    connectionSeed,
    dispatch,
    loadSelected,
    saveSelected,
    assignWorkspace,
    hydrateSession,
    refreshSessions,
    setSessionError,
  });

  const selectSession = useCallback(
    (sessionId: string | null) => {
      setModelOverride(null);
      void saveSelected(sessionId);
      if (sessionId) {
        void assignWorkspace(sessionId);
      }
      hydratedSessionRef.current = null;
      dispatch({ type: "select-session", sessionId });
      setConnectionSeed((n) => n + 1);
    },
    [assignWorkspace, saveSelected],
  );

  const newSession = useCallback(
    (override?: ChatModelOverride | null) => {
      setModelOverride(override ?? null);
      void saveSelected(null);
      hydratedSessionRef.current = null;
      dispatch({ type: "select-session", sessionId: null });
      setConnectionSeed((n) => n + 1);
    },
    [saveSelected],
  );

  const renameSession = useCallback(
    async (sessionId: string, name: string) => {
      await renameStoredSession(sessionId, name);
    },
    [renameStoredSession],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await deleteStoredSession(sessionId);
      if (state.sessionId === sessionId) {
        selectSession(null);
      }
    },
    [deleteStoredSession, selectSession, state.sessionId],
  );

  const send = useCallback(
    (content: string, attachments?: FileEntry[]) => {
      if (!clientRef.current) return;
      const client = clientRef.current;
      const attachmentSummary = attachments?.map((a) => ({
        filename: a.filename,
        mime_type: a.mime_type,
        size: a.size,
      }));
      dispatch({ type: "push-user", content, attachments: attachmentSummary });
      void client
        .send({
          type: "message",
          content,
          attachments: attachments?.length ? attachments : undefined,
        })
        .catch((e) => {
          setSessionError(e instanceof Error ? e.message : String(e));
        });
    },
    [clientRef, setSessionError],
  );

  const respondToApproval = useCallback(
    async (request_id: string, decision: "approve" | "deny" | "always") => {
      const client = clientRef.current;
      if (!client) {
        dispatch({
          type: "approval-response",
          requestId: request_id,
          decision,
          status: "error",
          error: "chat socket not open",
        });
        return;
      }
      dispatch({ type: "approval-response", requestId: request_id, decision, status: "pending" });
      try {
        await client.send({
          type: "approval_response",
          request_id,
          decision,
        });
        dispatch({ type: "approval-response", requestId: request_id, decision, status: "sent" });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        dispatch({
          type: "approval-response",
          requestId: request_id,
          decision,
          status: "error",
          error: message,
        });
        setSessionError(message);
      }
    },
    [clientRef, setSessionError],
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
      sessions: sessionList,
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
      sessionList,
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
