import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import {
  apiConfigDeleteMapKey,
  apiConfigList,
  apiConfigSelectItem,
  type ConfigSectionInfo,
  type PickerItem,
} from "@/api/config";
import { ErrorBox } from "@/ui/feedback";
import type { FormTarget } from "../types";
import { ResourceDeleteDialog } from "../ResourceDeleteDialog";
import { type ConfigResourceRef, resourceRefFromSectionItem } from "../config-resource";
import { aliasesFromEntries, errorMessage } from "../section-utils";

export function TypedAliasPanel({
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
  const [deletingAlias, setDeletingAlias] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConfigResourceRef | null>(null);
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
    const clean = nextAlias.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, item.key, clean);
      onSaved();
      onTarget({
        prefix: result.fields_prefix,
        title: `${item.label} / ${clean}`,
        subtitle: result.created ? "Created new alias" : item.description,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAlias(ref: ConfigResourceRef) {
    setDeletingAlias(ref.deleteKey);
    setError(null);
    try {
      await apiConfigDeleteMapKey(ref.deleteParentPath, ref.deleteKey);
      setAliases((current) => current.filter((name) => name !== ref.deleteKey));
      setAlias((current) => (current === ref.deleteKey ? "default" : current));
      setDeleteTarget(null);
      onSaved();
      await loadAliases();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeletingAlias(null);
    }
  }

  function requestDeleteAlias(name: string) {
    const ref = resourceRefFromSectionItem(section, item, { alias: name });
    if (ref) setDeleteTarget(ref);
  }

  return (
    <div className="h-full overflow-auto p-5 zc-scrollbar">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-neutral-100">{item.label}</h2>
            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
              {item.key}
            </span>
          </div>
          {(loading || busy) && <Loader2 size={13} className="animate-spin text-neutral-500" />}
        </div>
        {item.description && (
          <p className="text-xs leading-relaxed text-neutral-500">{item.description}</p>
        )}

        <section className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[minmax(180px,260px)_minmax(180px,1fr)_auto] md:items-end">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              Existing aliases
            </span>
            <select
              value=""
              onChange={(e) => void openAlias(e.target.value)}
              disabled={loading || busy || aliases.length === 0}
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-2 font-mono text-xs text-neutral-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{aliases.length ? "Select alias" : "No aliases"}</option>
              {aliases.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              Provider alias
            </span>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void openAlias(alias || "default");
              }}
              placeholder="default"
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-2 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </label>

          <button
            type="button"
            onClick={() => void openAlias(alias || "default")}
            disabled={busy}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Open alias
          </button>
        </section>
        {aliases.length > 0 && (
          <section className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
            {aliases.map((name) => {
              const deleting = deletingAlias === name;
              return (
                <div
                  key={name}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(180px,1fr)_auto] md:items-center"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-neutral-100">
                      {name}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                      {prefix}.{name}
                    </span>
                  </span>
                  <span className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void openAlias(name)}
                      disabled={busy || deleting}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-cyan-400/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronRight size={13} />
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDeleteAlias(name)}
                      disabled={busy || deleting}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-500 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete ${name}`}
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
          </section>
        )}
        {error && <ErrorBox message={error} />}
      </div>
      {deleteTarget && (
        <ResourceDeleteDialog
          resource={deleteTarget}
          busy={deletingAlias === deleteTarget.deleteKey}
          onCancel={() => setDeleteTarget(null)}
          onDelete={() => void deleteAlias(deleteTarget)}
        />
      )}
    </div>
  );
}
