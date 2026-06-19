import { useQuery } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { queryKeys } from "@/api/query";
import { apiDoctor } from "@/api/tools";

export function DoctorPanel() {
  const doctorQuery = useQuery({
    queryKey: queryKeys.gateway.doctor,
    queryFn: apiDoctor,
    enabled: false,
  });
  const results = doctorQuery.data?.results ?? null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs">
        <span className="text-neutral-400">Diagnostics</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void doctorQuery.refetch()}
          disabled={doctorQuery.isFetching}
          className="flex items-center gap-1 rounded bg-sky-400 px-2 py-1 text-[10px] font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
        >
          {doctorQuery.isFetching ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Play size={10} />
          )}
          Run doctor
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4 text-xs zc-scrollbar">
        {doctorQuery.isError ? (
          <ul className="space-y-1.5">
            <DoctorResult severity="ERROR" message={String(doctorQuery.error)} />
          </ul>
        ) : results === null ? (
          <p className="text-neutral-500">Click "Run doctor" to start.</p>
        ) : results.length === 0 ? (
          <p className="text-emerald-300">All checks passed.</p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((r, i) => (
              <DoctorResult key={i} severity={r.severity} message={r.message} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DoctorResult({ severity, message }: { severity: string; message: string }) {
  return (
    <li
      className={`rounded border p-2 font-mono ${
        severity === "ERROR"
          ? "border-red-500/40 bg-red-500/10 text-red-200"
          : severity === "WARN"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
            : "border-white/10 bg-white/[0.04] text-neutral-300"
      }`}
    >
      <span className="mr-2 text-[10px] uppercase">{severity}</span>
      {message}
    </li>
  );
}
