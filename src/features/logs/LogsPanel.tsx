import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { queryKeys } from "@/api/query";
import { apiLogs, type LogEvent } from "@/api/logs";

export function LogsPanel() {
  const [paused, setPaused] = useState(false);
  const logsQuery = useQuery({
    queryKey: queryKeys.gateway.logs(paused),
    queryFn: () => apiLogs(),
    refetchInterval: paused ? false : 3000,
  });
  const events: LogEvent[] = logsQuery.data?.events ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs">
        <span className="text-neutral-400">{events.length} lines</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-cyan-400"
        >
          {paused ? <Play size={10} /> : <Pause size={10} />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => void logsQuery.refetch()}
          className="flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-cyan-400"
        >
          {logsQuery.isFetching ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <RefreshCw size={10} />
          )}
          Refresh
        </button>
      </header>
      <div className="flex-1 overflow-auto bg-[#020818]/90 px-3 py-2 font-mono text-[11px] zc-scrollbar">
        {logsQuery.isError ? (
          <p className="text-red-300">{String(logsQuery.error)}</p>
        ) : events.length === 0 ? (
          <p className="text-neutral-500">No log lines.</p>
        ) : (
          events.map((e, i) => (
            <div key={i} className="leading-relaxed">
              <span className="text-neutral-600">
                {e["@timestamp"].replace("T", " ").slice(0, 19)}
              </span>{" "}
              <span
                className={
                  e.severity_text === "ERROR"
                    ? "text-red-400"
                    : e.severity_text === "WARN"
                      ? "text-amber-300"
                      : "text-neutral-500"
                }
              >
                [{e.severity_text}]
              </span>{" "}
              <span className="text-neutral-300">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
