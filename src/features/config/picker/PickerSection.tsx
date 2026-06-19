import { useCallback, useEffect, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Loader2, Plus, Search } from "lucide-react";
import {
  apiConfigPicker,
  apiConfigSelectItem,
  type ConfigSectionInfo,
  type PickerItem,
} from "@/api/config";
import { EmptyState, ErrorBox, LoadingInline } from "@/ui/feedback";
import { AgentSetupWizard } from "@/features/chat/AgentSetupWizard";
import type { FormTarget } from "../types";
import { OneTierAliasManager } from "../alias/OneTierAliasManager";
import { ModelConnectionsPanel } from "./ModelConnectionsPanel";
import { ChannelConnectionsPanel } from "./ChannelConnectionsPanel";
import { TypedAliasPanel } from "./TypedAliasPanel";
import {
  choiceCountLabel,
  createButtonLabel,
  createEntryLabel,
  entryNamePlaceholder,
  entryNoun,
  errorMessage,
  pickerSelectionLabel,
  pickerSelectionOption,
} from "../section-utils";

export function PickerSection({
  section,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const { t } = useLingui();
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState<PickerItem | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [inlineTarget, setInlineTarget] = useState<FormTarget | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const typed =
    section.shape === "typed_family_map" || section.shape === undefined || section.shape === null;
  const oneTier = section.shape === "one_tier_alias_map";

  const openOneTierItem = useCallback(
    async (item: PickerItem) => {
      setOpeningKey(item.key);
      setShowCreateItem(false);
      setError(null);
      try {
        const result = await apiConfigSelectItem(section.key, item.key);
        setSelectedItem(item);
        setInlineTarget({
          prefix: result.fields_prefix,
          title: item.label || item.key,
          subtitle: result.created ? t`Created new ${entryNoun(section)}` : undefined,
        });
      } catch (e) {
        setSelectedItem(null);
        setInlineTarget(null);
        setError(errorMessage(e));
      } finally {
        setOpeningKey(null);
      }
    },
    [section, t],
  );

  const openBackendItem = useCallback(
    async (item: PickerItem) => {
      setError(null);
      try {
        const result = await apiConfigSelectItem(section.key, item.key);
        onSaved();
        onTarget({
          prefix: result.fields_prefix,
          title: item.label || item.key,
          subtitle: result.created ? t`Created ${entryNoun(section)} from picker` : undefined,
        });
      } catch (e) {
        setSelectedItem(null);
        setError(errorMessage(e));
      }
    },
    [onSaved, onTarget, section, t],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFilter("");
    setNewItemName("");
    setShowCreateItem(false);
    setOpeningKey(null);
    setInlineTarget(null);
    setSelectedItem(null);
    void apiConfigPicker(section.key)
      .then((resp) => {
        if (cancelled) return;
        setItems(resp.items);
        setSelectedItem(typed ? (resp.items[0] ?? null) : null);
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
  }, [typed, section.key, reloadKey]);

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
  const selectableItems = useMemo(() => {
    if (!selectedItem || filtered.some((item) => item.key === selectedItem.key)) return filtered;
    return [selectedItem, ...filtered];
  }, [filtered, selectedItem]);

  if (section.key === "providers.models" && typed) {
    return (
      <ModelConnectionsPanel
        section={section}
        items={items}
        filtered={filtered}
        filter={filter}
        loading={loading}
        error={error}
        onFilterChange={setFilter}
        onTarget={onTarget}
        onSaved={onSaved}
      />
    );
  }

  if (section.key === "channels" && typed) {
    return (
      <ChannelConnectionsPanel
        section={section}
        items={items}
        filtered={filtered}
        filter={filter}
        loading={loading}
        error={error}
        onFilterChange={setFilter}
        onTarget={onTarget}
        onSaved={onSaved}
      />
    );
  }

  async function createOneTierItem() {
    const clean = newItemName.trim();
    if (!clean) return;
    setCreatingItem(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, clean);
      const nextItem: PickerItem = { key: clean, label: clean, badge: "configured" };
      setItems((current) =>
        current.some((item) => item.key === clean)
          ? current.map((item) => (item.key === clean ? { ...item, badge: "configured" } : item))
          : [...current, nextItem],
      );
      setSelectedItem(nextItem);
      setInlineTarget({
        prefix: result.fields_prefix,
        title: clean,
        subtitle: result.created ? t`Created new ${entryNoun(section)}` : section.help,
      });
      setNewItemName("");
      setShowCreateItem(false);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreatingItem(false);
    }
  }

  if (oneTier) {
    return (
      <OneTierAliasManager
        section={section}
        items={items}
        filtered={filtered}
        filter={filter}
        selectedItem={selectedItem}
        newItemName={newItemName}
        loading={loading}
        creatingItem={creatingItem}
        showCreateItem={showCreateItem || items.length === 0}
        openingKey={openingKey}
        error={error}
        inlineTarget={inlineTarget}
        onFilterChange={setFilter}
        onNewItemNameChange={setNewItemName}
        onStartCreate={() => {
          setInlineTarget(null);
          setSelectedItem(null);
          setShowCreateItem(true);
        }}
        onOpenItem={(item) => void openOneTierItem(item)}
        onCreateItem={() => void createOneTierItem()}
        onCloseDrawer={() => {
          setShowCreateItem(false);
          setInlineTarget(null);
        }}
        onSaved={onSaved}
        createContent={
          section.key === "agents" ? (
            <AgentSetupWizard
              surface="config"
              onCancel={() => {
                setShowCreateItem(false);
                setInlineTarget(null);
              }}
              onAgentCreated={() => {
                onSaved();
                setReloadKey((key) => key + 1);
              }}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-neutral-100">{section.label}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-neutral-500">
            {loading ? <Loader2 size={12} className="animate-spin" /> : null}
            <span>{choiceCountLabel(section, items.length)}</span>
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(220px,360px)_minmax(180px,1fr)]">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              {pickerSelectionLabel(section)}
            </span>
            <select
              value={selectedItem?.key ?? ""}
              onChange={(e) => {
                const next = items.find((item) => item.key === e.target.value) ?? null;
                setSelectedItem(next);
                if (oneTier && next) void openOneTierItem(next);
                if (!oneTier && !typed && next) void openBackendItem(next);
              }}
              disabled={loading || selectableItems.length === 0}
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-2 font-mono text-xs text-neutral-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t`Select ${pickerSelectionOption(section)}`}</option>
              {selectableItems.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.badge ? `${item.label} (${item.badge})` : item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              {t`Filter`}
            </span>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t`Filter ${pickerSelectionOption(section)}s...`}
                className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-2 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
              />
            </div>
          </label>
        </div>

        {oneTier && (
          <div className="mt-3 grid gap-2 rounded-md border border-dashed border-white/10 bg-white/[0.025] p-2 sm:grid-cols-[auto_minmax(160px,1fr)_auto] sm:items-center">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
              <Plus size={12} className="text-cyan-300" />
              {createEntryLabel(section)}
            </div>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createOneTierItem();
              }}
              placeholder={entryNamePlaceholder(section)}
              className="min-w-0 rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
            <button
              type="button"
              onClick={() => void createOneTierItem()}
              disabled={!newItemName.trim() || creatingItem}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-sky-400 px-2.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingItem ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {createButtonLabel(section)}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="mt-3 rounded-md border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
            {t`No ${pickerSelectionOption(section)}s match this filter.`}
          </div>
        )}
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {selectedItem ? (
          oneTier ? (
            <LoadingInline label={t`Opening ${entryNoun(section)}...`} />
          ) : typed ? (
            <TypedAliasPanel
              section={section}
              item={selectedItem}
              onTarget={onTarget}
              onSaved={onSaved}
            />
          ) : (
            <LoadingInline label={t`Opening fields...`} />
          )
        ) : oneTier ? (
          <EmptyState
            icon={<Plus size={28} />}
            title={t`Create or select ${entryNoun(section)}`}
            body={t`Add a ${entryNoun(section)} or open an existing one.`}
          />
        ) : (
          <EmptyState
            icon={<Plus size={28} />}
            title={t`Pick a choice`}
            body={t`Choose an option above to create, choose, or inspect its config fields.`}
          />
        )}
      </div>
    </div>
  );
}
