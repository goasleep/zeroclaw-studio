import { useCallback, useEffect, useMemo, useState } from "react";
import {
  taskArchive,
  taskBackfillSessions,
  taskDeleteLocal,
  taskLinkSession,
  taskList,
  taskPatch,
  taskUpsert,
} from "@/api/tauri";
import type { NormalizedSession } from "@/features/chat/use-chat";
import type { StudioTask, TaskPatch } from "./task-model";
import { sessionToBackfillSession, visibleTasks } from "./task-model";

export function useTasks({
  connectionId,
  sessions,
  sessionSnapshotVersion,
  workspaceMap,
}: {
  connectionId: string | null;
  sessions: NormalizedSession[];
  sessionSnapshotVersion: number;
  workspaceMap: Map<string, string>;
}) {
  const [tasks, setTasks] = useState<StudioTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!connectionId) {
      setTasks([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await taskList(connectionId);
      setTasks(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  const backfill = useCallback(async () => {
    if (!connectionId) return;
    const bindings = Array.from(workspaceMap.entries());
    try {
      const next = await taskBackfillSessions(
        connectionId,
        sessions.map(sessionToBackfillSession),
        bindings,
      );
      setTasks(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [connectionId, sessions, workspaceMap]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (connectionId && sessionSnapshotVersion > 0) void backfill();
  }, [backfill, connectionId, sessionSnapshotVersion]);

  const upsert = useCallback(async (task: StudioTask) => {
    const saved = await taskUpsert(task);
    setTasks((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
    return saved;
  }, []);

  const patch = useCallback(async (id: string, patch: TaskPatch) => {
    const saved = await taskPatch(id, patch);
    setTasks((prev) => prev.map((item) => (item.id === id ? saved : item)));
    return saved;
  }, []);

  const archive = useCallback(async (id: string) => {
    const saved = await taskArchive(id);
    setTasks((prev) => prev.map((item) => (item.id === id ? saved : item)));
    return saved;
  }, []);

  const removeLocal = useCallback(async (id: string) => {
    await taskDeleteLocal(id);
    setTasks((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const linkSession = useCallback(async (id: string, sessionId: string) => {
    const saved = await taskLinkSession(id, sessionId);
    setTasks((prev) => prev.map((item) => (item.id === id ? saved : item)));
    return saved;
  }, []);

  return useMemo(
    () => ({
      tasks,
      visibleTasks: visibleTasks(tasks),
      loading,
      error,
      refresh,
      upsert,
      patch,
      archive,
      removeLocal,
      linkSession,
    }),
    [archive, error, linkSession, loading, patch, refresh, removeLocal, tasks, upsert],
  );
}
