import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  taskArchive,
  taskDeleteLocal,
  taskLinkSession,
  taskList,
  taskPatch,
  taskUpsert,
  type TasksUpdatedEvent,
} from "@/api/tauri";
import type { StudioTask, TaskPatch } from "./task-model";
import { taskActivityTime, visibleTasks } from "./task-model";

export function useTasks({
  connectionId,
}: {
  connectionId: string | null;
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!connectionId) return;
    const unlisten = listen<TasksUpdatedEvent>("zeroclaw://tasks-updated", (event) => {
      if (event.payload.connection_id !== connectionId) return;
      const updates = event.payload.tasks;
      if (updates.length === 0) return;
      setTasks((prev) => mergeTaskUpdates(prev, updates));
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [connectionId]);

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

export function mergeTaskUpdates(prev: StudioTask[], updates: StudioTask[]) {
  const byId = new Map(updates.map((task) => [task.id, task]));
  const next = prev.map((task) => byId.get(task.id) ?? task);
  const existing = new Set(prev.map((task) => task.id));
  for (const task of updates) {
    if (!existing.has(task.id)) next.push(task);
  }
  return next.sort((a, b) => taskActivityTime(b).localeCompare(taskActivityTime(a)));
}
