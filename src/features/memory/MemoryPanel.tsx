import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import {
  Check,
  ChevronRight,
  Code2,
  Database,
  HardDrive,
  KeyRound,
  Layers3,
  Loader2,
  Power,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  TriangleAlert,
  UserRound,
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
import { Dialog } from "@/ui/dialog";
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
  activateOnSave?: {
    usage: MemoryUsage;
    backendKey: string;
    alias: string;
  };
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
  const { t } = useLingui();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedUsagePath, setSelectedUsagePath] = useState<string | null>(null);
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
          message: t`The gateway did not report a memory config section.`,
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
  }, [t]);

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
  const selectedUsage =
    overview.usages.find((usage) => usage.path === selectedUsagePath) ?? overview.usages[0] ?? null;

  useEffect(() => {
    if (overview.usages.length === 0) {
      setSelectedUsagePath(null);
      return;
    }
    setSelectedUsagePath((current) =>
      current && overview.usages.some((usage) => usage.path === current)
        ? current
        : overview.usages[0].path,
    );
  }, [overview.usages]);

  useEffect(() => {
    if (!selectedUsage?.backendKey) return;
    setSelectedKey(selectedUsage.backendKey);
    setTarget(null);
  }, [selectedUsage?.backendKey, selectedUsage?.path]);

  const selectedChoice =
    choices.find((choice) => choice.key === selectedKey) ??
    choices.find((choice) => choice.key === selectedUsage?.backendKey) ??
    choices.find((choice) => overview.summaries[choice.key]?.status === "active") ??
    choices[0] ??
    null;

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-[#020818]/90">
        <LoadingInline label={t`Loading memory config...`} />
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
    <div className="h-full overflow-auto bg-[#020818]/90 p-5 zc-scrollbar">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-lg border border-white/10 bg-white/[0.025] px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
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
              </div>
            </div>

            <MemoryStatusPanel
              overview={overview}
              choices={choices}
              selectedUsage={selectedUsage}
              onUsageSelected={(path) => {
                setSelectedUsagePath(path);
                setTarget(null);
              }}
              onSaved={() => void refresh()}
            />

            <button
              type="button"
              onClick={() => void refresh()}
              className="flex w-fit items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:border-cyan-400/50 hover:text-cyan-300"
            >
              <RefreshCw size={11} />
              {t`Refresh`}
            </button>
          </div>
        </section>

        <main className="min-w-0">
          {target ? (
            <div className="min-h-[620px] overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
              <MemoryFieldForm
                key={`${reloadKey}-${target.prefix}`}
                target={target}
                onBack={() => setTarget(null)}
                onSaved={() => {
                  setReloadKey((current) => current + 1);
                  void refresh();
                }}
              />
            </div>
          ) : selectedChoice ? (
            <MemoryHomePanel
              section={state.section}
              choices={choices}
              overview={overview}
              selectedUsage={selectedUsage}
              selectedKey={selectedChoice.key}
              onSelected={(key) => {
                setSelectedKey(key);
                setTarget(null);
              }}
              onTarget={setTarget}
              onSaved={() => {
                setReloadKey((current) => current + 1);
                void refresh();
              }}
            />
          ) : (
            <div className="min-h-[420px] rounded-lg border border-white/10 bg-white/[0.02]">
              <EmptyState
                icon={<Database size={28} />}
                title={t`Choose a memory option`}
                body={t`Pick where this workspace should save memories.`}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MemoryStatusPanel({
  overview,
  choices,
  selectedUsage,
  onUsageSelected,
  onSaved,
}: {
  overview: MemoryOverview;
  choices: PickerItem[];
  selectedUsage: MemoryUsage | null;
  onUsageSelected: (path: string) => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useLingui();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const enabled = isUsageMemoryEnabled(selectedUsage);
  const current = currentMemoryLabel(selectedUsage, choices, i18n);
  const hasMultipleAgents = overview.usages.length > 1;

  async function toggleMemory(nextEnabled: boolean) {
    if (saving || nextEnabled === enabled) return;
    if (!selectedUsage) {
      setError(t`No agent memory setting is available yet.`);
      return;
    }
    const choice = nextEnabled
      ? preferredEnabledChoice(choices, overview, selectedUsage)
      : choices.find((item) => item.key === "none");
    if (!choice) return;

    setSaving(true);
    setError(null);
    try {
      await saveActiveMemoryChoice(overview, choice, selectedUsage);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div className="min-w-[220px] flex-1 rounded-md border border-white/10 bg-[#020818]/70 px-3 py-2">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
              <UserRound size={11} className="text-cyan-300" />
              {t`Agent`}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-neutral-100">
              {selectedUsage?.label ?? t`No agent selected`}
            </div>
          </div>
          {hasMultipleAgents && (
            <button
              type="button"
              onClick={() => setAgentPickerOpen(true)}
              className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-100"
            >
              {t`Change`}
            </button>
          )}
        </div>
      </div>

      <div className="min-w-[260px] flex-[1.2] rounded-md border border-white/10 bg-[#020818]/70 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">{t`Memory`}</div>
            <div className="mt-1 truncate text-sm font-semibold text-neutral-100">
              {current.title}
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => void toggleMemory(checked)}
            label={saving ? t`Saving` : enabled ? t`On` : t`Off`}
          />
        </div>
      </div>

      {error && (
        <div className="w-full rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">
          {error}
        </div>
      )}
      <AgentPickerDialog
        open={agentPickerOpen}
        usages={overview.usages}
        selectedUsage={selectedUsage}
        onOpenChange={setAgentPickerOpen}
        onSelect={(usage) => {
          onUsageSelected(usage.path);
          setAgentPickerOpen(false);
        }}
      />
    </section>
  );
}

function AgentPickerDialog({
  open,
  usages,
  selectedUsage,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  usages: MemoryUsage[];
  selectedUsage: MemoryUsage | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (usage: MemoryUsage) => void;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredUsages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return usages;
    return usages.filter((usage) =>
      [usage.label, usage.path, usage.backendKey, usage.alias]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [query, usages]);

  return (
    <Dialog
      open={open}
      title={t`Choose agent`}
      onOpenChange={onOpenChange}
      className="max-w-xl rounded-xl border border-white/10 bg-[#061126] shadow-2xl shadow-black/50"
    >
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-100">{t`Choose agent`}</h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          {t`Memory changes will apply only to the selected agent.`}
        </p>
        <div className="relative mt-4">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t`Search agents...`}
            className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-2 pl-9 pr-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
          />
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-2 zc-scrollbar">
        {filteredUsages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-4 text-center text-xs text-neutral-500">
            {t`No agents match this search.`}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredUsages.map((usage) => {
              const selected = usage.path === selectedUsage?.path;
              return (
                <button
                  key={usage.path}
                  type="button"
                  onClick={() => onSelect(usage)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                    selected
                      ? "bg-cyan-400/10 text-cyan-100"
                      : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                    <UserRound size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{usage.label}</span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-neutral-500">
                      {usage.path}
                    </span>
                  </span>
                  <span className="shrink-0 rounded bg-white/[0.05] px-2 py-1 font-mono text-[10px] text-neutral-500">
                    {usage.backendKey ?? "unset"}
                  </span>
                  {selected && <Check size={14} className="shrink-0 text-cyan-300" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function MemoryHomePanel({
  section,
  choices,
  overview,
  selectedUsage,
  selectedKey,
  onSelected,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  choices: PickerItem[];
  overview: MemoryOverview;
  selectedUsage: MemoryUsage | null;
  selectedKey: string;
  onSelected: (key: string) => void;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useLingui();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedChoice = choices.find((choice) => choice.key === selectedKey) ?? choices[0] ?? null;
  const orderedChoices = useMemo(() => sortMemoryChoices(choices), [choices]);

  async function openChoiceFields(choice: PickerItem, activateOnSave: boolean) {
    const summary = overview.summaries[choice.key];
    const alias =
      section.shape === "one_tier_alias_map" ? "" : defaultAliasFor(choice, summary, selectedUsage);
    const meta = memoryMeta(choice, i18n);
    setPendingKey(choice.key);
    setError(null);
    try {
      const result =
        section.shape === "one_tier_alias_map"
          ? await apiConfigSelectItem(section.key, choice.key)
          : section.shape === "typed_family_map" ||
              section.shape === undefined ||
              section.shape === null
            ? await apiConfigSelectItem(section.key, choice.key, alias || "default")
            : await apiConfigSelectItem(section.key, choice.key);
      onTarget({
        prefix: result.fields_prefix,
        title: friendlyMemoryTitle(choice, i18n),
        subtitle: result.created
          ? t`Set up ${meta.label} memory.`
          : friendlyMemoryBody(choice, i18n),
        choice,
        activateOnSave:
          activateOnSave && selectedUsage
            ? {
                usage: selectedUsage,
                backendKey: choice.key,
                alias,
              }
            : undefined,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPendingKey(null);
    }
  }

  async function applyChoice(choice: PickerItem) {
    if (!selectedUsage) {
      setError(t`No agent memory setting is available yet.`);
      return;
    }
    setPendingKey(choice.key);
    setError(null);
    try {
      await saveActiveMemoryChoice(overview, choice, selectedUsage);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="min-w-0">
      <div className="max-w-5xl space-y-5">
        <header>
          <h2 className="text-base font-semibold text-neutral-100">{t`Memory options`}</h2>
        </header>

        {error && <ErrorBox message={error} />}

        <div className="grid gap-3 xl:grid-cols-2">
          {orderedChoices.map((choice) => {
            const summary = overview.summaries[choice.key];
            const status = memoryStatusForUsage(choice, summary, selectedUsage);
            return (
              <MemoryChoiceCard
                key={choice.key}
                choice={choice}
                status={status}
                selected={choice.key === selectedKey}
                pending={pendingKey === choice.key}
                canSwitch={Boolean(selectedUsage)}
                agentLabel={selectedUsage?.label ?? t`this agent`}
                onSelect={() => onSelected(choice.key)}
                onUse={() => void applyChoice(choice)}
                onConfigure={() => void openChoiceFields(choice, status !== "active")}
              />
            );
          })}
        </div>

        {selectedChoice && (
          <details className="rounded-lg border border-white/10 bg-white/[0.025]">
            <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-neutral-300 hover:text-cyan-100">
              {t`Advanced backend setup`}
            </summary>
            <div className="border-t border-white/10">
              <BackendSetup
                section={section}
                choice={selectedChoice}
                summary={overview.summaries[selectedChoice.key]}
                onTarget={onTarget}
                onSaved={onSaved}
              />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function MemoryChoiceCard({
  choice,
  status,
  selected,
  pending,
  canSwitch,
  agentLabel,
  onSelect,
  onUse,
  onConfigure,
}: {
  choice: PickerItem;
  status: BackendSummary["status"];
  selected: boolean;
  pending: boolean;
  canSwitch: boolean;
  agentLabel: string;
  onSelect: () => void;
  onUse: () => void;
  onConfigure: () => void;
}) {
  const { t, i18n } = useLingui();
  const active = status === "active";
  const configured = status === "configured";
  const offChoice = choice.key === "none";
  const actionLabel = active
    ? offChoice
      ? t`Memory is off`
      : t`Edit settings`
    : configured || offChoice
      ? offChoice
        ? t`Turn off memory`
        : t`Use for ${agentLabel}`
      : canSwitch
        ? t`Set up and use`
        : t`Set up`;

  return (
    <section
      className={`rounded-lg border p-3 transition ${
        active
          ? "border-emerald-400/30 bg-emerald-400/10"
          : selected
            ? "border-cyan-400/35 bg-cyan-400/10"
            : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <button type="button" onClick={onSelect} className="flex w-full gap-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
          {memoryMeta(choice, i18n).icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-neutral-100">
              {friendlyMemoryTitle(choice, i18n)}
            </span>
            {choice.key === "sqlite" && <Badge label={t`recommended`} />}
            <BackendStateBadge status={status} />
          </span>
          <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-neutral-500">
            {friendlyMemoryBody(choice, i18n)}
          </span>
        </span>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={
            active && !offChoice ? onConfigure : configured || offChoice ? onUse : onConfigure
          }
          disabled={pending || (active && offChoice)}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : active ? (
            <Check size={12} />
          ) : (
            <Power size={12} />
          )}
          {actionLabel}
        </button>
        {configured && !active && !offChoice && (
          <button
            type="button"
            onClick={onConfigure}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
            {t`Edit settings`}
          </button>
        )}
      </div>
    </section>
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
  const { t, i18n } = useLingui();
  const prefix = `${section.key}.${choice.key}`;
  const [aliases, setAliases] = useState<string[]>([]);
  const [alias, setAlias] = useState("default");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = memoryMeta(choice, i18n);

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
        subtitle: result.created ? t`Created memory backend alias` : choice.description,
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
            <h3 className="text-sm font-medium text-neutral-100">{t`Aliases`}</h3>
            <p className="mt-1 font-mono text-[10px] text-neutral-500">{prefix}</p>
          </div>
          <div className="divide-y divide-white/10">
            {loading ? (
              <LoadingInline label={t`Loading aliases...`} />
            ) : aliases.length === 0 ? (
              <p className="px-4 py-3 text-xs text-neutral-500">{t`No aliases configured.`}</p>
            ) : (
              aliases.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => void openAlias(name)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                >
                  <span className="font-mono">{name}</span>
                  {summary?.activeAliases.includes(name) && <Badge label={t`active`} />}
                  <ChevronRight size={13} />
                </button>
              ))
            )}
          </div>
        </section>
        <AliasCreator
          alias={alias}
          busy={busy}
          label={t`Create or open alias`}
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
  const { t, i18n } = useLingui();
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = memoryMeta(choice, i18n);

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
        subtitle: result.created ? t`Created memory backend entry` : meta.body,
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
            <span className="block font-medium">{t`Open configured entry`}</span>
            <span className="mt-1 block font-mono text-xs text-neutral-500">
              {section.key}.{choice.key}
            </span>
          </span>
          <ChevronRight size={14} />
        </button>
        <AliasCreator
          alias={alias}
          busy={busy}
          label={t`Create another entry`}
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
  const { t, i18n } = useLingui();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = memoryMeta(choice, i18n);

  async function openBackend() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, choice.key);
      onSaved();
      onTarget({
        prefix: result.fields_prefix,
        title: meta.label,
        subtitle: result.created ? t`Created memory backend config` : meta.body,
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
          {t`Open fields`}
        </button>
      </div>
    </div>
  );
}

function BackendHeader({ choice, summary }: { choice: PickerItem; summary?: BackendSummary }) {
  const { t, i18n } = useLingui();
  const meta = memoryMeta(choice, i18n);
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
              <div className="text-[10px] uppercase tracking-wide text-emerald-300">{t`Used by`}</div>
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
  const { t } = useLingui();
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
      if (target.activateOnSave) {
        const { usage, backendKey, alias } = target.activateOnSave;
        await apiConfigPatch([
          {
            op: usage.populated ? "replace" : "add",
            path: dottedToPointer(usage.path),
            value: formatMemorySelectorValue(usage.raw, backendKey, alias),
          },
        ]);
      }
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
                  {t`Back`}
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
            {saved ? t`Saved` : t`Save`}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
        {loading && <LoadingInline label={t`Loading fields...`} />}
        {error && <ErrorBox message={error} />}
        {!loading && !error && entries.length === 0 && (
          <EmptyState
            icon={<Code2 size={28} />}
            title={t`No editable memory fields`}
            body={t`The gateway did not report editable fields for this memory target.`}
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
  const { t } = useLingui();
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <label className="block text-xs font-medium text-neutral-300" htmlFor="memory-alias">
        {t`Alias`}
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
  const { t } = useLingui();
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
          { value: "__unset__", label: t`unset` },
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
        placeholder={entry.populated ? t`Secret is set. Type to replace.` : t`Enter secret value`}
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
  const { i18n } = useLingui();
  const good = ["active", "configured", "created", "ready"].includes(label);
  const warn = label === "needs setup" || label === "env" || label === "partial";
  const display = memoryBadgeLabel(label, i18n);
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
      {display}
    </span>
  );
}

function memoryBadgeLabel(label: string, i18n: LinguiI18n) {
  switch (label) {
    case "active":
      return i18n._(msg`active`);
    case "configured":
      return i18n._(msg`configured`);
    case "created":
      return i18n._(msg`created`);
    case "ready":
      return i18n._(msg`ready`);
    case "needs setup":
      return i18n._(msg`needs setup`);
    case "partial":
      return i18n._(msg`partial`);
    case "available":
      return i18n._(msg`available`);
    case "edited":
      return i18n._(msg`edited`);
    case "secret":
      return i18n._(msg`secret`);
    case "env":
      return i18n._(msg`env`);
    default:
      return label;
  }
}

type LinguiI18n = ReturnType<typeof useLingui>["i18n"];

function memoryMeta(choice: PickerItem, i18n: LinguiI18n) {
  const fallback = {
    label: choice.label || choice.key,
    body: choice.description || i18n._(msg`Memory backend`),
    icon: <Database size={15} />,
  };
  const meta =
    translatedMemoryBackendMeta(choice.key, i18n) ?? MEMORY_BACKEND_META[choice.key] ?? fallback;
  return {
    label: choice.label || meta.label,
    body: choice.description || meta.body,
    icon: meta.icon,
  };
}

function translatedMemoryBackendMeta(key: string, i18n: LinguiI18n) {
  switch (key) {
    case "none":
      return {
        label: i18n._(msg`No memory`),
        body: i18n._(msg`Disable persistent memory for stateless agents.`),
        icon: <Database size={15} />,
      };
    case "sqlite":
      return {
        label: i18n._(msg`SQLite`),
        body: i18n._(msg`Local single-file memory for a workstation runtime.`),
        icon: <HardDrive size={15} />,
      };
    case "postgres":
      return {
        label: i18n._(msg`Postgres`),
        body: i18n._(msg`Shared relational memory for server runtimes.`),
        icon: <Server size={15} />,
      };
    case "qdrant":
      return {
        label: i18n._(msg`Qdrant`),
        body: i18n._(msg`Vector memory for semantic retrieval.`),
        icon: <Layers3 size={15} />,
      };
    case "markdown":
      return {
        label: i18n._(msg`Markdown`),
        body: i18n._(msg`Readable file-backed memory.`),
        icon: <Code2 size={15} />,
      };
    case "lucid":
      return {
        label: i18n._(msg`Lucid`),
        body: i18n._(msg`Structured graph-oriented memory.`),
        icon: <KeyRound size={15} />,
      };
    default:
      return null;
  }
}

function friendlyMemoryTitle(choice: PickerItem, i18n: LinguiI18n) {
  if (choice.key === "none") return i18n._(msg`Memory off`);
  if (choice.key === "sqlite") return i18n._(msg`Local memory`);
  if (choice.key === "lucid") return i18n._(msg`Lucid sync`);
  if (choice.key === "markdown") return i18n._(msg`Markdown files`);
  if (choice.key === "postgres") return i18n._(msg`Remote database`);
  if (choice.key === "qdrant") return i18n._(msg`Vector memory`);
  return memoryMeta(choice, i18n).label;
}

function friendlyMemoryBody(choice: PickerItem, i18n: LinguiI18n) {
  if (choice.key === "none") return i18n._(msg`Do not keep persistent memory for this workspace.`);
  if (choice.key === "sqlite")
    return i18n._(msg`Recommended. Saves memory on this device and works out of the box.`);
  if (choice.key === "lucid")
    return i18n._(
      msg`Syncs with the local lucid-memory CLI for structured, graph-oriented memory.`,
    );
  if (choice.key === "markdown")
    return i18n._(msg`Stores memory in readable files that are easy to inspect.`);
  if (choice.key === "postgres")
    return i18n._(msg`Uses a shared database for deployed or team runtimes.`);
  if (choice.key === "qdrant")
    return i18n._(msg`Uses vector search for semantic memory retrieval.`);
  return memoryMeta(choice, i18n).body;
}

function currentMemoryLabel(usage: MemoryUsage | null, choices: PickerItem[], i18n: LinguiI18n) {
  if (!usage) {
    return {
      title: i18n._(msg`Memory is not selected`),
      body: i18n._(msg`Choose an agent to see its memory setting.`),
    };
  }

  if (!usage.backendKey) {
    return {
      title: i18n._(msg`Memory is not selected`),
      body: i18n._(msg`Choose where memories are saved for ${usage.label}.`),
    };
  }

  if (usage.backendKey === "none") {
    return {
      title: i18n._(msg`Memory is off`),
      body: i18n._(msg`${usage.label} will not save persistent memory.`),
    };
  }

  const key = usage.backendKey;
  const choice = choices.find((item) => item.key === key);
  return {
    title: choice ? friendlyMemoryTitle(choice, i18n) : key,
    body: usage.alias
      ? i18n._(msg`${usage.label} is using ${key}.${usage.alias}.`)
      : i18n._(msg`${usage.label} is using this memory option.`),
  };
}

function isUsageMemoryEnabled(usage: MemoryUsage | null) {
  return Boolean(usage?.backendKey && usage.backendKey !== "none");
}

function preferredEnabledChoice(
  choices: PickerItem[],
  overview: MemoryOverview,
  usage: MemoryUsage,
) {
  const activeKey = usage.backendKey && usage.backendKey !== "none" ? usage.backendKey : null;
  return (
    choices.find((choice) => choice.key === activeKey) ??
    choices.find(
      (choice) => overview.summaries[choice.key]?.status === "configured" && choice.key !== "none",
    ) ??
    choices.find((choice) => choice.key === "sqlite") ??
    choices.find((choice) => choice.key !== "none")
  );
}

function memoryStatusForUsage(
  choice: PickerItem,
  summary: BackendSummary | undefined,
  usage: MemoryUsage | null,
): BackendSummary["status"] {
  if (usage?.backendKey === choice.key) return "active";
  if ((summary?.configuredAliases.length ?? 0) > 0) return "configured";
  return "available";
}

function sortMemoryChoices(choices: PickerItem[]) {
  const order = ["sqlite", "lucid", "markdown", "postgres", "qdrant", "none"];
  return [...choices].sort((a, b) => {
    const ai = order.indexOf(a.key);
    const bi = order.indexOf(b.key);
    const ar = ai >= 0 ? ai : order.length - 1;
    const br = bi >= 0 ? bi : order.length - 1;
    return ar - br || a.key.localeCompare(b.key);
  });
}

function defaultAliasFor(choice: PickerItem, summary?: BackendSummary, usage?: MemoryUsage | null) {
  if (choice.key === "none") return "";
  if (usage?.backendKey === choice.key && usage.alias) return usage.alias;
  if (summary?.configuredAliases.length === 1 && summary.configuredAliases[0] === choice.key)
    return "";
  const configuredAlias = summary?.configuredAliases.find((alias) => alias !== choice.key);
  return summary?.activeAliases[0] ?? configuredAlias ?? "default";
}

async function saveActiveMemoryChoice(
  overview: MemoryOverview,
  choice: PickerItem,
  usage: MemoryUsage,
) {
  const alias = defaultAliasFor(choice, overview.summaries[choice.key], usage);
  await apiConfigPatch([
    {
      op: usage.populated ? "replace" : "add",
      path: dottedToPointer(usage.path),
      value: formatMemorySelectorValue(usage.raw, choice.key, alias),
    },
  ]);
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
