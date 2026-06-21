import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Code2, Loader2, RotateCcw, Save, Wrench } from "lucide-react";
import { apiConfigList, type ConfigListEntry } from "@/api/config";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/switch";
import { EmptyState, ErrorBox, Badge, LoadingInline } from "@/ui/feedback";
import { defaultDraft } from "../config-value-schema";
import { useConfigDrafts } from "../config-drafts";
import { SetupDoctorTab } from "../SetupDoctorTab";
import { setupTargetsForPrefix } from "../setup-targets";
import type { FormTarget } from "../types";
import { TaskBadge } from "../sections/section-status";
import {
  entryHasValue,
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
  const configDrafts = useConfigDrafts();
  const {
    getDraftsForPrefix,
    registerForm,
    savePrefix,
    stageField,
    resetField,
    unresetField,
    isFieldReset,
    validationErrors: globalValidationErrors,
    resetVersion,
    savedVersion,
    saving: globalSaving,
  } = configDrafts;
  const lastSavedVersionRef = useRef(savedVersion);
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
  const getDraftsForPrefixRef = useRef(getDraftsForPrefix);
  const registerFormRef = useRef(registerForm);
  const seedRef = useRef(seed);

  useEffect(() => {
    getDraftsForPrefixRef.current = getDraftsForPrefix;
  }, [getDraftsForPrefix]);

  useEffect(() => {
    registerFormRef.current = registerForm;
  }, [registerForm]);

  useEffect(() => {
    seedRef.current = seed;
  }, [seed]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiConfigList(target.prefix);
      const nextSeed: Record<string, string> = {};
      for (const entry of data.entries) nextSeed[entry.path] = defaultDraft(entry);
      setEntries(data.entries);
      setSeed(nextSeed);
      setDraft(getDraftsForPrefixRef.current(target.prefix, nextSeed));
      registerFormRef.current(target.prefix, target.title, data.entries, nextSeed);
      setValidationErrors({});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [target.prefix, target.title]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyEntries = entries.filter(
    (entry) => draft[entry.path] !== seed[entry.path] || isFieldReset(entry.path),
  );
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
      const ok = await savePrefix(target.prefix);
      if (!ok) {
        return;
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

  useEffect(() => {
    setDraft(seedRef.current);
    setValidationErrors({});
  }, [resetVersion]);

  useEffect(() => {
    if (lastSavedVersionRef.current === savedVersion) return;
    lastSavedVersionRef.current = savedVersion;
    void load();
  }, [savedVersion, load]);

  function updateField(entry: ConfigListEntry, value: string) {
    setDraft((current) => ({
      ...current,
      [entry.path]: value,
    }));
    stageField(target.prefix, target.title, entry, seed[entry.path] ?? "", value);
  }

  function resetEntry(entry: ConfigListEntry) {
    if (isFieldReset(entry.path)) {
      unresetField(entry.path);
      setDraft((current) => ({
        ...current,
        [entry.path]: seed[entry.path] ?? "",
      }));
      return;
    }
    resetField(target.prefix, target.title, entry);
    setDraft((current) => ({
      ...current,
      [entry.path]: "",
    }));
  }

  const combinedValidationErrors = {
    ...globalValidationErrors,
    ...validationErrors,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <ConfigBreadcrumbs target={target} />
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
              disabled={dirtyEntries.length === 0 || saving || globalSaving}
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
                        reset={isFieldReset(entry.path)}
                        error={combinedValidationErrors[entry.path]}
                        onChange={(value) => updateField(entry, value)}
                        onReset={() => resetEntry(entry)}
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

const CONFIG_ROOTS = [
  { key: "providers.models", label: "Model providers" },
  { key: "agents", label: "Agents" },
  { key: "peer_groups", label: "Peer groups" },
  { key: "risk_profiles", label: "Risk profiles" },
  { key: "runtime_profiles", label: "Runtime profiles" },
  { key: "channels", label: "Channels" },
  { key: "tools", label: "Tools" },
  { key: "skills", label: "Skills" },
  { key: "skill_bundles", label: "Skill bundles" },
  { key: "mcp", label: "MCP" },
];

function ConfigBreadcrumbs({ target }: { target: FormTarget }) {
  const crumbs = configBreadcrumbs(target);
  if (crumbs.length <= 1) return null;
  return (
    <nav
      aria-label="Config breadcrumb"
      className="mb-2 flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-neutral-500"
    >
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="inline-flex min-w-0 items-center gap-1">
          {index > 0 && <ChevronRight size={11} className="shrink-0 text-neutral-700" />}
          {crumb.target && index < crumbs.length - 1 ? (
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("zeroclaw://open-config-target", { detail: crumb.target }),
                )
              }
              className="min-w-0 truncate rounded px-1 py-0.5 hover:bg-white/[0.05] hover:text-cyan-300"
            >
              {crumb.label}
            </button>
          ) : (
            <span className="min-w-0 truncate px-1 py-0.5 text-neutral-300">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function configBreadcrumbs(target: FormTarget) {
  const root = CONFIG_ROOTS.filter(
    (candidate) => target.prefix === candidate.key || target.prefix.startsWith(`${candidate.key}.`),
  ).sort((a, b) => b.key.length - a.key.length)[0];
  if (!root) {
    return [
      { label: "Config", target: "gateway-overview" },
      { label: target.title || target.prefix },
    ];
  }
  const tail =
    target.prefix === root.key ? [] : target.prefix.slice(root.key.length + 1).split(".");
  return [
    { label: "Config", target: root.key },
    { label: root.label, target: root.key },
    ...tail.map((part, index) => ({
      label: index === tail.length - 1 ? target.title || part : part,
      target:
        index < tail.length - 1 ? `${root.key}.${tail.slice(0, index + 1).join(".")}` : undefined,
    })),
  ];
}

function FieldRow({
  entry,
  value,
  dirty,
  reset,
  error,
  onChange,
  onReset,
}: {
  entry: ConfigListEntry;
  value: string;
  dirty: boolean;
  reset: boolean;
  error?: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const label = leafLabel(entry.path);
  const dependency = dependencyAction(entry, value);
  const resetDisabled = !reset && !entry.populated && !dirty;
  return (
    <div className="grid gap-3 px-4 py-3 text-xs lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-neutral-200">{label}</span>
          {reset ? <Badge label="reset" /> : dirty && <Badge label="edited" />}
          {fieldBadges(entry).map((badge) => (
            <Badge key={badge} label={badge} />
          ))}
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
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <FieldInput
              entry={entry}
              value={reset ? "" : value}
              disabled={reset}
              onChange={onChange}
            />
          </div>
          <button
            type="button"
            onClick={onReset}
            disabled={resetDisabled}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
              reset
                ? "border-amber-300/25 text-amber-200 hover:bg-amber-300/10"
                : "border-white/10 text-neutral-400 hover:border-cyan-400/50 hover:text-cyan-300"
            }`}
            title={reset ? "Undo reset" : "Reset field"}
          >
            <RotateCcw size={12} />
            {reset ? "Undo" : "Reset"}
          </button>
        </div>
        {reset && (
          <p className="mt-1 text-[11px] text-amber-200">This field will be unset when you save.</p>
        )}
        {!reset && entry.is_secret && entry.populated && value.length === 0 && (
          <p className="mt-1 text-[11px] text-neutral-500">
            Secret is already set. Type a new value only when you want to replace it.
          </p>
        )}
        {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
        {dependency && <MissingDependencyHint action={dependency} />}
      </div>
    </div>
  );
}

function FieldInput({
  entry,
  value,
  disabled,
  onChange,
}: {
  entry: ConfigListEntry;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  if (entry.kind === "bool") {
    return (
      <Switch
        checked={value === "true"}
        onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        label={value === "true" ? "true" : "false"}
        disabled={disabled}
      />
    );
  }

  if (entry.kind === "enum" && entry.enum_variants?.length) {
    return (
      <Select
        value={value || "__unset__"}
        onValueChange={(next) => onChange(next === "__unset__" ? "" : next)}
        disabled={disabled}
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
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-cyan-400"
      />
    );
  }

  if (entry.kind === "string-array" || entry.kind === "object-array") {
    return (
      <textarea
        value={value}
        disabled={disabled}
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
        disabled={disabled}
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
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100 outline-none focus:border-cyan-400"
    />
  ) : (
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-cyan-400"
    />
  );
}

function fieldBadges(entry: ConfigListEntry) {
  const badges: string[] = [];
  if (entry.is_secret) badges.push("Secret");
  badges.push(fieldImportance(entry));
  return badges;
}

function fieldImportance(entry: ConfigListEntry) {
  const leaf = entry.path.split(".").pop() ?? "";
  if (
    [
      "enabled",
      "model",
      "api_key",
      "model_provider",
      "risk_profile",
      "runtime_profile",
      "approval_mode",
    ].includes(leaf)
  ) {
    return "Required";
  }
  if (
    [
      "allowed_commands",
      "sandbox_mode",
      "agentic",
      "max_iterations",
      "timeout_secs",
      "max_cost_usd",
      "max_tool_iterations",
      "shell_timeout_secs",
      "max_actions_per_hour",
      "parallel_tools",
    ].includes(leaf)
  ) {
    return "Advanced";
  }
  return "Optional";
}

function dependencyAction(entry: ConfigListEntry, value: string) {
  const leaf = entry.path.split(".").pop() ?? "";
  if (entryHasValue(entry) || valueHasContent(value, entry)) return null;
  if (leaf === "model_provider") {
    return { label: "Create model provider", target: "providers.models" };
  }
  if (leaf === "risk_profile") {
    return { label: "Create risk profile", target: "risk_profiles" };
  }
  if (leaf === "runtime_profile") {
    return { label: "Create runtime profile", target: "runtime_profiles" };
  }
  if (leaf === "channels") {
    return { label: "Configure channels", target: "channels" };
  }
  return null;
}

function valueHasContent(value: string, entry: ConfigListEntry) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "<unset>") return false;
  if ((entry.kind === "string-array" || entry.kind === "object-array") && trimmed === "[]") {
    return false;
  }
  return true;
}

function MissingDependencyHint({ action }: { action: { label: string; target: string } }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-300/20 bg-amber-300/[0.06] px-2 py-1.5 text-[11px] text-amber-100">
      <span className="text-amber-200">Dependency not configured.</span>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("zeroclaw://open-config-target", { detail: action.target }),
          )
        }
        className="rounded border border-amber-300/25 px-1.5 py-0.5 text-amber-100 hover:border-amber-300/50 hover:bg-amber-300/10"
      >
        {action.label}
      </button>
    </div>
  );
}
