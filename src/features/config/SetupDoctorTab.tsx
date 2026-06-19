import { useCallback, useEffect, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Terminal,
} from "lucide-react";
import { apiConfigProp, apiConfigPutProp } from "@/api/config";
import {
  setupGetStatus,
  setupRunAction,
  type SetupAction,
  type SetupCapabilityId,
  type SetupConfigRecommendation,
  type SetupConfigValue,
  type SetupOverallStatus,
  type SetupStatus,
} from "@/api/tauri";
import { CAPABILITY_LABELS, setupTargetsForPrefix, type SetupTarget } from "./setup-targets";

interface SetupDoctorTabProps {
  prefix: string;
  title: string;
  preferredCapabilityId?: SetupCapabilityId;
  onConfigSaved: () => void;
}

export function SetupDoctorTab({
  prefix,
  title,
  preferredCapabilityId,
  onConfigSaved,
}: SetupDoctorTabProps) {
  const { t } = useLingui();
  const baseTargets = useMemo(() => setupTargetsForPrefix(prefix), [prefix]);
  const [targets, setTargets] = useState(baseTargets);
  const [activeKey, setActiveKey] = useState(
    preferredTarget(baseTargets, preferredCapabilityId)?.key ?? baseTargets[0]?.key ?? "",
  );

  useEffect(() => {
    let cancelled = false;
    setTargets(baseTargets);
    setActiveKey(
      preferredTarget(baseTargets, preferredCapabilityId)?.key ?? baseTargets[0]?.key ?? "",
    );

    const mcpTarget = baseTargets.find((t) => t.context.capability_id === "mcp_stdio");
    if (!mcpTarget) return;

    const serverPrefix = mcpTarget.context.config_prefix;
    void Promise.all([
      readConfigString(`${serverPrefix}.transport`),
      readConfigString(`${serverPrefix}.command`),
    ]).then(([transport, command]) => {
      if (cancelled) return;
      setTargets((current) =>
        current.map((target) =>
          target.key === mcpTarget.key
            ? {
                ...target,
                context: {
                  ...target.context,
                  mcp_transport: transport || "stdio",
                  mcp_command: command,
                },
              }
            : target,
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [baseTargets, preferredCapabilityId]);

  const active = targets.find((target) => target.key === activeKey) ?? targets[0];

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <div className="mx-auto mb-3 flex justify-center text-neutral-600">
            <Settings2 size={28} />
          </div>
          <h2 className="text-sm font-medium text-neutral-200">{t`No setup doctor`}</h2>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
            {t`This config prefix does not map to a local setup capability.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/10 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
            {prefix}
          </span>
        </div>
        {targets.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {targets.map((target) => (
              <button
                key={target.key}
                type="button"
                onClick={() => setActiveKey(target.key)}
                className={`rounded-md border px-2.5 py-1 text-[11px] ${
                  active.key === target.key
                    ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                    : "border-white/10 text-neutral-400 hover:border-white/15 hover:text-neutral-100"
                }`}
              >
                {target.label}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
        <div className="mx-auto max-w-4xl">
          {isTauriRuntime() ? (
            <DesktopSetupPanel target={active} onConfigSaved={onConfigSaved} />
          ) : (
            <ManualSetupPanel capabilityId={active.context.capability_id} />
          )}
        </div>
      </div>
    </div>
  );
}

function DesktopSetupPanel({
  target,
  onConfigSaved,
}: {
  target: SetupTarget;
  onConfigSaved: () => void;
}) {
  const { t } = useLingui();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (clearMessage = true) => {
      setLoading(true);
      setError(null);
      if (clearMessage) setMessage(null);
      try {
        setStatus(await setupGetStatus(target.context));
      } catch (e) {
        setError(formatError(e));
      } finally {
        setLoading(false);
      }
    },
    [target.context],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: SetupAction) {
    const command = formatCommand(action.command);
    if (!window.confirm(t`Run this command?\n\n${command}`)) return;
    setRunning(action.id);
    setError(null);
    setMessage(null);
    try {
      const result = await setupRunAction({
        action_id: action.id,
        context: target.context,
      });
      setMessage(
        result.success
          ? t`Command completed: ${command}`
          : t`Command exited ${result.exit_code ?? "without code"}: ${
              result.stderr || result.stdout || command
            }`,
      );
      await load(false);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setRunning(null);
    }
  }

  async function applyRecommendation(rec: SetupConfigRecommendation) {
    setApplying(rec.id);
    setError(null);
    setMessage(null);
    try {
      const value = await recommendationValue(rec);
      await apiConfigPutProp(rec.path, value);
      setMessage(t`Applied ${rec.path}`);
      onConfigSaved();
      await load(false);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setApplying(null);
    }
  }

  if (loading && !status) {
    return <LoadingInline label={t`Running local setup checks...`} />;
  }

  if (error && !status) {
    return <ErrorBox message={error} />;
  }

  if (!status) return null;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
        <div className="flex flex-wrap items-start gap-3">
          <StatusIcon overall={status.overall} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-neutral-100">{status.title}</h3>
              <OverallBadge value={status.overall} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">{status.summary}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300 disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t`Refresh`}
          </button>
        </div>
      </section>

      {error && <ErrorBox message={error} />}
      {message && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          {message}
        </div>
      )}

      <section className="rounded-lg border border-white/10 bg-white/[0.035]">
        <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
          {t`Checks`}
        </h3>
        <div className="divide-y divide-white/10">
          {status.checks.map((check) => (
            <div
              key={check.id}
              className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[180px_minmax(0,1fr)]"
            >
              <div className="flex items-center gap-2">
                <CheckBadge status={check.status} />
                <span className="font-medium text-neutral-200">{check.label}</span>
              </div>
              <p className="min-w-0 break-words font-mono text-[11px] leading-relaxed text-neutral-500">
                {check.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {status.actions.length > 0 && (
        <section className="rounded-lg border border-white/10 bg-white/[0.035]">
          <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
            {t`Actions`}
          </h3>
          <div className="divide-y divide-white/10">
            {status.actions.map((action) => (
              <div key={action.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-neutral-200">{action.label}</div>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                      {action.description}
                    </p>
                    <CommandLine command={action.command} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void runAction(action)}
                    disabled={running !== null}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                  >
                    {running === action.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Play size={12} />
                    )}
                    {t`Run`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {status.config_recommendations.length > 0 && (
        <section className="rounded-lg border border-white/10 bg-white/[0.035]">
          <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
            {t`Recommended config`}
          </h3>
          <div className="divide-y divide-white/10">
            {status.config_recommendations.map((rec) => (
              <div key={rec.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-neutral-200">{rec.label}</div>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                      {rec.description}
                    </p>
                    <div className="mt-2 rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-[11px] text-neutral-400">
                      {rec.path} = {formatConfigValue(rec.value)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void applyRecommendation(rec)}
                    disabled={applying !== null}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300 disabled:opacity-50"
                  >
                    {applying === rec.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Settings2 size={12} />
                    )}
                    {t`Apply`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {status.remediations.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/10">
          <h3 className="border-b border-amber-500/20 px-4 py-3 text-sm font-medium text-amber-200">
            {t`Manual remediation`}
          </h3>
          <div className="divide-y divide-amber-500/20">
            {status.remediations.map((item) => (
              <div key={item.title} className="px-4 py-3 text-xs">
                <div className="font-medium text-amber-100">{item.title}</div>
                <p className="mt-1 leading-relaxed text-amber-100/80">{item.body}</p>
                {item.commands.map((command, index) => (
                  <CommandLine key={`${item.title}-${index}`} command={command} />
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ManualSetupPanel({ capabilityId }: { capabilityId: SetupCapabilityId }) {
  const { t } = useLingui();
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start gap-3">
        <Info size={16} className="mt-0.5 shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-neutral-100">
            {t`${CAPABILITY_LABELS[capabilityId]} setup`}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            {t`Local checks, one-click actions, and remediation commands are provided by the desktop backend. Open this tab in ZeroClaw Workspace to view the current backend-provided setup status for this capability.`}
          </p>
        </div>
      </div>
    </section>
  );
}

async function recommendationValue(rec: SetupConfigRecommendation): Promise<unknown> {
  const next = configValueToJs(rec.value);
  if (rec.merge !== "append_unique_string_array") return next;

  const current = await apiConfigProp(rec.path).catch(() => ({ value: [] }));
  const existing = Array.isArray(current.value)
    ? current.value.filter((v): v is string => typeof v === "string")
    : [];
  const additions = Array.isArray(next)
    ? next.filter((v): v is string => typeof v === "string")
    : [];
  return Array.from(new Set([...existing, ...additions]));
}

function configValueToJs(value: SetupConfigValue): unknown {
  return value.value;
}

function formatConfigValue(value: SetupConfigValue) {
  return JSON.stringify(configValueToJs(value));
}

async function readConfigString(path: string) {
  try {
    const result = await apiConfigProp(path);
    return typeof result.value === "string" ? result.value : "";
  } catch {
    return "";
  }
}

function preferredTarget(targets: SetupTarget[], capabilityId: SetupCapabilityId | undefined) {
  return capabilityId
    ? targets.find((target) => target.context.capability_id === capabilityId)
    : undefined;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function StatusIcon({ overall }: { overall: SetupOverallStatus }) {
  if (overall === "ready") {
    return <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" />;
  }
  if (overall === "manual") {
    return <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-300" />;
  }
  return <Info size={18} className="mt-0.5 shrink-0 text-sky-300" />;
}

function OverallBadge({ value }: { value: SetupOverallStatus }) {
  const label = value.replace("_", " ");
  const cls =
    value === "ready"
      ? "bg-emerald-500/10 text-emerald-300"
      : value === "manual"
        ? "bg-amber-500/10 text-amber-300"
        : "bg-sky-500/10 text-sky-300";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cls}`}>{label}</span>;
}

function CheckBadge({ status }: { status: string }) {
  const cls =
    status === "pass"
      ? "bg-emerald-500/10 text-emerald-300"
      : status === "fail"
        ? "bg-red-500/10 text-red-300"
        : status === "warn"
          ? "bg-amber-500/10 text-amber-300"
          : "bg-white/[0.08] text-neutral-400";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cls}`}>{status}</span>;
}

function CommandLine({ command }: { command: string[] }) {
  return (
    <div className="mt-2 flex min-w-0 items-start gap-2 rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-[11px] text-neutral-400">
      <Terminal size={12} className="mt-0.5 shrink-0 text-neutral-600" />
      <span className="min-w-0 break-words">{formatCommand(command)}</span>
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

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
      <CircleAlert size={14} className="mt-0.5 shrink-0" />
      <pre className="whitespace-pre-wrap font-mono">{message}</pre>
    </div>
  );
}

function formatCommand(command: string[]) {
  return command.map(shellDisplayToken).join(" ");
}

function shellDisplayToken(token: string) {
  return /^[A-Za-z0-9_./:@-]+$/.test(token) ? token : JSON.stringify(token);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
