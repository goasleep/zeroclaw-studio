import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Code2, Loader2, Save, Wrench } from "lucide-react";
import { apiConfigList, apiConfigPatch, type ConfigListEntry, type PatchOp } from "@/api/config";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/switch";
import { EmptyState, ErrorBox, Badge, LoadingInline } from "@/ui/feedback";
import { configDraftError, defaultDraft, parseConfigDraft } from "../config-value-schema";
import { SetupDoctorTab } from "../SetupDoctorTab";
import { setupTargetsForPrefix } from "../setup-targets";
import type { FormTarget } from "../types";
import { TaskBadge } from "../sections/section-status";
import {
  dottedToPointer,
  errorMessage,
  formTasksForPrefix,
  groupFields,
  leafLabel,
} from "../section-utils";

export function ConfigFieldForm({
  target,
  onBack,
  backLabel = "Back",
  onSaved,
}: {
  target: FormTarget;
  onBack?: () => void;
  backLabel?: string;
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
  const [activeTab, setActiveTab] = useState<"fields" | "setup">(
    target.initialTab === "setup" ? "setup" : "fields",
  );

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
  const setupTargets = useMemo(() => setupTargetsForPrefix(target.prefix), [target.prefix]);

  useEffect(() => {
    setActiveTab(target.initialTab === "setup" ? "setup" : "fields");
  }, [target.prefix, target.initialTab]);

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
                  {backLabel}
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
        <SetupDoctorTab prefix={target.prefix} title={target.title} onConfigSaved={onSaved} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
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
              <ConfigTaskSummary prefix={target.prefix} entries={entries} />
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
      )}
    </div>
  );
}

function ConfigTaskSummary({ prefix, entries }: { prefix: string; entries: ConfigListEntry[] }) {
  const tasks = formTasksForPrefix(prefix, entries);
  if (tasks.length === 0) return null;

  return (
    <section className="grid gap-2 md:grid-cols-3">
      {tasks.map((task) => (
        <div
          key={task.label}
          className="rounded-md border border-white/10 bg-white/[0.025] px-3 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-neutral-100">{task.label}</span>
            <TaskBadge state={task.state} />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{task.detail}</p>
        </div>
      ))}
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
