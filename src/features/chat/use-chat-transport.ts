import { useEffect, useRef, useState, type Dispatch } from "react";
import { ChatClient, type ChatFrame, type ChatMode } from "@/api/ws-chat";
import type { ChatAction } from "./chat-reducer";
import type { ChatModelOverride } from "./chat-types";

export function useChatTransport({
  agentAlias,
  connectionId,
  mode,
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
}: {
  agentAlias: string;
  connectionId: string;
  mode: ChatMode;
  workspaceRoot: string | null;
  workspaceDir: string | null;
  modelOverride: ChatModelOverride | null;
  connectionSeed: number;
  dispatch: Dispatch<ChatAction>;
  loadSelected: () => Promise<string | null>;
  saveSelected: (sessionId: string | null) => Promise<void>;
  assignWorkspace: (sessionId: string) => Promise<void>;
  hydrateSession: (sessionId: string, messageCount?: number) => Promise<void>;
  refreshSessions: () => Promise<void>;
  setSessionError: (error: string | null) => void;
}) {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<ChatClient | null>(null);

  useEffect(() => {
    if (!agentAlias) return;
    let cancelled = false;
    let client: ChatClient | null = null;
    dispatch({ type: "select-session", sessionId: null });
    setConnected(false);

    function handleFrame(frame: ChatFrame) {
      dispatch({ type: "frame", frame });
      if (frame.type === "session_start") {
        void (async () => {
          try {
            await saveSelected(frame.session_id);
            await assignWorkspace(frame.session_id);
            await hydrateSession(frame.session_id, frame.message_count);
          } catch (e) {
            setSessionError(e instanceof Error ? e.message : String(e));
          } finally {
            void refreshSessions();
          }
        })();
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
    }

    async function startClient() {
      const storedSessionId = await loadSelected().catch(() => null);
      if (cancelled) return;
      dispatch({ type: "select-session", sessionId: storedSessionId });
      if (storedSessionId && workspaceRoot) {
        void assignWorkspace(storedSessionId);
      }
      if (storedSessionId) {
        void hydrateSession(storedSessionId);
      }
      const newSessionModelOverride = storedSessionId ? null : modelOverride;

      client = new ChatClient({
        agentAlias,
        mode,
        workspaceDir,
        modelProvider: newSessionModelOverride?.modelProvider ?? null,
        model: newSessionModelOverride?.model ?? null,
        sessionId: storedSessionId ?? undefined,
        onFrame: handleFrame,
        onOpen: () => setConnected(true),
        onClose: () => setConnected(false),
      });
      clientRef.current = client;
      void client.start().catch((e) => {
        setConnected(false);
        setSessionError(e instanceof Error ? e.message : String(e));
      });
    }

    void startClient();
    return () => {
      cancelled = true;
      client?.detach();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [
    agentAlias,
    connectionId,
    mode,
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
  ]);

  return { connected, clientRef };
}
