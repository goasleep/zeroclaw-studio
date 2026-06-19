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
  workspaceRoot,
  agentAlias,
  mode,
}: {
  workspaceRoot: string | null;
  agentAlias: string;
  mode: ChatMode;
}) {
  const loadSelected = useCallback(
    () => loadSelectedSession(workspaceRoot, agentAlias, mode),
    [agentAlias, mode, workspaceRoot],
  );

  const saveSelected = useCallback(
    (sessionId: string | null) => saveSelectedSession(workspaceRoot, agentAlias, mode, sessionId),
    [agentAlias, mode, workspaceRoot],
  );

  const assignWorkspace = useCallback(
    (sessionId: string) => assignSessionWorkspace(sessionId, workspaceRoot),
    [workspaceRoot],
  );

  const readTranscript = useCallback(
    (sessionId: string) => readTranscriptCache(workspaceRoot, agentAlias, mode, sessionId),
    [agentAlias, mode, workspaceRoot],
  );

  const writeTranscript = useCallback(
    (sessionId: string, messages: ChatMessage[]) =>
      writeTranscriptCache(workspaceRoot, agentAlias, mode, sessionId, messages),
    [agentAlias, mode, workspaceRoot],
  );

  const clearTranscript = useCallback(
    (sessionId: string) => clearTranscriptCache(workspaceRoot, agentAlias, mode, sessionId),
    [agentAlias, mode, workspaceRoot],
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
