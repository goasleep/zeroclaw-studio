import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/api/base";
import { apiSessionDelete, apiSessionRename, apiSessions } from "@/api/sessions";
import {
  isVisibleSession,
  normalizeSession,
  sessionSort,
  type NormalizedSession,
} from "@/features/chat/use-chat";
import { forgetSessionLocalState } from "@/features/chat/chat-local-state";
import { useConnections } from "../connection-context";

export function useTaskSessions() {
  const { active } = useConnections();
  const connectionId = active?.id ?? null;
  const [sessions, setSessions] = useState<NormalizedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!connectionId) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiSessions();
      const normalized = data.sessions
        .map(normalizeSession)
        .filter((session): session is NormalizedSession => session !== null)
        .sort(sessionSort);
      setSessions(normalized.filter(isVisibleSession));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onRefresh() {
      void refresh();
    }

    window.addEventListener("zeroclaw://chat-done", onRefresh);
    window.addEventListener("zeroclaw://refresh-sessions", onRefresh);
    return () => {
      window.removeEventListener("zeroclaw://chat-done", onRefresh);
      window.removeEventListener("zeroclaw://refresh-sessions", onRefresh);
    };
  }, [refresh]);

  const rename = useCallback(
    async (sessionId: string, name: string) => {
      await apiSessionRename(sessionId, name);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (sessionId: string) => {
      try {
        await apiSessionDelete(sessionId);
      } catch (err) {
        if (!isSessionNotFoundError(err)) throw err;
      }
      await refresh();
    },
    [refresh],
  );

  const forgetLocal = useCallback(
    async (sessionId: string) => {
      if (!connectionId) return;
      await forgetSessionLocalState(connectionId, sessionId);
      setSessions((prev) => prev.filter((session) => session.session_id !== sessionId));
    },
    [connectionId],
  );

  return useMemo(
    () => ({
      sessions,
      loading,
      error,
      refresh,
      rename,
      remove,
      forgetLocal,
    }),
    [
      sessions,
      loading,
      error,
      refresh,
      rename,
      remove,
      forgetLocal,
    ],
  );
}

function isSessionNotFoundError(err: unknown) {
  if (err instanceof ApiError) {
    return err.status === 404 && /session not found/i.test(err.envelope.message);
  }
  return false;
}
