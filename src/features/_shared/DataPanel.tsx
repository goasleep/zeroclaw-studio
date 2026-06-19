import { useQuery, type QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";

interface DataPanelProps<T> {
  queryKey: QueryKey;
  /** Async fetcher (typically one of the apiFetch wrappers in api/client.ts). */
  load: () => Promise<T>;
  render: (data: T) => ReactNode;
  empty?: ReactNode;
  /** Used in the panel header for refresh tooltip; default "data". */
  what?: string;
}

export function DataPanel<T>({ queryKey, load, render, empty, what = "data" }: DataPanelProps<T>) {
  const query = useQuery({
    queryKey,
    queryFn: load,
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs">
        <span className="text-neutral-400">Last updated when refreshed.</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-cyan-400"
          title={`Refresh ${what}`}
        >
          <RefreshCw size={10} className={query.isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4 zc-scrollbar">
        {query.isLoading && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </div>
        )}
        {query.isError && (
          <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            <TriangleAlert size={12} className="mt-0.5" />
            <pre className="whitespace-pre-wrap font-mono">{String(query.error)}</pre>
          </div>
        )}
        {query.data &&
          (isEmpty(query.data)
            ? (empty ?? <p className="text-xs text-neutral-500">No items.</p>)
            : render(query.data))}
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
