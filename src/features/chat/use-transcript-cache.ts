import { useCallback } from "react";
import type { ChatMode } from "@/api/ws-chat";
import type { ChatMessage } from "./chat-types";
import {
  assignSessionWorkspace,
  clearTranscriptCache,
  loadSelectedSession,
  readTranscriptCache,
  saveSelectedSession,
  writeTranscriptCache,
} from "./chat-local-state";

export function useTranscriptCache({
  connectionId,
  workspaceRoot,
  agentAlias,
  mode,
}: {
  connectionId: string;
  workspaceRoot: string | null;
  agentAlias: string;
  mode: ChatMode;
}) {
  const loadSelected = useCallback(
    () => loadSelectedSession(connectionId, workspaceRoot, agentAlias, mode),
    [agentAlias, connectionId, mode, workspaceRoot],
  );

  const saveSelected = useCallback(
    (sessionId: string | null) =>
      saveSelectedSession(connectionId, workspaceRoot, agentAlias, mode, sessionId),
    [agentAlias, connectionId, mode, workspaceRoot],
  );

  const assignWorkspace = useCallback(
    (sessionId: string) => assignSessionWorkspace(connectionId, sessionId, workspaceRoot),
    [connectionId, workspaceRoot],
  );

  const readTranscript = useCallback(
    (sessionId: string) =>
      readTranscriptCache(connectionId, workspaceRoot, agentAlias, mode, sessionId),
    [agentAlias, connectionId, mode, workspaceRoot],
  );

  const writeTranscript = useCallback(
    (sessionId: string, messages: ChatMessage[]) =>
      writeTranscriptCache(connectionId, workspaceRoot, agentAlias, mode, sessionId, messages),
    [agentAlias, connectionId, mode, workspaceRoot],
  );

  const clearTranscript = useCallback(
    (sessionId: string) =>
      clearTranscriptCache(connectionId, workspaceRoot, agentAlias, mode, sessionId),
    [agentAlias, connectionId, mode, workspaceRoot],
  );

  return {
    loadSelected,
    saveSelected,
    assignWorkspace,
    readTranscript,
    writeTranscript,
    clearTranscript,
  };
}
