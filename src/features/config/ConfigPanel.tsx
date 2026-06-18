import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Code2,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import {
  ApiError,
  apiConfigCreateMapKey,
  apiConfigDeleteMapKey,
  apiConfigDeleteProp,
  apiConfigDrift,
  apiConfigList,
  apiConfigPatch,
  apiConfigPicker,
  apiConfigProp,
  apiConfigReloadStatus,
  apiConfigSections,
  apiConfigSelectItem,
  apiConfigTemplates,
  apiConfigPutProp,
  apiSkillBundles,
  type ConfigTemplate,
  type ConfigListEntry,
  type ConfigSectionInfo,
  type PatchOp,
  type PickerItem,
} from "@/api/client";
import { SetupDoctorTab } from "./SetupDoctorTab";
import { setupTargetsForPrefix } from "./setup-targets";

const GROUP_ORDER = [
  "Foundation",
  "Agent",
  "Multi-agent",
  "Tools",
  "Integrations",
  "Network",
  "Storage",
  "Operations",
  "Other",
] as const;

type PanelMode = "sections" | "advanced";
type FormTarget = { prefix: string; title: string; subtitle?: string };
type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; sections: ConfigSectionInfo[] }
  | { kind: "error"; message: string };

export function ConfigPanel({ focusSection }: { focusSection?: string | null }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [mode, setMode] = useState<PanelMode>("sections");
  const [activeKey, setActiveKey] = useState<string | null>(focusSection ?? null);
  const [filter, setFilter] = useState("");
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadSections = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await apiConfigSections();
      setState({ kind: "ready", sections: data.sections });
      setActiveKey((current) => {
        if (focusSection && data.sections.some((s) => s.key === focusSection)) {
          return focusSection;
        }
        if (current && data.sections.some((s) => s.key === current)) {
          return current;
        }
        return data.sections[0]?.key ?? null;
      });
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    }
  }, [focusSection]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  useEffect(() => {
    if (!focusSection || state.kind !== "ready") return;
    if (state.sections.some((s) => s.key === focusSection)) {
      setMode("sections");
      setActiveKey(focusSection);
      setTarget(null);
    }
  }, [focusSection, state]);

  const sections = state.kind === "ready" ? state.sections : [];
  const activeSection = sections.find((s) => s.key === activeKey) ?? null;
  const filteredGroups = useMemo(
    () => groupSections(filterSections(sections, filter)),
    [sections, filter],
  );

  function chooseSection(section: ConfigSectionInfo) {
    setMode("sections");
    setActiveKey(section.key);
    setTarget(null);
  }

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
              placeholder="Search sections..."
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-1.5 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>{sections.length} sections</span>
            <button
              type="button"
              onClick={() => void loadSections()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-neutral-400 hover:bg-white/[0.05] hover:text-cyan-300"
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {state.kind === "loading" && (
            <LoadingInline label="Loading config sections..." />
          )}
          {state.kind === "error" && <ErrorBox message={state.message} />}
          {state.kind === "ready" &&
            filteredGroups.map(({ group, items }) => (
              <section key={group} className="mb-4">
                <h3 className="mb-1 px-1 text-[10px] uppercase tracking-wide text-neutral-500">
                  {group}
                </h3>
                <div className="space-y-1">
                  {items.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => chooseSection(section)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
                        mode === "sections" && activeKey === section.key
                          ? "bg-cyan-400/10 text-cyan-100"
                          : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                      }`}
                    >
                      <SectionStateDot section={section} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {section.label}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                          {section.key}
                        </span>
                      </span>
                      <ChevronRight size={12} className="shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
        </div>

        <div className="shrink-0 border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => {
              setMode("advanced");
              setTarget(null);
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
              mode === "advanced"
                ? "bg-cyan-400/10 text-cyan-100"
                : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
            }`}
          >
            <Code2 size={13} />
            <span className="min-w-0 flex-1 truncate">Advanced raw paths</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 overflow-hidden">
        {mode === "advanced" ? (
          <AdvancedConfigEditor />
        ) : (
          <SectionExplorer
            section={activeSection}
            target={target}
            reloadKey={reloadKey}
            onTarget={setTarget}
            onSaved={() => {
              setReloadKey((n) => n + 1);
              void loadSections();
            }}
          />
        )}
      </main>
    </div>
  );
}

function SectionExplorer({
  section,
  target,
  reloadKey,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo | null;
  target: FormTarget | null;
  reloadKey: number;
  onTarget: (target: FormTarget | null) => void;
  onSaved: () => void;
}) {
  if (!section) {
    return (
      <EmptyState
        icon={<Code2 size={28} />}
        title="Select a config section"
        body="Choose a section to inspect its picker, aliases, and editable fields."
      />
    );
  }

  if (target) {
    return (
      <ConfigFieldForm
        key={`${reloadKey}-${target.prefix}`}
        target={target}
        onBack={() => onTarget(null)}
        onSaved={onSaved}
      />
    );
  }

  if (!section.has_picker || section.shape === "direct_form") {
    return (
      <ConfigFieldForm
        key={`${reloadKey}-${section.key}`}
        target={{
          prefix: section.key,
          title: section.label,
          subtitle: section.help,
        }}
        onSaved={onSaved}
      />
    );
  }

  return (
    <PickerSection
      section={section}
      onTarget={onTarget}
      onSaved={onSaved}
    />
  );
}

function PickerSection({
  section,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState<PickerItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFilter("");
    setSelectedItem(null);
    void apiConfigPicker(section.key)
      .then((resp) => {
        if (cancelled) return;
        setItems(resp.items);
        setSelectedItem(resp.items[0] ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section.key]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? items.filter((item) =>
          [item.key, item.label, item.description, item.badge]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : items;
  }, [filter, items]);

  async function selectBackend(item: PickerItem, alias?: string) {
    const result = await apiConfigSelectItem(section.key, item.key, alias);
    onSaved();
    onTarget({
      prefix: result.fields_prefix,
      title: alias ? `${item.label} / ${alias}` : item.label,
      subtitle: result.created ? "Created from section picker" : section.help,
    });
  }

  const typed =
    section.shape === "typed_family_map" || section.shape === undefined || section.shape === null;
  const oneTier = section.shape === "one_tier_alias_map";

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-w-0 flex-col border-r border-white/10 bg-[#020818]/90">
        <header className="shrink-0 border-b border-white/10 p-3">
          <h2 className="truncate text-sm font-semibold text-neutral-100">
            {section.label}
          </h2>
          {section.help && (
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-neutral-500">
              {section.help}
            </p>
          )}
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter choices..."
            className="mt-3 w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && <LoadingInline label="Loading picker..." />}
          {error && <ErrorBox message={error} />}
          {!loading && !error && filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
              No choices match this filter.
            </div>
          )}
          <div className="space-y-1">
            {filtered.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedItem(item)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
                  selectedItem?.key === item.key
                    ? "bg-cyan-400/10 text-cyan-100"
                    : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                    {item.key}
                  </span>
                </span>
                {item.badge && <Badge label={item.badge} />}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="min-w-0 overflow-hidden">
        {selectedItem ? (
          oneTier ? (
            <OneTierAliasPanel
              section={section}
              item={selectedItem}
              onTarget={onTarget}
              onSaved={onSaved}
            />
          ) : typed ? (
            <TypedAliasPanel
              section={section}
              item={selectedItem}
              onTarget={onTarget}
              onSaved={onSaved}
            />
          ) : (
            <BackendPanel
              section={section}
              item={selectedItem}
              onSelect={(alias) => void selectBackend(selectedItem, alias)}
            />
          )
        ) : oneTier ? (
          <OneTierEmptyPanel
            section={section}
            onTarget={onTarget}
            onSaved={onSaved}
          />
        ) : (
          <EmptyState
            icon={<Plus size={28} />}
            title="Pick a choice"
            body="Select a row to create, choose, or inspect its config fields."
          />
        )}
      </div>
    </div>
  );
}

function OneTierEmptyPanel({
  section,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const [alias, setAlias] = useState("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAlias() {
    const clean = alias.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, clean);
      onSaved();
      onTarget({
        prefix: result.fields_prefix,
        title: clean,
        subtitle: result.created ? "Created new entry" : section.help,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <SectionHeader
          title={section.label}
          code={section.key}
          body={section.help || "Create the first named entry for this section."}
        />
        <AliasCreator
          alias={alias}
          busy={busy}
          label="Create entry"
          onAlias={setAlias}
          onSubmit={() => void createAlias()}
        />
        {error && <ErrorBox message={error} />}
      </div>
    </div>
  );
}

function TypedAliasPanel({
  section,
  item,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  item: PickerItem;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const prefix = `${section.key}.${item.key}`;
  const [aliases, setAliases] = useState<string[]>([]);
  const [alias, setAlias] = useState("default");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, item.key, nextAlias);
      onSaved();
      onTarget({
        prefix: result.fields_prefix,
        title: `${item.label} / ${nextAlias}`,
        subtitle: result.created ? "Created new alias" : item.description,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <SectionHeader title={item.label} code={item.key} body={item.description} />
        {loading ? (
          <LoadingInline label="Loading aliases..." />
        ) : (
          <section className="rounded-lg border border-white/10 bg-white/[0.035]">
            <div className="border-b border-white/10 px-4 py-3">
              <h3 className="text-sm font-medium text-neutral-100">Aliases</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Existing aliases under <span className="font-mono">{prefix}</span>.
              </p>
            </div>
            <div className="divide-y divide-white/10">
              {aliases.length === 0 ? (
                <p className="px-4 py-3 text-xs text-neutral-500">
                  No aliases configured yet.
                </p>
              ) : (
                aliases.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => void openAlias(name)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                  >
                    <span className="font-mono">{name}</span>
                    <ChevronRight size={13} />
                  </button>
                ))
              )}
            </div>
          </section>
        )}
        <AliasCreator
          alias={alias}
          busy={busy}
          label="Create or open alias"
          onAlias={setAlias}
          onSubmit={() => void openAlias(alias.trim() || "default")}
        />
        {error && <ErrorBox message={error} />}
      </div>
    </div>
  );
}

function OneTierAliasPanel({
  section,
  item,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  item: PickerItem;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        subtitle: result.created ? "Created new entry" : section.help,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <SectionHeader title={item.label} code={item.key} body={item.description} />
        <button
          type="button"
          onClick={() => void openAlias(item.key)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-sm text-neutral-200 hover:border-cyan-400/50 hover:text-cyan-100"
        >
          <span>
            <span className="block font-medium">Open configured entry</span>
            <span className="mt-1 block font-mono text-xs text-neutral-500">
              {section.key}.{item.key}
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
        {error && <ErrorBox message={error} />}
      </div>
    </div>
  );
}

function BackendPanel({
  item,
  onSelect,
}: {
  section: ConfigSectionInfo;
  item: PickerItem;
  onSelect: (alias?: string) => void;
}) {
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <SectionHeader title={item.label} code={item.key} body={item.description} />
        <button
          type="button"
          onClick={() => onSelect()}
          className="inline-flex items-center gap-2 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300"
        >
          <Check size={13} />
          Select and edit fields
        </button>
      </div>
    </div>
  );
}

function ConfigFieldForm({
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
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"fields" | "setup">("fields");

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
  const setupTargets = useMemo(() => setupTargetsForPrefix(target.prefix), [target.prefix]);

  useEffect(() => {
    setActiveTab("fields");
  }, [target.prefix]);

  async function save() {
    if (dirtyEntries.length === 0) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const ops: PatchOp[] = dirtyEntries.map((entry) => ({
        op: entry.populated || entry.is_secret ? "replace" : "add",
        path: dottedToPointer(entry.path),
        value: parseDraft(entry, draft[entry.path] ?? ""),
      }));
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
              <h2 className="truncate text-sm font-semibold text-neutral-100">
                {target.title}
              </h2>
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
          {activeTab === "fields" && (
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
          )}
        </div>
        {setupTargets.length > 0 && (
          <div className="mt-3 flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("fields")}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] ${
                activeTab === "fields"
                  ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 text-neutral-400 hover:border-white/15 hover:text-neutral-100"
              }`}
            >
              <Code2 size={12} />
              Fields
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("setup")}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] ${
                activeTab === "setup"
                  ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 text-neutral-400 hover:border-white/15 hover:text-neutral-100"
              }`}
            >
              <Wrench size={12} />
              Setup/Doctor
            </button>
          </div>
        )}
      </header>
      {activeTab === "setup" && setupTargets.length > 0 ? (
        <SetupDoctorTab
          prefix={target.prefix}
          title={target.title}
          onConfigSaved={onSaved}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {loading && <LoadingInline label="Loading fields..." />}
          {error && <ErrorBox message={error} />}
          {!loading && !error && entries.length === 0 && (
            <EmptyState
              icon={<Code2 size={28} />}
              title="No fields for this prefix"
              body="The gateway did not report editable config fields under this prefix."
            />
          )}
          {!loading && entries.length > 0 && (
            <div className="mx-auto max-w-4xl space-y-5">
              {tabs.map(({ label, fields }) => (
                <section
                  key={label}
                  className="rounded-lg border border-white/10 bg-white/[0.035]"
                >
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
      )}
    </div>
  );
}

function FieldRow({
  entry,
  value,
  dirty,
  onChange,
}: {
  entry: ConfigListEntry;
  value: string;
  dirty: boolean;
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
        <div className="mt-1 truncate font-mono text-[10px] text-neutral-500">
          {entry.path}
        </div>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-500">
          <span>{entry.kind}</span>
          {entry.type_hint && <span>{entry.type_hint}</span>}
          {entry.category && <span>{entry.category}</span>}
        </div>
      </div>
      <FieldInput entry={entry} value={value} onChange={onChange} />
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
      <button
        type="button"
        role="switch"
        aria-checked={value === "true"}
        onClick={() => onChange(value === "true" ? "false" : "true")}
        className={`w-fit rounded-full border px-3 py-1.5 text-xs font-medium ${
          value === "true"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-white/10 bg-[#020818]/90 text-neutral-400"
        }`}
      >
        {value === "true" ? "true" : "false"}
      </button>
    );
  }

  if (entry.kind === "enum" && entry.enum_variants?.length) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-400"
      >
        <option value="">unset</option>
        {entry.enum_variants.map((variant) => (
          <option key={variant} value={variant}>
            {variant}
          </option>
        ))}
      </select>
    );
  }

  if (entry.kind === "integer" || entry.kind === "float") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-cyan-400"
      />
    );
  }

  if (entry.kind === "string-array" || entry.kind === "object-array") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
        onChange={(e) => onChange(e.target.value)}
        placeholder={entry.populated ? "Secret is set. Type to replace." : "Enter secret value"}
        className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
      />
    );
  }

  const multiline = value.length > 80 || /prompt|template|description|system/i.test(entry.path);
  return multiline ? (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100 outline-none focus:border-cyan-400"
    />
  ) : (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-cyan-400"
    />
  );
}

function AdvancedConfigEditor() {
  const [entries, setEntries] = useState<ConfigListEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ConfigListEntry | null>(null);
  const [draft, setDraft] = useState("");
  const [seed, setSeed] = useState("");
  const [templates, setTemplates] = useState<ConfigTemplate[] | null>(null);
  const [reloadStatus, setReloadStatus] = useState<string | null>(null);
  const [driftStatus, setDriftStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapPath, setMapPath] = useState("");
  const [mapKey, setMapKey] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [skillsAvailable, setSkillsAvailable] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiConfigList();
      setEntries(data.entries);
      void apiConfigReloadStatus()
        .then((status) => setReloadStatus(status.status ?? JSON.stringify(status)))
        .catch(() => setReloadStatus(null));
      void apiConfigDrift()
        .then((drift) =>
          setDriftStatus(
            drift.drifted ? `${drift.drifted.length} drifted paths` : "available",
          ),
        )
        .catch(() => setDriftStatus(null));
      void apiConfigTemplates()
        .then((resp) => setTemplates(resp.templates))
        .catch(() => setTemplates(null));
      void apiSkillBundles()
        .then(() => setSkillsAvailable(true))
        .catch(() => setSkillsAvailable(false));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(entry: ConfigListEntry) {
    setSelected(entry);
    setError(null);
    try {
      const result = await apiConfigProp(entry.path);
      const next = entry.is_secret
        ? ""
        : formatRawValue(result.value ?? entry.value ?? "");
      setSeed(next);
      setDraft(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await apiConfigPutProp(selected.path, parseRawDraft(draft));
      setSeed(draft);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function reveal() {
    if (!selected) return;
    setError(null);
    try {
      const result = await apiConfigProp(selected.path, true);
      const next = formatRawValue(result.value ?? "");
      setSeed(next);
      setDraft(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteProp() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await apiConfigDeleteProp(selected.path);
      setSelected(null);
      setDraft("");
      setSeed("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function createMapKey() {
    if (!mapPath.trim() || !mapKey.trim()) return;
    setError(null);
    try {
      const result = await apiConfigCreateMapKey(
        mapPath.trim(),
        mapKey.trim(),
        templateKey || undefined,
      );
      const prefix = result.fields_prefix ?? result.path ?? `${mapPath}.${mapKey}`;
      setFilter(prefix);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteMapKey() {
    if (!mapPath.trim() || !mapKey.trim()) return;
    setError(null);
    try {
      await apiConfigDeleteMapKey(mapPath.trim(), mapKey.trim());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? entries.filter((entry) =>
          [entry.path, entry.category, entry.kind, entry.type_hint].some((v) =>
            String(v ?? "").toLowerCase().includes(q),
          ),
        )
      : entries;
  }, [entries, filter]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-w-0 flex-col border-r border-white/10">
        <div className="border-b border-white/10 p-3">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search raw paths..."
            className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
          />
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-neutral-500">
            {reloadStatus && <Badge label={`reload ${reloadStatus}`} />}
            {driftStatus && <Badge label={driftStatus} />}
            {skillsAvailable === true && <Badge label="skills" />}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && <LoadingInline label="Loading raw paths..." />}
          {filtered.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => void open(entry)}
              className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
                selected?.path === entry.path
                  ? "bg-cyan-400/10 text-cyan-100"
                  : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs">
                  {leafLabel(entry.path)}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                  {entry.path}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <main className="min-w-0 overflow-hidden">
        {!selected ? (
          <div className="h-full overflow-auto p-5">
            <div className="mx-auto max-w-4xl space-y-4">
              <EmptyState
                icon={<Code2 size={28} />}
                title="Select a raw path"
                body="Advanced mode edits one property at a time through /api/config/prop."
              />
              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h3 className="mb-3 text-sm font-medium text-neutral-100">
                  Map key tools
                </h3>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_160px_auto_auto]">
                  <input
                    value={mapPath}
                    onChange={(e) => setMapPath(e.target.value)}
                    placeholder="map path, e.g. model_providers.openai"
                    className="rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
                  />
                  <input
                    value={mapKey}
                    onChange={(e) => setMapKey(e.target.value)}
                    placeholder="alias"
                    className="rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
                  />
                  <select
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                    className="rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-cyan-400"
                  >
                    <option value="">no template</option>
                    {(templates ?? []).map((template, idx) => {
                      const key = template.key ?? template.name ?? String(idx);
                      return (
                        <option key={key} value={key}>
                          {template.label ?? template.name ?? key}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={() => void createMapKey()}
                    className="rounded bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteMapKey()}
                    className="rounded border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-red-500/50 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
                {templates === null && (
                  <p className="mt-2 text-[10px] text-neutral-500">
                    Templates endpoint unavailable on this gateway.
                  </p>
                )}
              </section>
              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h3 className="text-sm font-medium text-neutral-100">Skills</h3>
                <p className="mt-2 text-xs text-neutral-500">
                  {skillsAvailable
                    ? "Skills bundle endpoints are available. Bundle editing can be reached through raw paths and gateway skill APIs."
                    : "Skills bundle endpoints are not exposed by this gateway, so this area is hidden from the main editor."}
                </p>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <header className="flex shrink-0 items-start gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-mono text-sm text-neutral-100">
                  {selected.path}
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {selected.kind} {selected.type_hint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void reveal()}
                disabled={!selected.is_secret}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Eye size={12} />
                Reveal
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={draft === seed || saving}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ${selected.path}?`)) void deleteProp();
                }}
                disabled={saving}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {error && <ErrorBox message={error} />}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="h-[520px] w-full resize-none rounded-md border border-white/10 bg-[#020818]/90 p-3 font-mono text-xs leading-relaxed text-neutral-100 outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        )}
      </main>
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
  onAlias: (alias: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <h3 className="text-sm font-medium text-neutral-100">{label}</h3>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={alias}
          onChange={(e) => onAlias(e.target.value)}
          placeholder="default"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Open
        </button>
      </div>
    </section>
  );
}

function SectionHeader({
  title,
  code,
  body,
}: {
  title: string;
  code: string;
  body?: string;
}) {
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
        <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
          {code}
        </span>
      </div>
      {body && <p className="mt-2 text-xs leading-relaxed text-neutral-500">{body}</p>}
    </header>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <div className="mx-auto mb-3 flex justify-center text-neutral-600">{icon}</div>
        <h2 className="text-sm font-medium text-neutral-200">{title}</h2>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
          {body}
        </p>
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
  const warn = label === "needs setup" || label === "env";
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

function SectionStateDot({ section }: { section: ConfigSectionInfo }) {
  const color = section.ready
    ? "bg-emerald-400"
    : section.completed
      ? "bg-amber-400"
      : "bg-white/[0.12]";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function groupSections(sections: ConfigSectionInfo[]) {
  const groups = new Map<string, ConfigSectionInfo[]>();
  for (const section of sections) {
    const group = section.group || "Other";
    groups.set(group, [...(groups.get(group) ?? []), section]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
    .map(([group, items]) => ({ group, items }));
}

function filterSections(sections: ConfigSectionInfo[], filter: string) {
  const q = filter.trim().toLowerCase();
  if (!q) return sections;
  return sections.filter((section) =>
    [section.key, section.label, section.group, section.help]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  );
}

function groupRank(group: string) {
  const idx = GROUP_ORDER.indexOf(group as (typeof GROUP_ORDER)[number]);
  return idx >= 0 ? idx : GROUP_ORDER.length;
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
    "model",
    "api_key",
    "requires_openai_auth",
    "uri",
    "model_provider",
    "risk_profile",
    "runtime_profile",
    "channels",
  ];
  const idx = order.indexOf(leaf);
  return idx >= 0 ? idx : 100;
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

function defaultDraft(entry: ConfigListEntry) {
  if (entry.is_secret) return "";
  const value = entry.value;
  if (value == null || value === "<unset>") {
    if (entry.kind === "string-array" || entry.kind === "object-array") return "[]";
    return "";
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return JSON.stringify(value, null, 2);
  return String(value);
}

function parseDraft(entry: ConfigListEntry, value: string): unknown {
  if (entry.kind === "bool") return value === "true";
  if (entry.kind === "integer" || entry.kind === "float") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (entry.kind === "string-array") return parseStringArray(value);
  if (entry.kind === "object-array") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  return value;
}

function parseStringArray(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fall through to newline/comma parsing.
    }
  }
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
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

function formatRawValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function parseRawDraft(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function errorMessage(e: unknown) {
  if (e instanceof ApiError) return `[${e.envelope.code}] ${e.envelope.message}`;
  return e instanceof Error ? e.message : String(e);
}
