import { useCallback } from "react";
import type { ChatMode } from "@/api/ws-chat";
import {
  assignSessionWorkspace,
  loadSelectedSession,
  saveSelectedSession,
} from "./chat-local-state";

export function useChatLocalState({
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

  return {
    loadSelected,
    saveSelected,
    assignWorkspace,
  };
}
