import { useEffect, useState } from "react";
import { Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { apiLogs } from "@/api/client";
import type { LogEvent } from "@/api/client";

export function LogsPanel() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  async function poll() {
    setBusy(true);
    try {
      const r = await apiLogs();
      setEvents(r.events ?? []);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void poll();
    if (paused) return;
    const id = setInterval(() => void poll(), 3000);
    return () => clearInterval(id);
  }, [paused]);

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
          onClick={() => void poll()}
          className="flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-cyan-400"
        >
          {busy ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <RefreshCw size={10} />
          )}
          Refresh
        </button>
      </header>
      <div className="flex-1 overflow-auto bg-[#020818]/90 px-3 py-2 font-mono text-[11px]">
        {events.length === 0 ? (
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
