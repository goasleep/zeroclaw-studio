import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, Loader2, RefreshCw, RotateCcw, Save, X } from "lucide-react";
import {
  apiAdminReload,
  apiConfigDrift,
  apiConfigPatch,
  apiConfigReloadStatus,
  apiGatewayHealth,
  type ConfigListEntry,
  type PatchOp,
} from "@/api/config";
import { configDraftError, parseConfigDraft } from "./config-value-schema";
import { dottedToPointer, errorMessage } from "./section-utils";

export const CONFIG_SAVED_EVENT = "zeroclaw://config-saved";

interface StagedField {
  prefix: string;
  title: string;
  entry: ConfigListEntry;
  seed: string;
  draft: string;
}

interface StagedRemoval {
  prefix: string;
  title: string;
  path: string;
  label: string;
}

interface ConfigStatus {
  pendingReload: boolean;
  reloadLabel: string | null;
  driftCount: number;
}

interface ConfigDraftContextValue {
  dirtyCount: number;
  dirtySections: string[];
  validationErrors: Record<string, string>;
  status: ConfigStatus;
  saving: boolean;
  reloading: boolean;
  message: string | null;
  error: string | null;
  resetVersion: number;
  savedVersion: number;
  getDraftsForPrefix: (prefix: string, seed: Record<string, string>) => Record<string, string>;
  registerForm: (
    prefix: string,
    title: string,
    entries: ConfigListEntry[],
    seed: Record<string, string>,
  ) => void;
  stageField: (
    prefix: string,
    title: string,
    entry: ConfigListEntry,
    seed: string,
    draft: string,
  ) => void;
  saveAll: () => Promise<void>;
  savePrefix: (prefix: string) => Promise<boolean>;
  discardAll: () => void;
  stageRemoval: (prefix: string, title: string, path: string, label: string) => void;
  unstageRemoval: (path: string) => void;
  isRemovalStaged: (path: string) => boolean;
  refreshStatus: () => Promise<void>;
  reloadDaemon: () => Promise<void>;
}

const ConfigDraftContext = createContext<ConfigDraftContextValue | null>(null);

const emptyStatus: ConfigStatus = {
  pendingReload: false,
  reloadLabel: null,
  driftCount: 0,
};

