import { DataPanel } from "@/features/_shared/DataPanel";
import { apiMemory } from "@/api/client";

export function MemoryPanel() {
  return (
    <DataPanel
      what="memory"
      load={apiMemory}
      render={(data) => (
        <ul className="space-y-2 text-xs">
          {data.entries.map((e) => (
            <li
              key={e.key}
              className="rounded border border-white/10 bg-white/[0.04] p-2"
            >
              <div className="font-mono text-cyan-300">{e.key}</div>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-neutral-300">
                {typeof e.value === "string"
                  ? e.value
                  : JSON.stringify(e.value, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
      empty={
        <p className="text-xs text-neutral-500">
          Memory is empty. Agents will populate this as they run.
        </p>
      }
    />
  );
}
