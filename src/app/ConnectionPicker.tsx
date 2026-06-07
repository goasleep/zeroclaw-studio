// Connection picker in the title bar.

import { Loader2, Plus, RotateCw, Server, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { useConnections } from "@/app/connection-context";
import type { ActivationStep, Connection } from "@/api/tauri";

interface Props {
  onAdd: () => void;
}

function transportLabel(c: Connection): string {
  switch (c.transport) {
    case "local":
      return c.lifecycle === "managed" ? "Local (managed)" : "Local";
    case "http":
      return "Remote";
    case "ssh":
      return "SSH";
    case "tailscale":
      return "Tailscale";
  }
}

/**
 * Human-readable label for the current activation step. Returns null when
 * the activation has settled (ready / nothing-in-flight) and the picker
 * should fall back to the health dot.
 */
function activationLabel(step: ActivationStep | null): string | null {
  if (!step) return null;
  switch (step.type) {
    case "started":
    case "probing":
      return "checking gateway…";
    case "starting_gateway":
      return "starting gateway…";
    case "awaiting_healthy":
      return "waiting for health…";
    case "pairing":
      return "pairing…";
    case "binary_missing":
      return "no local zeroclaw installed";
    case "needs_manual_pairing":
      return "needs manual pairing";
    case "failed":
      return step.message.slice(0, 80);
    case "ready":
      return null;
  }
}

export function ConnectionPicker({ onAdd }: Props) {
  const { connections, active, activate, health, activation, retry } =
    useConnections();
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

  return (
    <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5 text-neutral-400">
        <Server size={14} />
        <span className="text-xs uppercase tracking-wide">Connection</span>
      </span>
      <select
        value={active?.id ?? ""}
        onChange={(e) => void activate(e.target.value || null)}
        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100 outline-none focus:border-orange-500"
      >
        <option value="">— none —</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {transportLabel(c)}
          </option>
        ))}
      </select>

      {active && stepLabel && (
        <span
          className={`flex items-center gap-1 text-xs ${
            inFlight
              ? "text-amber-300"
              : activation?.type === "failed"
                ? "text-red-300"
                : "text-amber-300"
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
        <span
          className={`flex items-center gap-1 text-xs ${
            showingActive ? "text-emerald-400" : "text-neutral-500"
          }`}
          title={active.url}
        >
          {showingActive ? <Wifi size={12} /> : <WifiOff size={12} />}
          {showingActive ? "online" : "offline"}
        </span>
      )}

      {showRetry && (
        <button
          type="button"
          onClick={() => void retry()}
          className="flex items-center gap-1 rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:border-orange-500 hover:text-orange-300"
          title="Re-run activation"
        >
          <RotateCw size={10} />
          retry
        </button>
      )}

      <div className="flex-1" />
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:border-orange-500 hover:text-orange-400"
      >
        <Plus size={12} />
        Add connection
      </button>
    </div>
  );
}
