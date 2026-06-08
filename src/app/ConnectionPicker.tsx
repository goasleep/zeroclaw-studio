// Connection picker in the title bar.

import { useState } from "react";
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
import type { ActivationStep, Connection } from "@/api/tauri";

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
          <div className="text-xs text-neutral-300">Connection target</div>
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
            Saved connections
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
            Add another connection
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
        <span
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${
            showingActive
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-neutral-800 text-neutral-500"
          }`}
          title={active.url}
        >
          {showingActive ? <Wifi size={12} /> : <WifiOff size={12} />}
          {showingActive ? "Online" : "Offline"}
        </span>
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
        Add connection
      </button>
    </div>
  );
}
