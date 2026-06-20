// Per-agent chat client. Wraps transport, message state, session management,
// transcript cache, attachments, abort, and approvals behind one public hook.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ChatMode, FileEntry } from "@/api/ws-chat";
import { apiSessionAbort } from "@/api/sessions";
import { chatReducer } from "./chat-reducer";
import { useChatTransport } from "./use-chat-transport";
import { useSessionService } from "./use-session-service";
import { useTranscriptCache } from "./use-transcript-cache";
import type { ChatModelOverride, UseChatOptions } from "./chat-types";

export type {
  ChatMessage,
  ChatModelOverride,
  MessageRole,
  NormalizedSession,
  UseChatOptions,
} from "./chat-types";
export { normalizeSession, sessionSort, shortSessionName } from "./chat-reducer";

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
  const transcriptCache = useTranscriptCache({
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
  const {
    loadSelected,
    saveSelected,
    assignWorkspace,
    readTranscript,
    writeTranscript,
    clearTranscript,
  } = transcriptCache;

  useEffect(() => {
    hydratedSessionRef.current = null;
  }, [agentAlias, connectionId, mode, workspaceRoot, workspaceDir, connectionSeed]);

  useEffect(() => {
    if (!state.sessionId || state.messages.length === 0) return;
    void writeTranscript(state.sessionId, state.messages);
  }, [state.sessionId, state.messages, writeTranscript]);

  const hydrateSession = useCallback(
    async (sessionId: string, messageCount?: number) => {
      if (hydratedSessionRef.current === sessionId) return;
      hydratedSessionRef.current = sessionId;
      const cachedMessages = await readTranscript(sessionId);
      if (messageCount !== undefined && messageCount <= 0) {
        if (cachedMessages.length > 0) {
          dispatch({ type: "hydrate", sessionId, messages: cachedMessages });
        }
        return;
      }
      try {
        const messages = await loadMessages(sessionId, cachedMessages);
        dispatch({ type: "hydrate", sessionId, messages });
      } catch {
        if (cachedMessages.length > 0) {
          dispatch({ type: "hydrate", sessionId, messages: cachedMessages });
        }
        hydratedSessionRef.current = null;
      }
    },
    [loadMessages, readTranscript],
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
      void clearTranscript(sessionId);
      if (state.sessionId === sessionId) {
        selectSession(null);
      }
    },
    [clearTranscript, deleteStoredSession, selectSession, state.sessionId],
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
    [clientRef],
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
    [clientRef],
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
