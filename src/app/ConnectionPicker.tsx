// Connection picker in the title bar.

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Plus,
  RotateCw,
  Server,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useConnections } from "@/app/connection-context";
import {
  connectionProbe,
  runtimeStatus,
  type ActivationStep,
  type Connection,
  type ConnectionProbeResult,
} from "@/api/tauri";
import { apiDoctor, apiHealth, apiLogs, apiStatus } from "@/api/client";

interface Props {
  onAdd: () => void;
}

function transportLabel(c: Connection): string {
  switch (c.transport) {
    case "local":
      return c.lifecycle === "managed" ? "Local" : "Local attach";
    case "http":
      return "Remote";
    case "ssh":
      return "SSH";
    case "tailscale":
      return "Tailscale";
  }
}

function activationLabel(step: ActivationStep | null): string | null {
  if (!step) return null;
  switch (step.type) {
    case "started":
    case "probing":
      return "Checking gateway…";
    case "starting_gateway":
      return "Starting gateway…";
    case "awaiting_healthy":
      return "Waiting for health…";
    case "pairing":
      return "Pairing…";
    case "binary_missing":
      return "No local zeroclaw installed";
    case "needs_manual_pairing":
      return "Needs manual pairing";
    case "failed":
      return step.message.slice(0, 80);
    case "ready":
      return null;
  }
}

