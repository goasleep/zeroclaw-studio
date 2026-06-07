import { DataPanel } from "@/features/_shared/DataPanel";
import { apiTools } from "@/api/client";

export function ToolsPanel() {
  return (
    <DataPanel
      what="tools"
      load={apiTools}
      render={(data) => (
        <div className="space-y-2 text-xs">
          {data.tools.map((t) => (
            <details
              key={t.name}
              className="rounded border border-neutral-800 bg-neutral-900/40"
            >
              <summary className="cursor-pointer px-2 py-1 font-mono text-orange-300">
                {t.name}
              </summary>
              <pre className="overflow-x-auto whitespace-pre-wrap p-2 text-neutral-400">
                {JSON.stringify(t, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}
    />
  );
}
