import { useEffect, useState } from "react";
import { Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { apiLogs } from "@/api/client";

export function LogsPanel() {
  const [lines, setLines] = useState<
    Array<{ level: string; message: string; ts?: string }>
  >([]);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  async function poll() {
    setBusy(true);
    try {
      const r = await apiLogs();
      setLines(r.lines);
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
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5 text-xs">
        <span className="text-neutral-400">{lines.length} lines</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="flex items-center gap-1 rounded border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-orange-500"
        >
          {paused ? <Play size={10} /> : <Pause size={10} />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => void poll()}
          className="flex items-center gap-1 rounded border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-orange-500"
        >
          {busy ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <RefreshCw size={10} />
          )}
          Refresh
        </button>
      </header>
      <div className="flex-1 overflow-auto bg-neutral-950 px-3 py-2 font-mono text-[11px]">
        {lines.length === 0 ? (
          <p className="text-neutral-500">No log lines.</p>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="leading-relaxed">
              <span
                className={
                  l.level === "ERROR"
                    ? "text-red-400"
                    : l.level === "WARN"
                      ? "text-amber-300"
                      : "text-neutral-500"
                }
              >
                [{l.level}]
              </span>{" "}
              <span className="text-neutral-300">{l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
