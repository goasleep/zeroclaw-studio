import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/api/base";
import { apiSessionDelete, apiSessionRename, apiSessions } from "@/api/sessions";
import {
  isVisibleSession,
  normalizeSession,
  sessionSort,
  type NormalizedSession,
} from "@/features/chat/use-chat";
import {
  forgetSessionLocalState,
  loadSessionWorkspaceMap,
  pruneMissingSessionLocalState,
} from "@/features/chat/chat-local-state";
import { useConnections } from "../connection-context";

export function useTaskSessions() {
  const { active } = useConnections();
  const connectionId = active?.id ?? null;
  const [sessions, setSessions] = useState<NormalizedSession[]>([]);
  const [allSessions, setAllSessions] = useState<NormalizedSession[]>([]);
  const [workspaceMap, setWorkspaceMap] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotVersion, setSnapshotVersion] = useState(0);

  const refresh = useCallback(async () => {
    if (!connectionId) {
      setSessions([]);
      setAllSessions([]);
      setWorkspaceMap(new Map());
      setLoading(false);
      setError(null);
      setSnapshotVersion(0);
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
      await pruneMissingSessionLocalState(
        connectionId,
        normalized.map((session) => session.session_id),
      );
      const workspaceMap = await loadSessionWorkspaceMap(connectionId);
      setWorkspaceMap(workspaceMap);
      setAllSessions(normalized);
      setSessions(normalized.filter(isVisibleSession));
      setSnapshotVersion((version) => version + 1);
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
      setWorkspaceMap((prev) => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      setSessions((prev) => prev.filter((session) => session.session_id !== sessionId));
      setAllSessions((prev) => prev.filter((session) => session.session_id !== sessionId));
      setSnapshotVersion((version) => version + 1);
    },
    [connectionId],
  );

  return useMemo(
    () => ({
      sessions,
      allSessions,
      workspaceMap,
      loading,
      error,
      snapshotVersion,
      refresh,
      rename,
      remove,
      forgetLocal,
    }),
    [
      sessions,
      allSessions,
      workspaceMap,
      loading,
      error,
      snapshotVersion,
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
