import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  runtimeSummariesList,
  type RuntimeSummariesUpdatedEvent,
  type RuntimeSummary,
} from "@/api/tauri";

export function useRuntimeSummaries() {
  const [summaries, setSummaries] = useState<RuntimeSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSummaries(await runtimeSummariesList());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisten = listen<RuntimeSummariesUpdatedEvent>(
      "zeroclaw://runtime-summaries-updated",
      (event) => {
        setSummaries(event.payload.summaries);
        setError(null);
      },
    );
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  return useMemo(
    () => ({
      summaries,
      byConnectionId: new Map(summaries.map((summary) => [summary.connection_id, summary])),
      error,
      refresh,
    }),
    [error, refresh, summaries],
  );
}
