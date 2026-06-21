import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  ChevronRight,
  FolderOpen,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
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
  onDeleteItem,
  onCreateItem,
  onCloseDrawer,
  onSaved,
  deletingKey,
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
  onDeleteItem: (item: PickerItem) => void;
  onCreateItem: () => void;
  onCloseDrawer: () => void;
  onSaved: () => void;
  deletingKey: string | null;
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
                onDeleteItem={onDeleteItem}
                deletingKey={deletingKey}
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
              (createContent ?? (
                <NewAliasDrawer
                  section={section}
                  newItemName={newItemName}
                  creatingItem={creatingItem}
                  onNewItemNameChange={onNewItemNameChange}
                  onCreateItem={onCreateItem}
                  onClose={onCloseDrawer}
                />
              ))
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
  onDeleteItem,
  deletingKey,
}: {
  section: ConfigSectionInfo;
  items: PickerItem[];
  selectedKey: string | null;
  openingKey: string | null;
  summaryKind: SummaryKind | null;
  summaries: ConfigSummaryRows | null;
  onOpenItem: (item: PickerItem) => void;
  onDeleteItem: (item: PickerItem) => void;
  deletingKey: string | null;
}) {
  const summaryByAlias = useMemo(() => {
    const map = new Map<string, AgentSummary | RiskProfileSummary | RuntimeProfileSummary>();
    if (summaryKind && summaries) {
      for (const summary of summaries[summaryKind]) map.set(summary.alias, summary);
    }
    return map;
  }, [summaries, summaryKind]);

  if (summaryKind === "agents") {
    return (
      <AgentAliasRows
        items={items}
        selectedKey={selectedKey}
        openingKey={openingKey}
        summaries={summaryByAlias as Map<string, AgentSummary>}
        onOpenItem={onOpenItem}
        onDeleteItem={onDeleteItem}
        deletingKey={deletingKey}
      />
    );
  }

  return (
    <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
      {items.map((item) => {
        const selected = selectedKey === item.key;
        const busy = openingKey === item.key;
        const deleting = deletingKey === `${section.key}.${item.key}`;
        const summary = summaryByAlias.get(item.key);
        return (
          <div
            key={item.key}
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
              {busy || deleting ? (
                <Loader2 size={12} className="animate-spin text-neutral-500" />
              ) : null}
            </div>

            <div className="min-w-0">
              {summaryKind === "risk_profiles" && summary ? (
                <RiskProfileSummaryLine summary={summary as RiskProfileSummary} />
              ) : summaryKind === "runtime_profiles" && summary ? (
                <RuntimeProfileSummaryLine summary={summary as RuntimeProfileSummary} />
              ) : (
                <GenericAliasLine item={item} />
              )}
            </div>

            <div className="flex min-w-0 items-center justify-between gap-2 md:justify-end">
              {summaryBadge(summary, item) && (
                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-neutral-400">
                  {summaryBadge(summary, item)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenItem(item)}
                disabled={busy || deleting}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-400 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Open ${item.label || item.key}`}
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDeleteItem(item)}
                disabled={busy || deleting}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-500 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Delete ${item.label || item.key}`}
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentAliasRows({
  items,
  selectedKey,
  openingKey,
  summaries,
  onOpenItem,
  onDeleteItem,
  deletingKey,
}: {
  items: PickerItem[];
  selectedKey: string | null;
  openingKey: string | null;
  summaries: Map<string, AgentSummary>;
  onOpenItem: (item: PickerItem) => void;
  onDeleteItem: (item: PickerItem) => void;
  deletingKey: string | null;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const summary = summaries.get(item.key);
        const selected = selectedKey === item.key;
        const busy = openingKey === item.key;
        const deleting = deletingKey === `agents.${item.key}`;
        return (
          <section
            key={item.key}
            className={`min-w-0 rounded-lg border p-4 transition ${
              selected
                ? "border-cyan-400/35 bg-cyan-400/[0.06]"
                : "border-white/10 bg-white/[0.025] hover:border-white/15"
            }`}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                  <Bot size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-neutral-100">
                    {item.label || item.key}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                    agents.{item.key}
                  </span>
                </span>
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                  summary?.enabled
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-white/[0.06] text-neutral-500"
                }`}
              >
                {summary?.enabled ? "enabled" : "disabled"}
              </span>
            </div>

            <div className="mt-4 grid gap-2 text-[11px] text-neutral-400">
              <SummaryValue label="Model" value={summary?.model_provider ?? ""} />
              <SummaryValue label="Risk" value={summary?.risk_profile ?? ""} />
              <SummaryValue label="Runtime" value={summary?.runtime_profile ?? ""} />
              <SummaryValue
                label="Memory"
                value={
                  summary
                    ? `${summary.knowledge_bundles.length} knowledge / ${summary.mcp_bundles.length} MCP`
                    : ""
                }
              />
            </div>

            <SummaryPills
              items={[
                summary?.channels.length ? `${summary.channels.length} channels` : "No channels",
                summary?.skill_bundles.length ? `${summary.skill_bundles.length} skills` : "",
                summary?.peer_groups.length ? `${summary.peer_groups.length} groups` : "",
              ]}
            />

            {summary?.missing.length ? (
              <div className="mt-2 truncate text-[10px] text-amber-300">
                Missing: {summary.missing.join(", ")}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-4 gap-2">
              <AgentActionButton
                icon={MessageSquare}
                label="Chat"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("zeroclaw://select-agent", { detail: item.key }),
                  )
                }
              />
              <AgentActionButton
                icon={Settings}
                label="Config"
                busy={busy}
                onClick={() => onOpenItem(item)}
              />
              <AgentActionButton
                icon={Trash2}
                label="Delete"
                tone="danger"
                busy={deleting}
                onClick={() => onDeleteItem(item)}
              />
              <AgentActionButton
                icon={FolderOpen}
                label="Workspace"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("zeroclaw://open-agent-workspace", { detail: item.key }),
                  )
                }
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AgentActionButton({
  icon: Icon,
  label,
  busy,
  tone = "default",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  busy?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "danger"
          ? "border-white/10 text-neutral-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
          : "border-white/10 text-neutral-300 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-200"
      }`}
      title={label}
    >
      {busy ? <Loader2 size={12} className="shrink-0 animate-spin" /> : <Icon size={12} />}
      <span className="min-w-0 truncate">{label}</span>
    </button>
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
