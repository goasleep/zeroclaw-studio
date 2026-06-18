import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Braces,
  ChevronRight,
  Circle,
  Database,
  Filter,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { apiConfigSections, apiMemory, type ConfigSectionInfo } from "@/api/client";

type MemoryEntry = { key: string; value: unknown };
type MemoryKind = "string" | "object" | "array" | "number" | "boolean" | "empty";
type LoadState =
  | { kind: "loading" }
  | {
      kind: "ok";
      entries: MemoryEntry[];
      config: ConfigSectionInfo | null;
      refreshedAt: Date;
    }
  | { kind: "err"; message: string };

type TypeFilter = MemoryKind | "all";

interface MemoryPanelProps {
  onOpenConfig?: () => void;
}

export function MemoryPanel({ onOpenConfig }: MemoryPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const [memory, sections] = await Promise.all([
        apiMemory(),
        apiConfigSections().catch(() => ({ sections: [] })),
      ]);
      const entries = Array.isArray(memory.entries) ? memory.entries : [];
      const config = sections.sections.find((section) => section.key === "memory") ?? null;
      setState({
        kind: "ok",
        entries,
        config,
        refreshedAt: new Date(),
      });
      setSelectedIndex((current) =>
        current != null && entries[current] ? current : entries.length ? 0 : null,
      );
    } catch (e) {
      setState({ kind: "err", message: String(e) });
      setSelectedIndex(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const entries = state.kind === "ok" ? state.entries : [];
  const stats = useMemo(() => summarize(entries), [entries]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return entries
      .map((entry, index) => ({ entry, index, meta: describeEntry(entry) }))
      .filter(({ entry, meta }) => {
        if (typeFilter !== "all" && meta.kind !== typeFilter) return false;
        if (!q) return true;
        return (
          entry.key.toLowerCase().includes(q) ||
          meta.namespace.toLowerCase().includes(q) ||
          stringifyValue(entry.value).toLowerCase().includes(q)
        );
      });
  }, [entries, filter, typeFilter]);

  const selected =
    selectedIndex != null && entries[selectedIndex]
      ? { entry: entries[selectedIndex], index: selectedIndex }
      : (filtered[0] ?? null);

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
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
              placeholder="Search memory..."
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-1.5 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatTile label="Entries" value={String(entries.length)} tone="cyan" />
            <StatTile label="Types" value={String(stats.typeCount)} tone="emerald" />
            <StatTile label="Size" value={formatBytes(stats.bytes)} tone="amber" />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {(["all", "string", "object", "array"] as TypeFilter[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setTypeFilter(kind)}
                  className={`shrink-0 rounded-md px-2 py-1 text-[10px] capitalize transition ${
                    typeFilter === kind
                      ? "bg-cyan-400/10 text-cyan-100"
                      : "text-neutral-500 hover:bg-white/[0.05] hover:text-neutral-200"
                  }`}
                >
                  {kind}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-white/[0.05] hover:text-cyan-300"
              title="Refresh memory"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {state.kind === "loading" && (
            <InlineStatus icon={<Loader2 size={13} className="animate-spin" />}>
              Loading memory...
            </InlineStatus>
          )}
          {state.kind === "err" && (
            <div className="m-1 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <pre className="whitespace-pre-wrap font-mono">{state.message}</pre>
            </div>
          )}
          {state.kind === "ok" && entries.length === 0 && <EmptyList onOpenConfig={onOpenConfig} />}
          {state.kind === "ok" && entries.length > 0 && filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
              No memory entries match this filter.
            </div>
          )}
          <div className="space-y-1">
            {filtered.map(({ entry, index, meta }) => (
              <button
                key={`${entry.key}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition ${
                  selected?.index === index
                    ? "bg-cyan-400/10 text-cyan-100"
                    : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                }`}
              >
                <KindIcon kind={meta.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">
                    {entry.key || "(empty key)"}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
                    {meta.namespace} · {meta.kind} · {formatBytes(meta.bytes)}
                  </span>
                </span>
                <ChevronRight size={12} className="mt-0.5 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="min-w-0 overflow-hidden">
        <MemoryDetail selected={selected} state={state} stats={stats} onOpenConfig={onOpenConfig} />
      </main>
    </div>
  );
}

function MemoryDetail({
  selected,
  state,
  stats,
  onOpenConfig,
}: {
  selected: { entry: MemoryEntry; index: number } | null;
  state: LoadState;
  stats: ReturnType<typeof summarize>;
  onOpenConfig?: () => void;
}) {
  const entry = selected?.entry ?? null;
  const meta = entry ? describeEntry(entry) : null;
  const config = state.kind === "ok" ? state.config : null;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
            <Database size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-neutral-100">Runtime memory</h2>
              {config && <ConfigBadge config={config} />}
            </div>
            <p className="mt-1 truncate text-xs text-neutral-500">
              {state.kind === "ok"
                ? `Last refresh ${formatTime(state.refreshedAt)}`
                : "Gateway memory endpoint"}
            </p>
          </div>
          {onOpenConfig && (
            <button
              type="button"
              onClick={onOpenConfig}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/60 hover:text-cyan-200"
            >
              <Settings2 size={13} />
              Config
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="grid gap-3 md:grid-cols-4">
            <OverviewTile label="Entries" value={String(stats.total)} />
            <OverviewTile label="Namespaces" value={String(stats.namespaces)} />
            <OverviewTile label="Payload" value={formatBytes(stats.bytes)} />
            <OverviewTile label="Largest" value={formatBytes(stats.largest)} />
          </section>

          {entry && meta ? (
            <>
              <section className="rounded-lg border border-white/10 bg-white/[0.035]">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <KindIcon kind={meta.kind} large />
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-mono text-sm font-semibold text-neutral-100">
                        {entry.key || "(empty key)"}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                        <MetaPill icon={<Filter size={10} />} label={meta.namespace} />
                        <MetaPill icon={<Layers3 size={10} />} label={meta.kind} />
                        <MetaPill icon={<Braces size={10} />} label={formatBytes(meta.bytes)} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-white/10">
                  <DetailRow name="Namespace" value={meta.namespace} />
                  <DetailRow name="Value type" value={meta.kind} />
                  <DetailRow name="Approx size" value={formatBytes(meta.bytes)} />
                  {meta.fieldCount != null && (
                    <DetailRow name="Fields" value={String(meta.fieldCount)} />
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.035]">
                <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
                  Value
                </h3>
                {meta.kind === "string" ? (
                  <pre className="max-h-[38rem] overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-neutral-300">
                    {String(entry.value)}
                  </pre>
                ) : (
                  <pre className="max-h-[38rem] overflow-auto p-4 text-xs leading-relaxed text-neutral-300">
                    {stringifyValue(entry.value)}
                  </pre>
                )}
              </section>
            </>
          ) : (
            <EmptyDetail onOpenConfig={onOpenConfig} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyList({ onOpenConfig }: { onOpenConfig?: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.035] p-4 text-xs text-neutral-500">
      <Database size={18} className="mb-2 text-neutral-600" />
      <p>No memory entries reported.</p>
      {onOpenConfig && (
        <button
          type="button"
          onClick={onOpenConfig}
          className="mt-3 flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-300 hover:border-cyan-400/60 hover:text-cyan-200"
        >
          <Settings2 size={12} />
          Memory config
        </button>
      )}
    </div>
  );
}

function EmptyDetail({ onOpenConfig }: { onOpenConfig?: () => void }) {
  return (
    <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
      <div>
        <Database size={28} className="mx-auto mb-3 text-neutral-600" />
        <h3 className="text-sm font-medium text-neutral-200">No memory selected</h3>
        {onOpenConfig && (
          <button
            type="button"
            onClick={onOpenConfig}
            className="mx-auto mt-4 flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/60 hover:text-cyan-200"
          >
            <Settings2 size={13} />
            Open config
          </button>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "cyan" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "cyan" ? "text-cyan-200" : tone === "emerald" ? "text-emerald-200" : "text-amber-200";
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-2">
      <div className={`truncate text-sm font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-neutral-500">{label}</div>
    </div>
  );
}

function OverviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="text-lg font-semibold text-neutral-100">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}

function DetailRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[160px_minmax(0,1fr)]">
      <div className="font-mono text-neutral-500">{name}</div>
      <div className="min-w-0 break-words text-neutral-300">{value}</div>
    </div>
  );
}

function MetaPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-white/10 bg-[#020818]/80 px-2 py-1 text-neutral-400">
      <span className="shrink-0 text-neutral-500">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function ConfigBadge({ config }: { config: ConfigSectionInfo }) {
  const ready = config.ready && config.completed;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] ${
        ready ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"
      }`}
    >
      <Circle size={7} fill="currentColor" />
      {ready ? "Configured" : "Needs config"}
    </span>
  );
}

function KindIcon({ kind, large = false }: { kind: MemoryKind; large?: boolean }) {
  const size = large ? 16 : 13;
  const className =
    kind === "string"
      ? "text-cyan-300"
      : kind === "object"
        ? "text-emerald-300"
        : kind === "array"
          ? "text-violet-300"
          : kind === "empty"
            ? "text-neutral-500"
            : "text-amber-300";
  return <Braces size={size} className={`mt-0.5 shrink-0 ${className}`} />;
}

function InlineStatus({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 p-2 text-xs text-neutral-500">
      {icon}
      {children}
    </div>
  );
}

function summarize(entries: MemoryEntry[]) {
  const kinds = new Set<MemoryKind>();
  const namespaces = new Set<string>();
  let bytes = 0;
  let largest = 0;
  for (const entry of entries) {
    const meta = describeEntry(entry);
    kinds.add(meta.kind);
    namespaces.add(meta.namespace);
    bytes += meta.bytes;
    largest = Math.max(largest, meta.bytes);
  }
  return {
    total: entries.length,
    typeCount: kinds.size,
    namespaces: namespaces.size,
    bytes,
    largest,
  };
}

function describeEntry(entry: MemoryEntry) {
  const serialized = stringifyValue(entry.value);
  const kind = valueKind(entry.value);
  return {
    kind,
    namespace: namespaceOf(entry.key),
    bytes: new Blob([serialized]).size,
    fieldCount:
      entry.value && typeof entry.value === "object" && !Array.isArray(entry.value)
        ? Object.keys(entry.value as Record<string, unknown>).length
        : Array.isArray(entry.value)
          ? entry.value.length
          : null,
  };
}

function valueKind(value: unknown): MemoryKind {
  if (value == null || value === "") return "empty";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function namespaceOf(key: string) {
  const clean = key.trim();
  if (!clean) return "root";
  const match = clean.match(/^([^:./\s]+)[:./]/);
  return match?.[1] ?? "root";
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
