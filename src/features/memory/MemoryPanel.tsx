import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Code2,
  Database,
  HardDrive,
  KeyRound,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  TriangleAlert,
} from "lucide-react";
import {
  apiConfigList,
  apiConfigPatch,
  apiConfigPicker,
  apiConfigSections,
  apiConfigSelectItem,
  type ConfigListEntry,
  type ConfigSectionInfo,
  type PatchOp,
  type PickerItem,
} from "@/api/config";
import { ApiError } from "@/api/base";
import {
  configDraftError,
  defaultDraft,
  parseConfigDraft,
} from "@/features/config/config-value-schema";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/switch";

type LoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      section: ConfigSectionInfo;
      choices: PickerItem[];
      memoryEntries: ConfigListEntry[];
      allEntries: ConfigListEntry[];
      loadedAt: Date;
    }
  | { kind: "error"; message: string };

type MemoryUsage = {
  path: string;
  label: string;
  raw: string;
  backendKey: string | null;
  alias: string | null;
  populated: boolean;
};

const EMPTY_CHOICES: PickerItem[] = [];

type BackendSummary = {
  choiceKey: string;
  configuredAliases: string[];
  activeAliases: string[];
  activeUsages: MemoryUsage[];
  status: "active" | "configured" | "available";
};

type MemoryOverview = {
  summaries: Record<string, BackendSummary>;
  usages: MemoryUsage[];
  activeLabel: string;
  configuredCount: number;
};

type FormTarget = {
  prefix: string;
  title: string;
  subtitle?: string;
  choice?: PickerItem;
};

const MEMORY_BACKEND_META: Record<string, { label: string; body: string; icon: ReactNode }> = {
  none: {
    label: "No memory",
    body: "Disable persistent memory for stateless agents.",
    icon: <Database size={15} />,
  },
  sqlite: {
    label: "SQLite",
    body: "Local single-file memory for a workstation runtime.",
    icon: <HardDrive size={15} />,
  },
  postgres: {
    label: "Postgres",
    body: "Shared relational memory for server runtimes.",
    icon: <Server size={15} />,
  },
  qdrant: {
    label: "Qdrant",
    body: "Vector memory for semantic retrieval.",
    icon: <Layers3 size={15} />,
  },
  markdown: {
    label: "Markdown",
    body: "Readable file-backed memory.",
    icon: <Code2 size={15} />,
  },
  lucid: {
    label: "Lucid",
    body: "Structured graph-oriented memory.",
    icon: <KeyRound size={15} />,
  },
};

