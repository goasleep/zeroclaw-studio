import { DataPanel } from "@/features/_shared/DataPanel";
import { apiIntegrations, apiChannels } from "@/api/client";

interface IntegrationsPanelProps {
  onConfigure?: (section: string) => void;
}

export function IntegrationsPanel(_props: IntegrationsPanelProps = {}) {
  return (
    <div className="grid h-full grid-cols-2 gap-2 overflow-hidden">
      <div className="flex flex-col overflow-hidden border-r border-neutral-800">
        <h3 className="border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-400">
          Integrations
        </h3>
        <div className="flex-1 overflow-hidden">
          <DataPanel
            what="integrations"
            load={apiIntegrations}
            render={(data) => (
              <ul className="space-y-1 text-xs">
                {data.integrations.map((i, idx) => (
                  <li
                    key={`${i.name}-${idx}`}
                    className="rounded border border-neutral-800 bg-neutral-900/40 p-2 font-mono text-neutral-200"
                  >
                    {i.name}
                  </li>
                ))}
              </ul>
            )}
          />
        </div>
      </div>
      <div className="flex flex-col overflow-hidden">
        <h3 className="border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-400">
          Channels
        </h3>
        <div className="flex-1 overflow-hidden">
          <DataPanel
            what="channels"
            load={apiChannels}
            render={(data) => (
              <ul className="space-y-1 text-xs">
                {data.channels.map((c, idx) => (
                  <li
                    key={`${c.name}-${idx}`}
                    className="rounded border border-neutral-800 bg-neutral-900/40 p-2 font-mono text-neutral-200"
                  >
                    {c.name}
                  </li>
                ))}
              </ul>
            )}
          />
        </div>
      </div>
    </div>
  );
}