export function ConnectionPicker({ onAdd }: Props) {
  const { connections, active, activate, health, activation, retry } =
    useConnections();
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [probes, setProbes] = useState<Record<string, ConnectionProbeResult>>({});
  const [activeDetails, setActiveDetails] = useState<{
    loading: boolean;
    rows: Array<{ label: string; value: string }>;
    errors: string[];
  }>({ loading: false, rows: [], errors: [] });

  const healthy = health?.healthy ?? false;
  const showingActive =
    active && health?.connection_id === active.id ? healthy : false;

  const stepLabel = activationLabel(activation);
  const inFlight =
    activation !== null &&
    activation.type !== "ready" &&
    activation.type !== "failed" &&
    activation.type !== "binary_missing" &&
    activation.type !== "needs_manual_pairing";
  const showRetry =
    activation !== null &&
    (activation.type === "failed" ||
      activation.type === "binary_missing" ||
      activation.type === "needs_manual_pairing");

  useEffect(() => {
    if (!open || connections.length === 0) return;
    let cancelled = false;
    void Promise.all(
      connections.map((conn) =>
        connectionProbe(conn.id)
          .then((probe) => [conn.id, probe] as const)
          .catch(
            (e) =>
              [
                conn.id,
                {
                  connection_id: conn.id,
                  reachable: false,
                  latency_ms: null,
                  status: "error",
                  error: formatError(e),
                  checked_at: String(Date.now()),
                } satisfies ConnectionProbeResult,
              ] as const,
          ),
      ),
    ).then((results) => {
      if (!cancelled) setProbes(Object.fromEntries(results));
    });
    return () => {
      cancelled = true;
    };
  }, [connections, open]);

  useEffect(() => {
    if (!detailsOpen || !active) return;
    let cancelled = false;
    setActiveDetails({ loading: true, rows: [], errors: [] });

    async function load() {
      const rows: Array<{ label: string; value: string }> = [];
      const errors: string[] = [];
      await Promise.all([
        apiHealth()
          .then((r) => rows.push({ label: "Gateway health", value: r.status }))
          .catch((e) => errors.push(`health: ${formatError(e)}`)),
        apiStatus()
          .then((r) =>
            rows.push({ label: "Gateway version", value: r.version ?? "unknown" }),
          )
          .catch((e) => errors.push(`status: ${formatError(e)}`)),
        runtimeStatus()
          .then((r) => rows.push({ label: "Managed runtime", value: String(r) }))
          .catch((e) => errors.push(`runtime: ${formatError(e)}`)),
        apiDoctor()
          .then((r) =>
            rows.push({
              label: "Doctor",
              value: `${r.results.length} result${r.results.length === 1 ? "" : "s"}`,
            }),
          )
          .catch((e) => errors.push(`doctor: ${formatError(e)}`)),
        apiLogs()
          .then((r) => {
            const recentError = r.events.find((ev) =>
              String(ev.severity_text ?? "").toLowerCase().includes("error"),
            );
            rows.push({
              label: "Recent log error",
              value: recentError?.message ?? "none",
            });
          })
          .catch((e) => errors.push(`logs: ${formatError(e)}`)),
      ]);
      if (!cancelled) setActiveDetails({ loading: false, rows, errors });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, detailsOpen]);

  async function choose(id: string | null) {
    setOpen(false);
    await activate(id);
  }

  return (
    <div className="relative flex h-12 items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-4 text-sm shadow-sm">
      <div className="flex min-w-0 items-center gap-2">
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-1.5 text-orange-300">
          <Server size={15} />
        </div>
        <div className="hidden leading-tight sm:block">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">
            ZeroClaw Workspace
          </div>
          <div className="text-xs text-neutral-300">Workspace runtime</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-[220px] max-w-[360px] items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-100 shadow-inner transition hover:border-neutral-700"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            showingActive ? "bg-emerald-400" : "bg-neutral-600"
          }`}
        />
        <span className="min-w-0 flex-1 truncate">
          {active ? active.name : "No connection"}
        </span>
        {active && (
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
            {transportLabel(active)}
          </span>
        )}
        <ChevronDown size={13} className="shrink-0 text-neutral-500" />
      </button>

      {open && (
        <div className="absolute left-[210px] top-11 z-50 w-[360px] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl">
          <div className="border-b border-neutral-800 px-3 py-2 text-[10px] uppercase tracking-wide text-neutral-500">
            Runtimes
          </div>
          {connections.length === 0 ? (
            <div className="px-3 py-3 text-xs text-neutral-500">
              No saved connections yet.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto py-1">
              {connections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void choose(c.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-200 hover:bg-neutral-900"
                >
                  <span className="flex h-4 w-4 items-center justify-center text-orange-300">
                    {active?.id === c.id && <Check size={12} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate font-mono text-[10px] text-neutral-500">
                      {c.url || "pending tunnel"}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-neutral-600">
                      {probeLabel(probes[c.id])}
                    </span>
                  </span>
                  <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
                    {transportLabel(c)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAdd();
            }}
            className="flex w-full items-center gap-2 border-t border-neutral-800 px-3 py-2 text-xs text-orange-300 hover:bg-orange-500/10"
          >
            <Plus size={12} />
            Add runtime
          </button>
        </div>
      )}

      {active && stepLabel && (
        <span
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${
            inFlight
              ? "bg-amber-500/10 text-amber-300"
              : activation?.type === "failed"
                ? "bg-red-500/10 text-red-300"
                : "bg-amber-500/10 text-amber-300"
          }`}
          title={activation?.type === "failed" ? activation.message : stepLabel}
        >
          {inFlight ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <TriangleAlert size={12} />
          )}
          {stepLabel}
        </span>
      )}

      {active && !stepLabel && (
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${
            showingActive
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-neutral-800 text-neutral-500"
          }`}
          title={active.url}
        >
          {showingActive ? <Wifi size={12} /> : <WifiOff size={12} />}
          {showingActive ? "Online" : "Offline"}
        </button>
      )}

      {detailsOpen && active && (
        <div className="absolute right-4 top-11 z-50 w-[420px] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl">
          <div className="border-b border-neutral-800 px-3 py-2 text-xs">
            <div className="font-medium text-neutral-100">{active.name}</div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-neutral-500">
              {active.url || "pending tunnel"}
            </div>
          </div>
          <div className="max-h-96 overflow-auto p-3 text-xs">
            {activeDetails.loading ? (
              <div className="flex items-center gap-2 text-neutral-500">
                <Loader2 size={12} className="animate-spin" />
                Checking connection...
              </div>
            ) : (
              <div className="space-y-2">
                {activeDetails.rows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[120px_minmax(0,1fr)] gap-2"
                  >
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                      {row.label}
                    </span>
                    <span
                      className="truncate font-mono text-neutral-300"
                      title={row.value}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
                {activeDetails.errors.map((error) => (
                  <div
                    key={error}
                    className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200"
                  >
                    {error}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showRetry && (
        <button
          type="button"
          onClick={() => void retry()}
          className="flex items-center gap-1 rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-orange-500 hover:text-orange-300"
          title="Re-run activation"
        >
          <RotateCw size={11} />
          Retry
        </button>
      )}

      <div className="flex-1" />
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 transition hover:border-orange-500 hover:text-orange-300"
      >
        <Plus size={12} />
        Add runtime
      </button>
    </div>
  );
}

function probeLabel(probe: ConnectionProbeResult | undefined) {
  if (!probe) return "probe pending";
  if (probe.status === "tunnel_inactive") {
    return "Tunnel inactive / activate to probe";
  }
  const latency = probe.latency_ms == null ? "" : ` (${probe.latency_ms} ms)`;
  return probe.reachable ? `reachable${latency}` : `${probe.status}${latency}`;
}

function formatError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}