export function MemoryPanel() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    setTarget(null);
    try {
      const sections = await apiConfigSections();
      const section =
        sections.sections.find((item) => item.key === "memory") ??
        sections.sections.find((item) => /memory/i.test(item.key));

      if (!section) {
        setState({
          kind: "error",
          message: "The gateway did not report a memory config section.",
        });
        return;
      }

      const choices =
        section.has_picker && section.shape !== "direct_form"
          ? (await apiConfigPicker(section.key)).items
          : [];
      const [memoryConfig, allConfig] = await Promise.all([
        apiConfigList(section.key).catch(() => ({ entries: [] })),
        apiConfigList().catch(() => ({ entries: [] })),
      ]);

      setState({
        kind: "ready",
        section,
        choices,
        memoryEntries: memoryConfig.entries,
        allEntries: allConfig.entries,
        loadedAt: new Date(),
      });
      setSelectedKey((current) =>
        current && choices.some((choice) => choice.key === current)
          ? current
          : (choices[0]?.key ?? null),
      );
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choices = state.kind === "ready" ? state.choices : EMPTY_CHOICES;
  const overview = useMemo(
    () =>
      state.kind === "ready"
        ? buildMemoryOverview(state.section, choices, state.memoryEntries, state.allEntries)
        : emptyOverview(),
    [choices, state],
  );
  const filteredChoices = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter((choice) =>
      [choice.key, choice.label, choice.description, choice.badge]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [choices, filter]);
  const selectedChoice =
    choices.find((choice) => choice.key === selectedKey) ??
    choices.find((choice) => overview.summaries[choice.key]?.status === "active") ??
    filteredChoices[0] ??
    null;

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-[#020818]/90">
        <LoadingInline label="Loading memory config..." />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="h-full overflow-auto bg-[#020818]/90 p-5 zc-scrollbar">
        <ErrorBox message={state.message} />
      </div>
    );
  }

  const directForm = !state.section.has_picker || state.section.shape === "direct_form";

  if (directForm) {
    return (
      <MemoryFieldForm
        key={`${reloadKey}-${state.section.key}`}
        target={{
          prefix: state.section.key,
          title: state.section.label,
          subtitle: state.section.help,
        }}
        onSaved={() => {
          setReloadKey((current) => current + 1);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#020818]/90">
        <header className="shrink-0 border-b border-white/10 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
              <Database size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-neutral-100">
                  {state.section.label}
                </h2>
                <StatusBadge section={state.section} />
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-neutral-500">
                {state.section.key}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="Current" value={overview.activeLabel} />
            <Metric label="Configured" value={String(overview.configuredCount)} />
          </div>

          <CurrentMemoryNotice overview={overview} />

          <ActiveMemoryPanel overview={overview} choices={choices} onSaved={() => void refresh()} />

          <div className="relative mt-3">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search backends..."
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-1.5 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-white/[0.05] hover:text-cyan-300"
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 zc-scrollbar">
          {filteredChoices.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
              No memory backends match this filter.
            </div>
          )}
          <div className="space-y-1">
            {filteredChoices.map((choice) => {
              const meta = memoryMeta(choice);
              const summary = overview.summaries[choice.key];
              return (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => {
                    setSelectedKey(choice.key);
                    setTarget(null);
                  }}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition ${
                    selectedChoice?.key === choice.key
                      ? "bg-cyan-400/10 text-cyan-100"
                      : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                  }`}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-[#020818]/80 text-cyan-300">
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{meta.label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                      {choice.key}
                    </span>
                  </span>
                  <BackendStateBadge status={summary?.status ?? "available"} />
                  <ChevronRight size={12} className="mt-1 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 overflow-hidden">
        {target ? (
          <MemoryFieldForm
            key={`${reloadKey}-${target.prefix}`}
            target={target}
            onBack={() => setTarget(null)}
            onSaved={() => {
              setReloadKey((current) => current + 1);
              void refresh();
            }}
          />
        ) : selectedChoice ? (
          <BackendSetup
            section={state.section}
            choice={selectedChoice}
            summary={overview.summaries[selectedChoice.key]}
            onTarget={setTarget}
            onSaved={() => {
              setReloadKey((current) => current + 1);
              void refresh();
            }}
          />
        ) : (
          <EmptyState
            icon={<Database size={28} />}
            title="Select a memory backend"
            body="Choose a backend to configure its connection fields."
          />
        )}
      </main>
    </div>
  );
}

function BackendSetup({
  section,
  choice,
  summary,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  choice: PickerItem;
  summary?: BackendSummary;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const typed =
    section.shape === "typed_family_map" || section.shape === undefined || section.shape === null;
  const oneTier = section.shape === "one_tier_alias_map";

  if (oneTier) {
    return (
      <OneTierBackendSetup
        section={section}
        choice={choice}
        summary={summary}
        onTarget={onTarget}
        onSaved={onSaved}
      />
    );
  }

  if (typed) {
    return (
      <TypedBackendSetup
        section={section}
        choice={choice}
        summary={summary}
        onTarget={onTarget}
        onSaved={onSaved}
      />
    );
  }

  return (
    <BackendOpenPanel
      section={section}
      choice={choice}
      summary={summary}
      onTarget={onTarget}
      onSaved={onSaved}
    />
  );
}

function TypedBackendSetup({
  section,
  choice,
  summary,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  choice: PickerItem;
  summary?: BackendSummary;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const prefix = `${section.key}.${choice.key}`;
  const [aliases, setAliases] = useState<string[]>([]);
  const [alias, setAlias] = useState("default");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = memoryMeta(choice);

  const loadAliases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiConfigList(prefix);
      const next = aliasesFromEntries(data.entries, prefix);
      setAliases(next);
      setAlias((current) => current || next[0] || "default");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [prefix]);

  useEffect(() => {
    void loadAliases();
  }, [loadAliases]);

  async function openAlias(nextAlias: string) {
    const clean = nextAlias.trim() || "default";
    setBusy(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, choice.key, clean);
      onSaved();
      onTarget({
        prefix: result.fields_prefix,
        title: `${meta.label} / ${clean}`,
        subtitle: result.created ? "Created memory backend alias" : choice.description,
        choice,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-5 zc-scrollbar">
      <div className="mx-auto max-w-4xl space-y-4">
        <BackendHeader choice={choice} summary={summary} />
        {error && <ErrorBox message={error} />}
        <section className="rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-medium text-neutral-100">Aliases</h3>
            <p className="mt-1 font-mono text-[10px] text-neutral-500">{prefix}</p>
          </div>
          <div className="divide-y divide-white/10">
            {loading ? (
              <LoadingInline label="Loading aliases..." />
            ) : aliases.length === 0 ? (
              <p className="px-4 py-3 text-xs text-neutral-500">No aliases configured.</p>
            ) : (
              aliases.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => void openAlias(name)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                >
                  <span className="font-mono">{name}</span>
                  {summary?.activeAliases.includes(name) && <Badge label="active" />}
                  <ChevronRight size={13} />
                </button>
              ))
            )}
          </div>
        </section>
        <AliasCreator
          alias={alias}
          busy={busy}
          label="Create or open alias"
          onAlias={setAlias}
          onSubmit={() => void openAlias(alias)}
        />
      </div>
    </div>
  );
}

function OneTierBackendSetup({
  section,
  choice,
  summary,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  choice: PickerItem;
  summary?: BackendSummary;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = memoryMeta(choice);

  async function openAlias(name: string) {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, clean);
      onSaved();
      onTarget({
        prefix: result.fields_prefix,
        title: clean,
        subtitle: result.created ? "Created memory backend entry" : meta.body,
        choice,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-5 zc-scrollbar">
      <div className="mx-auto max-w-4xl space-y-4">
        <BackendHeader choice={choice} summary={summary} />
        {error && <ErrorBox message={error} />}
        <button
          type="button"
          onClick={() => void openAlias(choice.key)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-sm text-neutral-200 hover:border-cyan-400/50 hover:text-cyan-100"
        >
          <span>
            <span className="block font-medium">Open configured entry</span>
            <span className="mt-1 block font-mono text-xs text-neutral-500">
              {section.key}.{choice.key}
            </span>
          </span>
          <ChevronRight size={14} />
        </button>
        <AliasCreator
          alias={alias}
          busy={busy}
          label="Create another entry"
          onAlias={setAlias}
          onSubmit={() => void openAlias(alias)}
        />
      </div>
    </div>
  );
}

function BackendOpenPanel({
  section,
  choice,
  summary,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  choice: PickerItem;
  summary?: BackendSummary;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = memoryMeta(choice);

  async function openBackend() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, choice.key);
      onSaved();
      onTarget({
        prefix: result.fields_prefix,
        title: meta.label,
        subtitle: result.created ? "Created memory backend config" : meta.body,
        choice,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-5 zc-scrollbar">
      <div className="mx-auto max-w-4xl space-y-4">
        <BackendHeader choice={choice} summary={summary} />
        {error && <ErrorBox message={error} />}
        <button
          type="button"
          onClick={() => void openBackend()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={13} />}
          Open fields
        </button>
      </div>
    </div>
  );
}

function BackendHeader({ choice, summary }: { choice: PickerItem; summary?: BackendSummary }) {
  const meta = memoryMeta(choice);
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-100">{meta.label}</h2>
            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
              {choice.key}
            </span>
            {choice.badge && <Badge label={choice.badge} />}
            <BackendStateBadge status={summary?.status ?? "available"} />
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-neutral-500">
            {choice.description || meta.body}
          </p>
          {summary && summary.activeUsages.length > 0 && (
            <div className="mt-3 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3">
              <div className="text-[10px] uppercase tracking-wide text-emerald-300">Used by</div>
              <div className="mt-2 space-y-1">
                {summary.activeUsages.map((usage) => (
                  <div
                    key={usage.path}
                    className="flex flex-wrap items-center gap-2 text-xs text-emerald-100"
                  >
                    <span className="font-medium">{usage.label}</span>
                    <span className="font-mono text-[10px] text-emerald-300/70">{usage.raw}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MemoryFieldForm({
  target,
  onBack,
  onSaved,
}: {
  target: FormTarget;
  onBack?: () => void;
  onSaved: () => void;
}) {
  const [entries, setEntries] = useState<ConfigListEntry[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [seed, setSeed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiConfigList(target.prefix);
      const nextSeed: Record<string, string> = {};
      for (const entry of data.entries) nextSeed[entry.path] = defaultDraft(entry);
      setEntries(data.entries);
      setSeed(nextSeed);
      setDraft(nextSeed);
      setValidationErrors({});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [target.prefix]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyEntries = entries.filter((entry) => draft[entry.path] !== seed[entry.path]);
  const tabs = useMemo(() => groupFields(entries), [entries]);

  async function save() {
    if (dirtyEntries.length === 0) return;
    setSaving(true);
    setError(null);
    setValidationErrors({});
    setSaved(false);
    try {
      const errors: Record<string, string> = {};
      const ops: PatchOp[] = [];
      for (const entry of dirtyEntries) {
        try {
          ops.push({
            op: entry.populated || entry.is_secret ? "replace" : "add",
            path: dottedToPointer(entry.path),
            value: parseConfigDraft(entry, draft[entry.path] ?? "").value,
          });
        } catch (e) {
          errors[entry.path] = configDraftError(e) ?? errorMessage(e);
        }
      }
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }
      await apiConfigPatch(ops);
      setSaved(true);
      await load();
      onSaved();
      window.setTimeout(() => setSaved(false), 1200);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-400 hover:border-cyan-400/50 hover:text-cyan-300"
                >
                  Back
                </button>
              )}
              <h2 className="truncate text-sm font-semibold text-neutral-100">{target.title}</h2>
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                {target.prefix}
              </span>
            </div>
            {target.subtitle && (
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-neutral-500">
                {target.subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={dirtyEntries.length === 0 || saving}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : saved ? (
              <Check size={12} />
            ) : (
              <Save size={12} />
            )}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
        {loading && <LoadingInline label="Loading fields..." />}
        {error && <ErrorBox message={error} />}
        {!loading && !error && entries.length === 0 && (
          <EmptyState
            icon={<Code2 size={28} />}
            title="No editable memory fields"
            body="The gateway did not report editable fields for this memory target."
          />
        )}
        {!loading && entries.length > 0 && (
          <div className="mx-auto max-w-4xl space-y-5">
            {tabs.map(({ label, fields }) => (
              <section key={label} className="rounded-lg border border-white/10 bg-white/[0.035]">
                <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
                  {label}
                </h3>
                <div className="divide-y divide-white/10">
                  {fields.map((entry) => (
                    <FieldRow
                      key={entry.path}
                      entry={entry}
                      value={draft[entry.path] ?? ""}
                      dirty={draft[entry.path] !== seed[entry.path]}
                      error={validationErrors[entry.path]}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          [entry.path]: value,
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AliasCreator({
  alias,
  busy,
  label,
  onAlias,
  onSubmit,
}: {
  alias: string;
  busy: boolean;
  label: string;
  onAlias: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <label className="block text-xs font-medium text-neutral-300" htmlFor="memory-alias">
        Alias
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="memory-alias"
          value={alias}
          onChange={(event) => onAlias(event.target.value)}
          placeholder="default"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {label}
        </button>
      </div>
    </section>
  );
}

function FieldRow({
  entry,
  value,
  dirty,
  error,
  onChange,
}: {
  entry: ConfigListEntry;
  value: string;
  dirty: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const label = leafLabel(entry.path);
  return (
    <div className="grid gap-3 px-4 py-3 text-xs lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-neutral-200">{label}</span>
          {dirty && <Badge label="edited" />}
          {entry.is_secret && <Badge label="secret" />}
          {entry.is_env_overridden && <Badge label="env" />}
        </div>
        <div className="mt-1 truncate font-mono text-[10px] text-neutral-500">{entry.path}</div>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-500">
          <span>{entry.kind}</span>
          {entry.type_hint && <span>{entry.type_hint}</span>}
          {entry.category && <span>{entry.category}</span>}
        </div>
      </div>
      <div className="min-w-0">
        <FieldInput entry={entry} value={value} onChange={onChange} />
        {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
      </div>
    </div>
  );
}

function FieldInput({
  entry,
  value,
  onChange,
}: {
  entry: ConfigListEntry;
  value: string;
  onChange: (value: string) => void;
}) {
  if (entry.kind === "bool") {
    return (
      <Switch
        checked={value === "true"}
        onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        label={value === "true" ? "true" : "false"}
      />
    );
  }

  if (entry.kind === "enum" && entry.enum_variants?.length) {
    return (
      <Select
        value={value || "__unset__"}
        onValueChange={(next) => onChange(next === "__unset__" ? "" : next)}
        options={[
          { value: "__unset__", label: "unset" },
          ...entry.enum_variants.map((variant) => ({ value: variant, label: variant })),
        ]}
        className="w-full max-w-xl"
      />
    );
  }

  if (entry.kind === "integer" || entry.kind === "float") {
    return (
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-cyan-400"
      />
    );
  }

  if (entry.kind === "string-array" || entry.kind === "object-array") {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100 outline-none focus:border-cyan-400"
      />
    );
  }

  if (entry.is_secret) {
    return (
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={entry.populated ? "Secret is set. Type to replace." : "Enter secret value"}
        className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
      />
    );
  }

  const multiline = value.length > 80 || /prompt|template|description|system/i.test(entry.path);
  return multiline ? (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={4}
      className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100 outline-none focus:border-cyan-400"
    />
  ) : (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-cyan-400"
    />
  );
}

function StatusBadge({ section }: { section: ConfigSectionInfo }) {
  const ready = section.ready && section.completed;
  return <Badge label={ready ? "configured" : section.completed ? "partial" : "needs setup"} />;
}

function BackendStateBadge({ status }: { status: BackendSummary["status"] }) {
  if (status === "active") return <Badge label="active" />;
  if (status === "configured") return <Badge label="configured" />;
  return <Badge label="available" />;
}

function CurrentMemoryNotice({ overview }: { overview: MemoryOverview }) {
  const active = overview.usages.filter((usage) => usage.backendKey);
  return (
    <section className="mt-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">Current backend</div>
      <div className="mt-1 truncate font-mono text-xs font-medium text-neutral-100">
        {overview.activeLabel}
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-neutral-500">
        {active.length > 0
          ? `${active.length} config reference${active.length === 1 ? "" : "s"} found`
          : "No active memory_backend reference found"}
      </div>
    </section>
  );
}

function ActiveMemoryPanel({
  overview,
  choices,
  onSaved,
}: {
  overview: MemoryOverview;
  choices: PickerItem[];
  onSaved: () => void;
}) {
  const firstUsagePath = overview.usages[0]?.path ?? "";
  const [usagePath, setUsagePath] = useState(firstUsagePath);
  const selectedUsage =
    overview.usages.find((usage) => usage.path === usagePath) ?? overview.usages[0] ?? null;
  const [backendKey, setBackendKey] = useState(selectedUsage?.backendKey ?? choices[0]?.key ?? "");
  const [alias, setAlias] = useState(selectedUsage?.alias ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUsagePath(firstUsagePath);
  }, [firstUsagePath]);

  useEffect(() => {
    setBackendKey(selectedUsage?.backendKey ?? choices[0]?.key ?? "");
    setAlias(selectedUsage?.alias ?? "");
  }, [choices, selectedUsage?.alias, selectedUsage?.backendKey, selectedUsage?.path]);

  if (overview.usages.length === 0) {
    return (
      <section className="mt-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-3">
        <h3 className="text-xs font-medium text-neutral-200">Active memory selector</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
          No agent or profile currently exposes a memory selector. Configure backends here, then
          bind one from an agent or profile.
        </p>
      </section>
    );
  }

  const configuredAliases = backendKey
    ? (overview.summaries[backendKey]?.configuredAliases ?? [])
    : [];
  const nextValue = formatMemorySelectorValue(selectedUsage?.raw ?? "", backendKey, alias);
  const dirty = Boolean(selectedUsage && nextValue !== selectedUsage.raw);

  async function save() {
    if (!selectedUsage || !backendKey) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const ops: PatchOp[] = [
        {
          op: selectedUsage.populated ? "replace" : "add",
          path: dottedToPointer(selectedUsage.path),
          value: nextValue,
        },
      ];
      await apiConfigPatch(ops);
      setSaved(true);
      onSaved();
      window.setTimeout(() => setSaved(false), 1200);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-3 rounded-md border border-white/10 bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-neutral-200">Active selector</h3>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving || !backendKey}
          className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-400 px-2 py-1 text-[10px] font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <Loader2 size={11} className="animate-spin" />
          ) : saved ? (
            <Check size={11} />
          ) : (
            <Save size={11} />
          )}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      <label className="mt-3 block text-[10px] uppercase tracking-wide text-neutral-500">
        Usage
      </label>
      <select
        value={selectedUsage?.path ?? ""}
        onChange={(event) => setUsagePath(event.target.value)}
        className="mt-1 w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-cyan-400"
      >
        {overview.usages.map((usage) => (
          <option key={usage.path} value={usage.path}>
            {usage.label}
          </option>
        ))}
      </select>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <label className="min-w-0 text-[10px] uppercase tracking-wide text-neutral-500">
          Backend
          <select
            value={backendKey}
            onChange={(event) => setBackendKey(event.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 text-xs normal-case tracking-normal text-neutral-100 outline-none focus:border-cyan-400"
          >
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {memoryMeta(choice).label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-[10px] uppercase tracking-wide text-neutral-500">
          Alias
          <input
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="default"
            className="mt-1 w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs normal-case tracking-normal text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
          />
        </label>
      </div>

      <div className="mt-2 truncate font-mono text-[10px] text-neutral-500">
        {selectedUsage?.path}: {nextValue || "<unset>"}
      </div>
      {configuredAliases.length > 0 && (
        <div className="mt-1 truncate text-[10px] text-neutral-500">
          configured aliases: {configuredAliases.join(", ")}
        </div>
      )}
      {error && <div className="mt-2 text-[10px] text-red-300">{error}</div>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-2">
      <div className="truncate text-sm font-semibold text-cyan-100">{value}</div>
      <div className="mt-0.5 truncate text-[10px] text-neutral-500">{label}</div>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <div className="mx-auto mb-3 flex justify-center text-neutral-600">{icon}</div>
        <h2 className="text-sm font-medium text-neutral-200">{title}</h2>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">{body}</p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="m-1 mb-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <pre className="whitespace-pre-wrap font-mono">{message}</pre>
    </div>
  );
}

function LoadingInline({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-2 text-xs text-neutral-500">
      <Loader2 size={13} className="animate-spin" />
      {label}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  const good = ["active", "configured", "created", "ready"].includes(label);
  const warn = label === "needs setup" || label === "env" || label === "partial";
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
        good
          ? "bg-emerald-500/10 text-emerald-300"
          : warn
            ? "bg-amber-500/10 text-amber-300"
            : "bg-white/[0.05] text-neutral-500"
      }`}
    >
      {label}
    </span>
  );
}

function memoryMeta(choice: PickerItem) {
  const fallback = {
    label: choice.label || choice.key,
    body: choice.description || "Memory backend",
    icon: <Database size={15} />,
  };
  const meta = MEMORY_BACKEND_META[choice.key] ?? fallback;
  return {
    label: choice.label || meta.label,
    body: choice.description || meta.body,
    icon: meta.icon,
  };
}

function emptyOverview(): MemoryOverview {
  return {
    summaries: {},
    usages: [],
    activeLabel: "Not selected",
    configuredCount: 0,
  };
}

function buildMemoryOverview(
  section: ConfigSectionInfo,
  choices: PickerItem[],
  memoryEntries: ConfigListEntry[],
  allEntries: ConfigListEntry[],
): MemoryOverview {
  const usages = findMemoryUsages(section, choices, allEntries);
  const summaries: Record<string, BackendSummary> = {};

  for (const choice of choices) {
    const configuredAliases = configuredAliasesFor(section, choice, memoryEntries);
    const activeUsages = usages.filter((usage) => usage.backendKey === choice.key);
    const activeAliases = Array.from(
      new Set(activeUsages.map((usage) => usage.alias).filter(Boolean) as string[]),
    ).sort();
    summaries[choice.key] = {
      choiceKey: choice.key,
      configuredAliases,
      activeAliases,
      activeUsages,
      status:
        activeUsages.length > 0
          ? "active"
          : configuredAliases.length > 0
            ? "configured"
            : "available",
    };
  }

  const activeLabels = usages
    .filter((usage) => usage.backendKey)
    .map((usage) =>
      usage.alias ? `${usage.backendKey}.${usage.alias}` : (usage.backendKey ?? usage.raw),
    );
  const uniqueActive = Array.from(new Set(activeLabels));
  const configuredCount = Object.values(summaries).filter(
    (summary) => summary.status !== "available",
  ).length;

  return {
    summaries,
    usages,
    activeLabel:
      uniqueActive.length === 0
        ? "Not selected"
        : uniqueActive.length === 1
          ? uniqueActive[0]
          : `${uniqueActive.length} active`,
    configuredCount,
  };
}

function configuredAliasesFor(
  section: ConfigSectionInfo,
  choice: PickerItem,
  memoryEntries: ConfigListEntry[],
) {
  if (section.shape === "one_tier_alias_map") {
    return memoryEntries.some(
      (entry) =>
        entry.path === `${section.key}.${choice.key}` ||
        entry.path.startsWith(`${section.key}.${choice.key}.`),
    )
      ? [choice.key]
      : [];
  }

  const prefix = `${section.key}.${choice.key}`;
  const aliases = aliasesFromEntries(memoryEntries, prefix);
  if (aliases.length > 0) return aliases;
  return memoryEntries.some((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}.`))
    ? ["default"]
    : [];
}

function findMemoryUsages(
  section: ConfigSectionInfo,
  choices: PickerItem[],
  allEntries: ConfigListEntry[],
) {
  const choiceKeys = choices.map((choice) => choice.key);
  const usages: MemoryUsage[] = [];
  for (const entry of allEntries) {
    if (entry.path === section.key || entry.path.startsWith(`${section.key}.`)) continue;
    if (!looksLikeMemorySelector(entry)) continue;
    const raw = valueAsString(entry.value);
    if (!raw) continue;
    const parsed = parseMemoryRef(raw, choiceKeys);
    usages.push({
      path: entry.path,
      label: usageLabel(entry.path),
      raw,
      backendKey: parsed.backendKey,
      alias: parsed.alias,
      populated: entry.populated,
    });
  }
  return usages;
}

function looksLikeMemorySelector(entry: ConfigListEntry) {
  const leaf = entry.path.split(".").pop() ?? "";
  if (leaf === "memory_backend" || leaf === "memory") return true;
  if (leaf === "backend" && /memory/i.test(entry.path)) return true;
  return false;
}

function parseMemoryRef(raw: string, choiceKeys: string[]) {
  const clean = raw.trim().replace(/^memory[.:/]/, "");
  const parts = clean.split(/[.:/]/).filter(Boolean);
  const backendKey = parts.find((part) => choiceKeys.includes(part)) ?? null;
  if (!backendKey) return { backendKey: null, alias: null };
  const index = parts.indexOf(backendKey);
  return {
    backendKey,
    alias: parts[index + 1] ?? null,
  };
}

function formatMemorySelectorValue(seed: string, backendKey: string, alias: string) {
  const cleanAlias = alias.trim();
  const suffix = cleanAlias ? `${backendKey}.${cleanAlias}` : backendKey;
  if (seed.startsWith("memory:")) {
    return cleanAlias ? `memory:${backendKey}:${cleanAlias}` : `memory:${backendKey}`;
  }
  if (seed.startsWith("memory/")) {
    return cleanAlias ? `memory/${backendKey}/${cleanAlias}` : `memory/${backendKey}`;
  }
  if (seed.startsWith("memory.")) return `memory.${suffix}`;
  return suffix;
}

function valueAsString(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean === "<unset>") return null;
  return clean;
}

function usageLabel(path: string) {
  const parts = path.split(".");
  const agentIndex = parts.findIndex((part) => part === "agents" || part === "agent");
  if (agentIndex >= 0 && parts[agentIndex + 1]) return `Agent ${parts[agentIndex + 1]}`;
  const profileIndex = parts.findIndex((part) => /profile/.test(part));
  if (profileIndex >= 0 && parts[profileIndex + 1])
    return `${parts[profileIndex]} ${parts[profileIndex + 1]}`;
  return path;
}

function groupFields(entries: ConfigListEntry[]) {
  const groups = new Map<string, ConfigListEntry[]>();
  for (const entry of [...entries].sort(fieldSort)) {
    const group = entry.tab || entry.category || "Fields";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }
  return Array.from(groups.entries()).map(([label, fields]) => ({ label, fields }));
}

function fieldSort(a: ConfigListEntry, b: ConfigListEntry) {
  return fieldPriority(a) - fieldPriority(b) || a.path.localeCompare(b.path);
}

function fieldPriority(entry: ConfigListEntry) {
  const leaf = entry.path.split(".").pop() ?? "";
  const order = [
    "enabled",
    "memory_backend",
    "backend",
    "type",
    "uri",
    "url",
    "database_url",
    "path",
    "collection",
    "api_key",
  ];
  const index = order.indexOf(leaf);
  return index >= 0 ? index : 100;
}

function aliasesFromEntries(entries: ConfigListEntry[], prefix: string) {
  const prefixDot = `${prefix}.`;
  const aliases = new Set<string>();
  for (const entry of entries) {
    const rest = entry.path.startsWith(prefixDot) ? entry.path.slice(prefixDot.length) : "";
    const alias = rest.split(".")[0];
    if (alias) aliases.add(alias);
  }
  return Array.from(aliases).sort();
}

function dottedToPointer(path: string) {
  return `/${path
    .split(".")
    .map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
}

function leafLabel(path: string) {
  const leaf = path.split(".").pop() || path;
  return leaf.replace(/[-_]/g, " ");
}

function errorMessage(e: unknown) {
  if (e instanceof ApiError) return `[${e.envelope.code}] ${e.envelope.message}`;
  return e instanceof Error ? e.message : String(e);
}
