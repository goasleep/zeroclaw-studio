// Connection picker in the title bar.

import { Plus, Server, Wifi, WifiOff } from "lucide-react";
import { useConnections } from "@/app/connection-context";
import type { Connection } from "@/api/tauri";

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

export function ConnectionPicker({ onAdd }: Props) {
  const { connections, active, activate, health } = useConnections();
  const healthy = health?.healthy ?? false;
  const showingActive =
    active && health?.connection_id === active.id ? healthy : false;

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
      {active && (
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
