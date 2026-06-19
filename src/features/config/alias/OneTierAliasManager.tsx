import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Loader2, Plus, Search, X } from "lucide-react";
import type { ConfigSectionInfo, PickerItem } from "@/api/config";
import {
  configGetSummaries,
  type AgentSummary,
  type RiskProfileSummary,
  type RuntimeProfileSummary,
} from "@/api/tauri";
import { ErrorBox, LoadingInline } from "@/ui/feedback";
import type { ConfigSummaryRows, FormTarget, SummaryKind } from "../types";
import { ConfigFieldForm } from "../fields/ConfigFieldForm";
import {
  createButtonLabel,
  createEntryLabel,
  entryNameLabel,
  entryNamePlaceholder,
  entryNoun,
  entryPluralNoun,
  errorMessage,
} from "../section-utils";
import {
  bundleCount,
  centsLabel,
  inheritNumber,
  secondsLabel,
  statusDotClass,
  summaryBadge,
  summaryKindForSection,
  usedByLabel,
} from "../summary-utils";

export function OneTierAliasManager({
  section,
  items,
  filtered,
  filter,
  selectedItem,
  newItemName,
  loading,
  creatingItem,
  showCreateItem,
  openingKey,
  error,
  inlineTarget,
  onFilterChange,
  onNewItemNameChange,
  onStartCreate,
  onOpenItem,
  onCreateItem,
  onCloseDrawer,
  onSaved,
  createContent,
}: {
  section: ConfigSectionInfo;
  items: PickerItem[];
  filtered: PickerItem[];
  filter: string;
  selectedItem: PickerItem | null;
  newItemName: string;
  loading: boolean;
  creatingItem: boolean;
  showCreateItem: boolean;
  openingKey: string | null;
  error: string | null;
  inlineTarget: FormTarget | null;
  onFilterChange: (value: string) => void;
  onNewItemNameChange: (value: string) => void;
  onStartCreate: () => void;
  onOpenItem: (item: PickerItem) => void;
  onCreateItem: () => void;
  onCloseDrawer: () => void;
  onSaved: () => void;
  createContent?: ReactNode;
}) {
  const noun = entryNoun(section);
  const pluralNoun = entryPluralNoun(section);
  const showFilter = items.length > 4 || filter.trim().length > 0;
  const drawerOpen = Boolean(inlineTarget || showCreateItem || openingKey);
  const summaryKind = summaryKindForSection(section.key);
  const [summaryReloadKey, setSummaryReloadKey] = useState(0);
  const [summaryState, setSummaryState] = useState<{
    loading: boolean;
    error: string | null;
    data: ConfigSummaryRows | null;
  }>({ loading: false, error: null, data: null });

  const handleSaved = useCallback(() => {
    setSummaryReloadKey((n) => n + 1);
    onSaved();
  }, [onSaved]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseDrawer();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, onCloseDrawer]);

  useEffect(() => {
    if (!summaryKind) {
      setSummaryState({ loading: false, error: null, data: null });
      return;
    }
    let cancelled = false;
    setSummaryState((current) => ({ ...current, loading: true, error: null }));
    void configGetSummaries()
      .then((data) => {
        if (cancelled) return;
        setSummaryState({
          loading: false,
          error: null,
          data: {
            agents: data.agents,
            risk_profiles: data.risk_profiles,
            runtime_profiles: data.runtime_profiles,
          },
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setSummaryState((current) => ({
          ...current,
          loading: false,
          error: errorMessage(e),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [summaryKind, summaryReloadKey, items]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-neutral-100">{section.label}</h2>
            {section.help && (
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-500">
                {section.help}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {loading || summaryState.loading ? (
              <Loader2 size={13} className="animate-spin text-neutral-500" />
            ) : null}
            <span className="rounded bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400">
              {items.length} {items.length === 1 ? noun : pluralNoun}
            </span>
            <button
              type="button"
              onClick={onStartCreate}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
            >
              <Plus size={13} />
              {createEntryLabel(section)}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
        {summaryState.error && (
          <div className="mt-3">
            <ErrorBox message={summaryState.error} />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <main className="h-full overflow-auto p-5 zc-scrollbar">
          <div className="mx-auto max-w-6xl space-y-4">
            {showFilter && (
              <label className="block max-w-md">
                <span className="sr-only">Filter {pluralNoun}</span>
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
                  />
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    placeholder={`Filter ${pluralNoun}...`}
                    className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-2 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
                  />
                </div>
              </label>
            )}

            {loading && <LoadingInline label={`Loading ${section.label.toLowerCase()}...`} />}
            {!loading && filtered.length === 0 && (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.035] p-6 text-sm text-neutral-500">
                {filter ? `No ${pluralNoun} match this filter.` : `No ${pluralNoun} yet.`}
              </div>
            )}
            {!loading && filtered.length > 0 && (
              <AliasRows
                section={section}
                items={filtered}
                selectedKey={selectedItem?.key ?? null}
                openingKey={openingKey}
                summaryKind={summaryKind}
                summaries={summaryState.data}
                onOpenItem={onOpenItem}
              />
            )}
          </div>
        </main>
      </div>

      {drawerOpen && (
        <div className="absolute inset-0 z-20 flex bg-[#000010]/70 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label={`Close ${noun} editor`}
            onClick={onCloseDrawer}
            className="hidden min-w-8 flex-1 cursor-default lg:block"
          />
          <div className="h-full w-full max-w-[980px] border-l border-white/10 bg-[#020818] shadow-2xl shadow-black/50">
            {inlineTarget ? (
              <ConfigFieldForm
                target={inlineTarget}
                onBack={onCloseDrawer}
                backLabel="Close"
                onSaved={handleSaved}
              />
            ) : openingKey ? (
              <div className="flex h-full flex-col">
                <DrawerHeader title={`Opening ${noun}`} code={openingKey} onClose={onCloseDrawer} />
                <LoadingInline label={`Opening ${noun}...`} />
              </div>
            ) : (
              createContent ?? (
                <NewAliasDrawer
                  section={section}
                  newItemName={newItemName}
                  creatingItem={creatingItem}
                  onNewItemNameChange={onNewItemNameChange}
                  onCreateItem={onCreateItem}
                  onClose={onCloseDrawer}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AliasRows({
  section,
  items,
  selectedKey,
  openingKey,
  summaryKind,
  summaries,
  onOpenItem,
}: {
  section: ConfigSectionInfo;
  items: PickerItem[];
  selectedKey: string | null;
  openingKey: string | null;
  summaryKind: SummaryKind | null;
  summaries: ConfigSummaryRows | null;
  onOpenItem: (item: PickerItem) => void;
}) {
  const summaryByAlias = useMemo(() => {
    const map = new Map<string, AgentSummary | RiskProfileSummary | RuntimeProfileSummary>();
    if (summaryKind && summaries) {
      for (const summary of summaries[summaryKind]) map.set(summary.alias, summary);
    }
    return map;
  }, [summaries, summaryKind]);

  return (
    <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
      {items.map((item) => {
        const selected = selectedKey === item.key;
        const busy = openingKey === item.key;
        const summary = summaryByAlias.get(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onOpenItem(item)}
            className={`grid w-full gap-3 px-4 py-3 text-left transition md:grid-cols-[minmax(170px,0.9fr)_minmax(260px,1.6fr)_auto] md:items-center ${
              selected ? "bg-cyan-400/10" : "hover:bg-white/[0.04] hover:text-neutral-100"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  selected ? "bg-cyan-300" : statusDotClass(summary, item)
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-neutral-100">
                  {item.label || item.key}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                  {section.key}.{item.key}
                </span>
              </span>
              {busy ? <Loader2 size={12} className="animate-spin text-neutral-500" /> : null}
            </div>

            <div className="min-w-0">
              {summaryKind === "agents" && summary ? (
                <AgentSummaryLine summary={summary as AgentSummary} />
              ) : summaryKind === "risk_profiles" && summary ? (
                <RiskProfileSummaryLine summary={summary as RiskProfileSummary} />
              ) : summaryKind === "runtime_profiles" && summary ? (
                <RuntimeProfileSummaryLine summary={summary as RuntimeProfileSummary} />
              ) : (
                <GenericAliasLine item={item} />
              )}
            </div>

            <div className="flex min-w-0 items-center justify-between gap-3 md:justify-end">
              {summaryBadge(summary, item) && (
                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-neutral-400">
                  {summaryBadge(summary, item)}
                </span>
              )}
              <ChevronRight size={14} className="shrink-0 text-neutral-500" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AgentSummaryLine({ summary }: { summary: AgentSummary }) {
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1 text-[11px] text-neutral-400 lg:grid-cols-3">
        <SummaryValue label="Model" value={summary.model_provider} />
        <SummaryValue label="Safety" value={summary.risk_profile} />
        <SummaryValue label="Runtime" value={summary.runtime_profile} />
      </div>
      <SummaryPills
        items={[
          summary.channels.length ? `${summary.channels.length} channels` : "No channels",
          summary.peer_groups.length ? `${summary.peer_groups.length} groups` : "",
          bundleCount(summary) ? `${bundleCount(summary)} bundles` : "",
        ]}
      />
      {summary.missing.length > 0 && (
        <div className="truncate text-[10px] text-amber-300">
          Missing: {summary.missing.join(", ")}
        </div>
      )}
    </div>
  );
}

function RiskProfileSummaryLine({ summary }: { summary: RiskProfileSummary }) {
  const approval = summary.require_approval_for_medium_risk
    ? "medium risk asks"
    : "medium risk not set";
  const sandbox =
    summary.sandbox_enabled === null
      ? "sandbox inherits"
      : summary.sandbox_enabled
        ? `sandbox ${summary.sandbox_backend || "enabled"}`
        : "sandbox off";
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1 text-[11px] text-neutral-400 lg:grid-cols-3">
        <SummaryValue label="Level" value={summary.level} />
        <SummaryValue label="Approval" value={approval} />
        <SummaryValue label="Sandbox" value={sandbox} />
      </div>
      <SummaryPills
        items={[
          `${summary.allowed_commands.length} commands`,
          `${summary.auto_approve.length} auto`,
          `${summary.always_ask.length} ask`,
          usedByLabel(summary.used_by_agents),
        ]}
      />
    </div>
  );
}

function RuntimeProfileSummaryLine({ summary }: { summary: RuntimeProfileSummary }) {
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1 text-[11px] text-neutral-400 lg:grid-cols-3">
        <SummaryValue label="Mode" value={summary.agentic ? "agentic" : "single turn"} />
        <SummaryValue label="Iterations" value={inheritNumber(summary.max_tool_iterations)} />
        <SummaryValue label="Timeout" value={secondsLabel(summary.shell_timeout_secs)} />
      </div>
      <SummaryPills
        items={[
          `${summary.max_actions_per_hour ?? 0} actions/hr`,
          centsLabel(summary.max_cost_per_day_cents),
          summary.parallel_tools ? "parallel tools" : "",
          usedByLabel(summary.used_by_agents),
        ]}
      />
    </div>
  );
}

function GenericAliasLine({ item }: { item: PickerItem }) {
  return item.description ? (
    <p className="text-[11px] leading-relaxed text-neutral-500">{item.description}</p>
  ) : (
    <span className="text-[11px] text-neutral-500">Open details</span>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 truncate">
      <span className="text-neutral-600">{label}: </span>
      <span className="font-mono text-neutral-300">{value || "Not set"}</span>
    </span>
  );
}

function SummaryPills({ items }: { items: string[] }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visible.map((item) => (
        <span
          key={item}
          className="rounded bg-white/[0.045] px-1.5 py-0.5 text-[10px] text-neutral-500"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function DrawerHeader({
  title,
  code,
  onClose,
}: {
  title: string;
  code?: string;
  onClose: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-white/10 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-neutral-100">{title}</h2>
            {code && (
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                {code}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-400 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-100"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}

function NewAliasDrawer({
  section,
  newItemName,
  creatingItem,
  onNewItemNameChange,
  onCreateItem,
  onClose,
}: {
  section: ConfigSectionInfo;
  newItemName: string;
  creatingItem: boolean;
  onNewItemNameChange: (value: string) => void;
  onCreateItem: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DrawerHeader title={createEntryLabel(section)} code={section.key} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
        <div className="space-y-4">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              {entryNameLabel(section)}
            </span>
            <input
              type="text"
              value={newItemName}
              autoFocus
              onChange={(e) => onNewItemNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateItem();
              }}
              placeholder={entryNamePlaceholder(section)}
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </label>
          <button
            type="button"
            onClick={onCreateItem}
            disabled={!newItemName.trim() || creatingItem}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingItem ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {createButtonLabel(section)}
          </button>
        </div>
      </div>
    </div>
  );
}
