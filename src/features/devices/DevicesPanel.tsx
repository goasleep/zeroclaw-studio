import { DataPanel } from "@/features/_shared/DataPanel";
import { apiDevices } from "@/api/client";

export function DevicesPanel() {
  return (
    <DataPanel
      what="devices"
      load={apiDevices}
      render={(data) => (
        <ul className="space-y-1 text-xs">
          {data.devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded border border-white/10 bg-white/[0.04] p-2"
            >
              <span className="font-mono text-cyan-300">{d.name ?? "(unnamed)"}</span>
              <span className="font-mono text-neutral-500">{d.id}</span>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
