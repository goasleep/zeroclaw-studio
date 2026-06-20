import { DataPanel } from "@/features/_shared/DataPanel";
import { apiDevices } from "@/api/tools";
import { queryKeys } from "@/api/query";
import { useLingui } from "@lingui/react/macro";
import { useConnections } from "@/app/connection-context";

export function DevicesPanel() {
  const { t } = useLingui();
  const { active } = useConnections();
  return (
    <DataPanel
      what={t`devices`}
      queryKey={queryKeys.gateway.devices(active?.id ?? null)}
      load={apiDevices}
      render={(data) => (
        <ul className="space-y-1 text-xs">
          {data.devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded border border-white/10 bg-white/[0.04] p-2"
            >
              <span className="font-mono text-cyan-300">{d.name ?? t`(unnamed)`}</span>
              <span className="font-mono text-neutral-500">{d.id}</span>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
