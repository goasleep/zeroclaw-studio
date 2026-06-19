import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Search, Sparkles, Trash2 } from "lucide-react";
import {
  apiConfigDeleteMapKey,
  apiConfigList,
  apiConfigSelectItem,
  type ConfigSectionInfo,
  type PickerItem,
} from "@/api/config";
import { Badge, ErrorBox, LoadingInline } from "@/ui/feedback";
import type { FormTarget, ModelConnection } from "../types";
import { errorMessage } from "../section-utils";
import {
  modelConnectionsFromEntries,
  modelProviderHint,
  recommendedModelProviders,
} from "../connection-utils";

export function ModelConnectionsPanel({
  section,
  items,
  filtered,
  filter,
  loading,
  error,
  onFilterChange,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  items: PickerItem[];
  filtered: PickerItem[];
  filter: string;
  loading: boolean;
  error: string | null;
  onFilterChange: (value: string) => void;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const [connections, setConnections] = useState<ModelConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [alias, setAlias] = useState("default");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelConnection | null>(null);
  const recommended = useMemo(() => recommendedModelProviders(items), [items]);

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    setConnectionsError(null);
    try {
      const data = await apiConfigList(section.key);
      setConnections(modelConnectionsFromEntries(data.entries, section.key, items));
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setLoadingConnections(false);
    }
  }, [items, section.key]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function openConnection(item: PickerItem, nextAlias = alias) {
    const clean = nextAlias.trim() || "default";
    const key = `${item.key}:${clean}`;
    setBusyKey(key);
    setConnectionsError(null);
    try {
      const result = await apiConfigSelectItem(section.key, item.key, clean);
      onSaved();
      await loadConnections();
      onTarget({
        prefix: result.fields_prefix,
        title: `${item.label || item.key} / ${clean}`,
        subtitle: result.created
          ? "New connection created. Add an API key, choose a default model, then save."
          : "Review this model connection, credentials, default model, and endpoint settings.",
      });
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteConnection(connection: ModelConnection) {
    const key = `${connection.providerKey}:${connection.alias}`;
    setDeletingKey(key);
    setConnectionsError(null);
    try {
      await apiConfigDeleteMapKey(`${section.key}.${connection.providerKey}`, connection.alias);
      setDeleteTarget(null);
      onSaved();
      await loadConnections();
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="h-full overflow-auto p-5 zc-scrollbar">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.035] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-100">Connect a model service</h2>
                <Badge label="guided setup" />
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-500">
                Pick a provider, keep the connection name as default, then add credentials on the
                next screen. Advanced provider settings stay available after the connection opens.
              </p>
            </div>
            <label className="block w-full min-w-0 sm:w-60">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                Connection name
              </span>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="default"
                className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
              />
            </label>
          </div>
        </section>

        {(error || connectionsError) && <ErrorBox message={error || connectionsError || ""} />}

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Saved connections</h3>
            <span className="rounded bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400">
              {loadingConnections ? "Loading..." : `${connections.length} saved`}
            </span>
          </div>

          {loadingConnections ? (
            <LoadingInline label="Loading saved model connections..." />
          ) : connections.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 bg-white/[0.025] px-4 py-5">
              <h4 className="text-sm font-medium text-neutral-100">No model connections yet</h4>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                Start with one of the recommended providers below. The connection will appear here
                after it is created.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
              {connections.map((connection) => {
                const item = items.find((candidate) => candidate.key === connection.providerKey);
                const busy = busyKey === `${connection.providerKey}:${connection.alias}`;
                const deleting = deletingKey === `${connection.providerKey}:${connection.alias}`;
                return (
                  <div
                    key={`${connection.providerKey}:${connection.alias}`}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(140px,1fr)_minmax(120px,180px)_auto] md:items-center"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-neutral-100">
                          {connection.providerLabel}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                          {connection.providerKey}
                        </span>
                      </span>
                    </span>
                    <span className="font-mono text-xs text-neutral-400">{connection.alias}</span>
                    <span className="flex items-center justify-between gap-2 md:justify-end">
                      {connection.badge && <Badge label={connection.badge} />}
                      <button
                        type="button"
                        onClick={() => {
                          if (item) void openConnection(item, connection.alias);
                        }}
                        disabled={!item || busy || deleting}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-cyan-400/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                        Manage
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(connection)}
                        disabled={busy || deleting}
                        aria-label={`Remove ${connection.providerLabel} ${connection.alias}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-500 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deleting ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Add a model connection</h3>
            <span className="text-[10px] uppercase tracking-wide text-neutral-600">
              Recommended
            </span>
          </div>

          {loading ? (
            <LoadingInline label="Loading provider types..." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recommended.map((item) => {
                const busy = busyKey === `${item.key}:${alias.trim() || "default"}`;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => void openConnection(item)}
                    disabled={busy}
                    className="group flex min-h-[132px] flex-col rounded-md border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-400/35 hover:bg-cyan-400/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                        <Sparkles size={16} />
                      </span>
                      <span className="flex items-center gap-2">
                        {item.badge && <Badge label={item.badge} />}
                        {busy ? (
                          <Loader2 size={13} className="animate-spin text-neutral-500" />
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-3 block text-sm font-semibold text-neutral-100">
                      {item.label || item.key}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">
                      {modelProviderHint(item)}
                    </span>
                    <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-medium text-cyan-300">
                      Set up connection
                      <ChevronRight size={13} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <details className="rounded-lg border border-white/10 bg-white/[0.025]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-100">
            Looking for another provider?
          </summary>
          <div className="space-y-3 border-t border-white/10 p-4">
            <label className="block max-w-xl">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                Search all providers
              </span>
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => onFilterChange(e.target.value)}
                  placeholder="Search provider name..."
                  className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-2 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
                />
              </div>
            </label>

            {!loading && filtered.length === 0 && (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
                No provider types match this search.
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="divide-y divide-white/10 overflow-hidden rounded-md border border-white/10">
                {filtered.map((item) => {
                  const busy = busyKey === `${item.key}:${alias.trim() || "default"}`;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => void openConnection(item)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-neutral-100">
                          {item.label || item.key}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                          {item.key}
                        </span>
                      </span>
                      {item.badge && <Badge label={item.badge} />}
                      {busy ? (
                        <Loader2 size={13} className="animate-spin text-neutral-500" />
                      ) : (
                        <ChevronRight size={13} className="text-neutral-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </details>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-model-connection-title"
            className="w-full max-w-md rounded-lg border border-red-500/25 bg-[#060b1a] p-5 shadow-2xl shadow-black/50"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300">
                <Trash2 size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  id="delete-model-connection-title"
                  className="text-sm font-semibold text-neutral-100"
                >
                  Remove model connection?
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                  This removes{" "}
                  <span className="font-medium text-neutral-100">
                    {deleteTarget.providerLabel} / {deleteTarget.alias}
                  </span>{" "}
                  from saved model connections. Agents using this connection may need a new model
                  connection before they can run.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingKey)}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-white/20 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteConnection(deleteTarget)}
                disabled={Boolean(deletingKey)}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingKey ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                Remove
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
