import { useCallback, useEffect, useState } from "react";
import {
  apiSessionDelete,
  apiSessionMessages,
  apiSessionRename,
  apiSessions,
} from "@/api/sessions";
import { loadSessionWorkspaceMap } from "./chat-local-state";
import type { NormalizedSession } from "./chat-types";
import {
  fromSessionMessage,
  mergeTranscripts,
  normalizeSession,
  sessionSort,
} from "./chat-reducer";
import type { ChatMessage } from "./chat-types";

export function useSessionService(
  connectionId: string,
  agentAlias: string,
  workspaceRoot: string | null,
) {
  const [sessions, setSessions] = useState<NormalizedSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionError(null);
    try {
      const [data, workspaceMap] = await Promise.all([
        apiSessions(),
        loadSessionWorkspaceMap(connectionId),
      ]);
      const normalized = data.sessions
        .map(normalizeSession)
        .filter((s): s is NormalizedSession => s !== null)
        .filter((s) => !s.agent_alias || s.agent_alias === agentAlias)
        .filter((s) => sessionBelongsToWorkspace(s, workspaceRoot, workspaceMap))
        .sort(sessionSort);
      setSessions(normalized);
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSessionsLoading(false);
    }
  }, [agentAlias, connectionId, workspaceRoot]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const loadMessages = useCallback(async (sessionId: string, cachedMessages: ChatMessage[]) => {
    const transcript = await apiSessionMessages(sessionId);
    const gatewayMessages = transcript.messages
      .map(fromSessionMessage)
      .filter((m): m is ChatMessage => m !== null);
    return mergeTranscripts(gatewayMessages, cachedMessages);
  }, []);

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
      await refreshSessions();
    },
    [refreshSessions],
  );

  return {
    sessions,
    sessionsLoading,
    sessionError,
    setSessionError,
    refreshSessions,
    loadMessages,
    renameSession,
    deleteSession,
  };
}

function sessionBelongsToWorkspace(
  session: NormalizedSession,
  workspaceRoot: string | null,
  workspaceMap: Map<string, string>,
) {
  const boundWorkspace = workspaceMap.get(session.session_id) ?? null;
  return workspaceRoot ? boundWorkspace === workspaceRoot : boundWorkspace === null;
}