export function ConfigDraftProvider({ children }: { children: ReactNode }) {
  const [fields, setFields] = useState<Record<string, StagedField>>({});
  const [removals, setRemovals] = useState<Record<string, StagedRemoval>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ConfigStatus>(emptyStatus);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const [savedVersion, setSavedVersion] = useState(0);

  const dirtyFields = useMemo(() => Object.values(fields), [fields]);
  const dirtyRemovals = useMemo(() => Object.values(removals), [removals]);
  const dirtySections = useMemo(
    () =>
      Array.from(
        new Set([
          ...dirtyFields.map((field) => field.title),
          ...dirtyRemovals.map((removal) => removal.title),
        ]),
      ).sort(),
    [dirtyFields, dirtyRemovals],
  );

  const getDraftsForPrefix = useCallback(
    (prefix: string, seed: Record<string, string>) => {
      const next = { ...seed };
      for (const field of dirtyFields) {
        if (field.prefix === prefix) next[field.entry.path] = field.draft;
      }
      return next;
    },
    [dirtyFields],
  );

  const registerForm = useCallback(
    (prefix: string, title: string, entries: ConfigListEntry[], seed: Record<string, string>) => {
      const paths = new Set(entries.map((entry) => entry.path));
      const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
      setFields((current) => {
        const next: Record<string, StagedField> = {};
        let changed = false;
        for (const [path, staged] of Object.entries(current)) {
          if (staged.prefix !== prefix) {
            next[path] = staged;
            continue;
          }
          if (!paths.has(path)) {
            changed = true;
            continue;
          }
          const nextSeed = seed[path] ?? "";
          if (staged.draft === nextSeed) {
            changed = true;
            continue;
          }
          const nextEntry = entryByPath.get(path) ?? staged.entry;
          if (staged.title === title && staged.entry === nextEntry && staged.seed === nextSeed) {
            next[path] = staged;
            continue;
          }
          changed = true;
          next[path] = { ...staged, title, entry: nextEntry, seed: nextSeed };
        }
        return changed ? next : current;
      });
    },
    [],
  );

  const stageField = useCallback(
    (prefix: string, title: string, entry: ConfigListEntry, seed: string, draft: string) => {
      setMessage(null);
      setError(null);
      setValidationErrors((current) => {
        if (!current[entry.path]) return current;
        const { [entry.path]: _removed, ...next } = current;
        return next;
      });
      setFields((current) => {
        const next = { ...current };
        if (draft === seed) {
          delete next[entry.path];
        } else {
          next[entry.path] = { prefix, title, entry, seed, draft };
        }
        return next;
      });
    },
    [],
  );

  const stageRemoval = useCallback((prefix: string, title: string, path: string, label: string) => {
    setMessage(null);
    setError(null);
    setFields((current) => {
      const next: Record<string, StagedField> = {};
      const childPrefix = `${path}.`;
      for (const [fieldPath, staged] of Object.entries(current)) {
        if (fieldPath === path || fieldPath.startsWith(childPrefix)) continue;
        next[fieldPath] = staged;
      }
      return next;
    });
    setRemovals((current) => ({
      ...current,
      [path]: { prefix, title, path, label },
    }));
  }, []);

  const unstageRemoval = useCallback((path: string) => {
    setRemovals((current) => {
      if (!current[path]) return current;
      const { [path]: _removed, ...next } = current;
      return next;
    });
  }, []);

  const isRemovalStaged = useCallback((path: string) => Boolean(removals[path]), [removals]);

  const refreshStatus = useCallback(async () => {
    const [reload, drift] = await Promise.all([
      apiConfigReloadStatus().catch(() => null),
      apiConfigDrift().catch(() => null),
    ]);
    const pendingReload = Boolean(reload?.pending_reload ?? reload?.pendingReload ?? false);
    const reloadLabel =
      typeof reload?.status === "string"
        ? reload.status
        : pendingReload
          ? "pending"
          : reload
            ? "available"
            : null;
    const drifted = Array.isArray(drift?.drifted) ? drift.drifted : [];
    setStatus({
      pendingReload,
      reloadLabel,
      driftCount: drifted.length,
    });
  }, []);

  const saveSelected = useCallback(
    async (selected: StagedField[], selectedRemovals: StagedRemoval[]) => {
      const changeCount = selected.length + selectedRemovals.length;
      if (changeCount === 0) return true;
      setSaving(true);
      setError(null);
      setMessage(null);
      const errors: Record<string, string> = {};
      const ops: PatchOp[] = [];
      for (const removal of selectedRemovals) {
        ops.push({ op: "remove", path: dottedToPointer(removal.path) });
      }
      for (const field of selected) {
        try {
          ops.push({
            op: field.entry.populated || field.entry.is_secret ? "replace" : "add",
            path: dottedToPointer(field.entry.path),
            value: parseConfigDraft(field.entry, field.draft).value,
          });
        } catch (e) {
          errors[field.entry.path] = configDraftError(e) ?? errorMessage(e);
        }
      }
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        setSaving(false);
        return false;
      }
      try {
        await apiConfigPatch(ops);
        const savedPaths = new Set(selected.map((field) => field.entry.path));
        const savedRemovalPaths = new Set(selectedRemovals.map((removal) => removal.path));
        setFields((current) => {
          const next = { ...current };
          for (const path of savedPaths) delete next[path];
          return next;
        });
        setRemovals((current) => {
          const next = { ...current };
          for (const path of savedRemovalPaths) delete next[path];
          return next;
        });
        setValidationErrors({});
        setMessage(`Saved ${changeCount} change${changeCount === 1 ? "" : "s"}.`);
        setSavedVersion((version) => version + 1);
        window.dispatchEvent(new Event(CONFIG_SAVED_EVENT));
        await refreshStatus();
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [refreshStatus],
  );

  const saveAll = useCallback(async () => {
    await saveSelected(Object.values(fields), Object.values(removals));
  }, [fields, removals, saveSelected]);

  const savePrefix = useCallback(
    async (prefix: string) => {
      return saveSelected(
        Object.values(fields).filter((field) => field.prefix === prefix),
        Object.values(removals).filter((removal) => removal.prefix === prefix),
      );
    },
    [fields, removals, saveSelected],
  );

  const discardAll = useCallback(() => {
    setFields({});
    setRemovals({});
    setValidationErrors({});
    setMessage("Discarded staged config changes.");
    setError(null);
    setResetVersion((version) => version + 1);
  }, []);

  const reloadDaemon = useCallback(async () => {
    setReloading(true);
    setError(null);
    setMessage(null);
    try {
      await apiAdminReload();
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        try {
          await apiGatewayHealth();
          setMessage("Daemon reloaded.");
          await refreshStatus();
          return;
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
      }
      setError("Daemon reload was requested, but the gateway did not respond within 30 seconds.");
    } catch (e) {
      setError(`Reload request failed: ${errorMessage(e)}`);
    } finally {
      setReloading(false);
    }
  }, [refreshStatus]);

  const value = useMemo<ConfigDraftContextValue>(
    () => ({
      dirtyCount: dirtyFields.length + dirtyRemovals.length,
      dirtySections,
      validationErrors,
      status,
      saving,
      reloading,
      message,
      error,
      resetVersion,
      savedVersion,
      getDraftsForPrefix,
      registerForm,
      stageField,
      saveAll,
      savePrefix,
      discardAll,
      stageRemoval,
      unstageRemoval,
      isRemovalStaged,
      refreshStatus,
      reloadDaemon,
    }),
    [
      dirtyFields.length,
      dirtyRemovals.length,
      dirtySections,
      validationErrors,
      status,
      saving,
      reloading,
      message,
      error,
      resetVersion,
      savedVersion,
      getDraftsForPrefix,
      registerForm,
      stageField,
      saveAll,
      savePrefix,
      discardAll,
      stageRemoval,
      unstageRemoval,
      isRemovalStaged,
      refreshStatus,
      reloadDaemon,
    ],
  );

  return <ConfigDraftContext.Provider value={value}>{children}</ConfigDraftContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfigDrafts() {
  const value = useContext(ConfigDraftContext);
  if (!value) {
    throw new Error("useConfigDrafts must be used inside ConfigDraftProvider");
  }
  return value;
}

export function ConfigDraftStatusBar() {
  const drafts = useConfigDrafts();
  const { refreshStatus } = drafts;
  const [confirmReload, setConfirmReload] = useState(false);
  const showUnsaved = drafts.dirtyCount > 0;
  const showReload = drafts.status.pendingReload || drafts.status.driftCount > 0;
  const showMessage = Boolean(drafts.message || drafts.error);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  if (!showUnsaved && !showReload && !showMessage) return null;

  return (
    <>
      <div className="shrink-0 border-b border-white/10 bg-[#061127] px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          {showUnsaved ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
              <AlertTriangle size={14} className="shrink-0 text-amber-300" />
              <span className="font-medium text-neutral-100">
                {drafts.dirtyCount} unsaved {drafts.dirtyCount === 1 ? "change" : "changes"}
              </span>
              {drafts.dirtySections.length > 0 && (
                <span className="min-w-0 truncate text-neutral-500">
                  in {drafts.dirtySections.join(", ")}
                </span>
              )}
            </div>
          ) : showReload ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
              <RefreshCw size={14} className="shrink-0 text-amber-300" />
              <span className="font-medium text-neutral-100">
                {drafts.status.pendingReload
                  ? "Config saved. Reload daemon to apply."
                  : `${drafts.status.driftCount} drifted config ${
                      drafts.status.driftCount === 1 ? "path" : "paths"
                    }`}
              </span>
              {drafts.status.reloadLabel && (
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                  reload {drafts.status.reloadLabel}
                </span>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
              {drafts.error ? (
                <AlertTriangle size={14} className="shrink-0 text-red-300" />
              ) : (
                <Check size={14} className="shrink-0 text-emerald-300" />
              )}
              <span className={drafts.error ? "text-red-200" : "text-neutral-300"}>
                {drafts.error ?? drafts.message}
              </span>
            </div>
          )}

          {showUnsaved && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => drafts.discardAll()}
                disabled={drafts.saving}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-white/20 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={12} />
                Discard all
              </button>
              <button
                type="button"
                onClick={() => void drafts.saveAll()}
                disabled={drafts.saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-2.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {drafts.saving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                Save all
              </button>
            </div>
          )}

          {showReload && !showUnsaved && (
            <button
              type="button"
              onClick={() => setConfirmReload(true)}
              disabled={drafts.reloading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-xs text-amber-100 hover:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {drafts.reloading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RotateCcw size={12} />
              )}
              Reload daemon
            </button>
          )}
        </div>
      </div>
      {confirmReload && (
        <ReloadConfirmDialog
          busy={drafts.reloading}
          onCancel={() => setConfirmReload(false)}
          onReload={() => {
            setConfirmReload(false);
            void drafts.reloadDaemon();
          }}
        />
      )}
    </>
  );
}

function ReloadConfirmDialog({
  busy,
  onCancel,
  onReload,
}: {
  busy: boolean;
  onCancel: () => void;
  onReload: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reload-daemon-title"
        className="w-full max-w-lg rounded-lg border border-amber-300/25 bg-[#060b1a] p-5 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-300/30 bg-amber-300/10 text-amber-200">
            <RotateCcw size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="reload-daemon-title" className="text-sm font-semibold text-neutral-100">
              Reload daemon?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              The daemon keeps running, but gateway listeners, channels, MCP servers, scheduler, and
              provider clients re-initialize from the saved config. In-flight requests may fail
              briefly while the gateway comes back.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-white/20 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-300 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Reload
          </button>
        </div>
      </section>
    </div>
  );
}
