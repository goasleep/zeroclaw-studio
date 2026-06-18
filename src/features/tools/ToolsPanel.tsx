import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { apiTools } from "@/api/client";

type ToolInfo = { name: string; [k: string]: unknown };
type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; tools: ToolInfo[] }
  | { kind: "err"; message: string };

export function ToolsPanel() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  async function refresh() {
    setState({ kind: "loading" });
    try {
      const data = await apiTools();
      setState({ kind: "ok", tools: data.tools });
      setSelected((current) =>
        current && data.tools.some((t) => t.name === current)
          ? current
          : (data.tools[0]?.name ?? null),
      );
    } catch (e) {
      setState({ kind: "err", message: String(e) });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const tools = state.kind === "ok" ? state.tools : [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? tools.filter((tool) =>
          JSON.stringify(tool).toLowerCase().includes(q),
        )
      : tools;
  }, [filter, tools]);
  const selectedTool =
    tools.find((tool) => tool.name === selected) ?? filtered[0] ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-w-0 flex-col border-r border-white/10 bg-[#020818]/90">
        <div className="border-b border-white/10 p-3">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search tools..."
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-1.5 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>{filtered.length} tools</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-neutral-400 hover:bg-white/[0.05] hover:text-cyan-300"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 p-2 text-xs text-neutral-500">
              <Loader2 size={13} className="animate-spin" />
              Loading tools...
            </div>
          )}
          {state.kind === "err" && (
            <div className="m-1 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <pre className="whitespace-pre-wrap font-mono">{state.message}</pre>
            </div>
          )}
          {state.kind === "ok" && filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
              No tools match your search.
            </div>
          )}
          <div className="space-y-1">
            {filtered.map((tool) => (
              <button
                key={tool.name}
                type="button"
                onClick={() => setSelected(tool.name)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
                  selectedTool?.name === tool.name
                    ? "bg-cyan-400/10 text-cyan-100"
                    : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                }`}
              >
                <Wrench size={13} className="shrink-0 text-cyan-300" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">
                    {tool.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
                    {toolDescription(tool)}
                  </span>
                </span>
                <ChevronRight size={12} className="shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="min-w-0 overflow-hidden">
        <ToolDetail tool={selectedTool} />
      </main>
    </div>
  );
}

function ToolDetail({ tool }: { tool: ToolInfo | null }) {
  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <Wrench size={28} className="mx-auto mb-3 text-neutral-600" />
          <h2 className="text-sm font-medium text-neutral-200">
            Select a tool
          </h2>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
            Choose a tool to inspect its metadata, schema, and available fields.
          </p>
        </div>
      </div>
    );
  }

  const entries = Object.entries(tool).filter(([key]) => key !== "name");
  const description = toolDescription(tool);
  const schemaEntries = entries.filter(([key]) => /schema|param|input|arg/i.test(key));
  const metadataEntries = entries.filter(
    ([key]) => !schemaEntries.some(([schemaKey]) => schemaKey === key),
  );

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
            <Wrench size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-mono text-base font-semibold text-neutral-100">
              {tool.name}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              {description}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-4xl space-y-4">
          {schemaEntries.length > 0 && (
            <section className="rounded-lg border border-white/10 bg-white/[0.035]">
              <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
                Inputs and schema
              </h3>
              <div className="divide-y divide-white/10">
                {schemaEntries.map(([key, value]) => (
                  <ToolField key={key} name={key} value={value} />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-white/10 bg-white/[0.035]">
            <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
              Metadata
            </h3>
            <div className="divide-y divide-white/10">
              {metadataEntries.length === 0 ? (
                <p className="px-4 py-3 text-xs text-neutral-500">
                  No additional metadata reported.
                </p>
              ) : (
                metadataEntries.map(([key, value]) => (
                  <ToolField key={key} name={key} value={value} />
                ))
              )}
            </div>
          </section>

          <details className="rounded-lg border border-white/10 bg-white/[0.035]">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-100">
              <Braces size={14} className="text-neutral-500" />
              Raw payload
            </summary>
            <pre className="overflow-x-auto border-t border-white/10 p-4 text-xs leading-relaxed text-neutral-400">
              {JSON.stringify(tool, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function ToolField({ name, value }: { name: string; value: unknown }) {
  return (
    <div className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="font-mono text-neutral-500">{name}</div>
      <div className="min-w-0">
        {isPrimitive(value) ? (
          <span className="break-words text-neutral-300">{String(value)}</span>
        ) : (
          <pre className="max-h-80 overflow-auto rounded-md border border-white/10 bg-[#020818]/90 p-3 text-[11px] leading-relaxed text-neutral-400">
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function toolDescription(tool: ToolInfo) {
  const description =
    tool.description ?? tool.summary ?? tool.help ?? tool.title ?? tool.kind;
  return typeof description === "string" && description.trim()
    ? description
    : "Gateway tool";
}

function isPrimitive(value: unknown) {
  return (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
