import { useCallback, useEffect, useMemo, useState } from "react";
import { Code2, Eye, Loader2, Save, Trash2 } from "lucide-react";
import {
  apiConfigCreateMapKey,
  apiConfigDeleteMapKey,
  apiConfigDeleteProp,
  apiConfigDrift,
  apiConfigList,
  apiConfigProp,
  apiConfigPutProp,
  apiConfigReloadStatus,
  apiConfigTemplates,
  apiSkillBundles,
  type ConfigListEntry,
  type ConfigTemplate,
} from "@/api/config";
import { Badge, EmptyState, ErrorBox, LoadingInline } from "@/ui/feedback";
import { parseRawConfigDraft } from "../config-value-schema";
import { errorMessage, formatRawValue, leafLabel } from "../section-utils";

export function AdvancedConfigEditor() {
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
          setDriftStatus(drift.drifted ? `${drift.drifted.length} drifted paths` : "available"),
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
      const next = entry.is_secret ? "" : formatRawValue(result.value ?? entry.value ?? "");
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
      await apiConfigPutProp(selected.path, parseRawConfigDraft(draft));
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
            String(v ?? "")
              .toLowerCase()
              .includes(q),
          ),
        )
      : entries;
  }, [entries, filter]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10">
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
        <div className="min-h-0 flex-1 overflow-y-auto p-2 zc-scrollbar">
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
                <span className="block truncate font-mono text-xs">{leafLabel(entry.path)}</span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                  {entry.path}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <main className="min-h-0 min-w-0 overflow-hidden">
        {!selected ? (
          <div className="h-full overflow-auto p-5 zc-scrollbar">
            <div className="mx-auto max-w-4xl space-y-4">
              <EmptyState
                icon={<Code2 size={28} />}
                title="Select a raw path"
                body="Advanced mode edits one property at a time through /api/config/prop."
              />
              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h3 className="mb-3 text-sm font-medium text-neutral-100">Map key tools</h3>
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
                <h2 className="truncate font-mono text-sm text-neutral-100">{selected.path}</h2>
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
            <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
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
