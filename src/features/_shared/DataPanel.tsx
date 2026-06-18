// Tiny shared primitives for Phase 6 feature panels.
//
// Each panel uses the same "fetch on mount, refresh button, error banner"
// shape, so we factor it here instead of repeating boilerplate.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";

interface DataPanelProps<T> {
  /** Async fetcher (typically one of the apiFetch wrappers in api/client.ts). */
  load: () => Promise<T>;
  render: (data: T) => ReactNode;
  empty?: ReactNode;
  /** Used in the panel header for refresh tooltip; default "data". */
  what?: string;
}

export function DataPanel<T>({ load, render, empty, what = "data" }: DataPanelProps<T>) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ok"; data: T } | { kind: "err"; message: string }
  >({ kind: "loading" });

  const fetch = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await load();
      setState({ kind: "ok", data });
    } catch (e) {
      setState({ kind: "err", message: String(e) });
    }
  }, [load]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs">
        <span className="text-neutral-400">Last updated when refreshed.</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void fetch()}
          className="flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-cyan-400"
          title={`Refresh ${what}`}
        >
          <RefreshCw size={10} />
          Refresh
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {state.kind === "loading" && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </div>
        )}
        {state.kind === "err" && (
          <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            <TriangleAlert size={12} className="mt-0.5" />
            <pre className="whitespace-pre-wrap font-mono">{state.message}</pre>
          </div>
        )}
        {state.kind === "ok" &&
          (isEmpty(state.data)
            ? (empty ?? <p className="text-xs text-neutral-500">No items.</p>)
            : render(state.data))}
      </div>
    </div>
  );
}

function isEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object") {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === 0) return true;
      // First non-array property → not empty.
      return false;
    }
    return false;
  }
  return false;
}
