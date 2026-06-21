import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Pause, Play, RefreshCw, Trash2, X } from "lucide-react";
import { DataPanel } from "@/features/_shared/DataPanel";
import {
  apiCron,
  apiCronDelete,
  apiCronPatch,
  apiCronRun,
  apiCronRuns,
  type CronJob,
  type CronRun,
} from "@/api/tools";
import { queryKeys } from "@/api/query";
import { useLingui } from "@lingui/react/macro";
import { useConnections } from "@/app/connection-context";
import { Dialog } from "@/ui/dialog";
import { Tooltip } from "@/ui/tooltip";
import { formatCronDateTime, formatCronRunDuration, formatCronSchedule } from "./format";

export function RuntimeAutomationsPanel() {
  const { t, i18n } = useLingui();
  const { active } = useConnections();
  const queryClient = useQueryClient();
  const cronQueryKey = queryKeys.gateway.cron(active?.id ?? null);
  const [deleteTarget, setDeleteTarget] = useState<CronJob | null>(null);
  const [runsTarget, setRunsTarget] = useState<CronJob | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshAutomations = () => queryClient.invalidateQueries({ queryKey: cronQueryKey });

  const toggleMutation = useMutation({
    mutationFn: async ({ job, enabled }: { job: CronJob; enabled: boolean }) => {
      const agent = job.agent_alias?.trim();
      if (!agent) throw new Error("Automation is missing agent_alias; cannot update it safely.");
      const updated = await apiCronPatch(job.id, { agent, enabled });
      if (updated.enabled !== enabled) {
        throw new Error("Gateway did not apply the requested enabled state.");
      }
      return updated;
    },
    onMutate: () => {
      setActionError(null);
      setNotice(null);
    },
    onSuccess: (_job, variables) => {
      setNotice(variables.enabled ? t`Automation resumed.` : t`Automation paused.`);
      void refreshAutomations();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (job: CronJob) => apiCronDelete(job.id),
    onMutate: () => {
      setActionError(null);
      setNotice(null);
    },
    onSuccess: (_result, job) => {
      setNotice(t`Automation deleted.`);
      setDeleteTarget(null);
      if (runsTarget?.id === job.id) setRunsTarget(null);
      void refreshAutomations();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const runMutation = useMutation({
    mutationFn: (job: CronJob) => apiCronRun(job.id),
    onMutate: () => {
      setActionError(null);
      setNotice(null);
    },
    onSuccess: (result, job) => {
      setNotice(t`Manual run finished: ${result.status}`);
      void refreshAutomations();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.gateway.cronRuns(active?.id ?? null, job.id),
      });
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const busy = toggleMutation.isPending || deleteMutation.isPending || runMutation.isPending;

  return (
    <>
      <DataPanel
        what={t`automations`}
        queryKey={cronQueryKey}
        load={apiCron}
        render={(data) => (
          <div className="space-y-3">
            {actionError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {actionError}
              </div>
            )}
            {notice && (
              <div className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
                {notice}
              </div>
            )}
            <table className="w-full min-w-[980px] table-fixed text-xs">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="w-[16%] py-1 pr-2">{t`Name`}</th>
                  <th className="w-[10%] py-1 pr-2">{t`Status`}</th>
                  <th className="w-[16%] py-1 pr-2">{t`Schedule`}</th>
                  <th className="w-[17%] py-1 pr-2">{t`Next run`}</th>
                  <th className="py-1 pr-2">{t`Prompt`}</th>
                  <th className="w-[132px] py-1 text-right">{t`Actions`}</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.id} className="border-t border-white/10 align-top">
                    <td className="py-2 pr-2 font-mono text-cyan-300">
                      <span className="block truncate">{String(job.name ?? job.id)}</span>
                      {job.agent_alias && (
                        <span className="mt-0.5 block truncate text-[10px] text-neutral-600">
                          {job.agent_alias}
                        </span>
                      )}
                      <span className="mt-0.5 block truncate text-[10px] text-neutral-600">
                        {t`ZeroClaw cron id`}: {job.id}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <AutomationStatusBadge job={job} />
                    </td>
                    <td className="py-2 pr-2 font-mono text-neutral-400">
                      <span className="block truncate">{formatCronSchedule(job.schedule)}</span>
                      <details className="mt-1 text-[10px] text-neutral-600">
                        <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">
                          {t`Raw ZeroClaw schedule`}
                        </summary>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/20 p-2 zc-scrollbar">
                          {formatRawSchedule(job.schedule)}
                        </pre>
                      </details>
                    </td>
                    <td className="py-2 pr-2 font-mono text-neutral-400">
                      {job.enabled === false
                        ? t`Paused`
                        : formatCronDateTime(job.next_run, i18n.locale)}
                    </td>
                    <td className="py-2 pr-2 text-neutral-300">
                      <span className="line-clamp-2">{String(job.prompt ?? "")}</span>
                    </td>
                    <td className="py-1.5">
                      <div className="flex justify-end gap-1">
                        <IconButton
                          label={job.enabled === false ? t`Resume` : t`Pause`}
                          disabled={busy}
                          onClick={() =>
                            toggleMutation.mutate({
                              job,
                              enabled: job.enabled === false,
                            })
                          }
                        >
                          {job.enabled === false ? <Play size={13} /> : <Pause size={13} />}
                        </IconButton>
                        <IconButton
                          label={t`Run now`}
                          disabled={busy}
                          onClick={() => runMutation.mutate(job)}
                        >
                          {runMutation.isPending ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Play size={13} />
                          )}
                        </IconButton>
                        <IconButton
                          label={t`Run history`}
                          disabled={busy}
                          onClick={() => setRunsTarget(job)}
                        >
                          <History size={13} />
                        </IconButton>
                        <IconButton
                          label={t`Delete automation`}
                          disabled={busy}
                          tone="danger"
                          onClick={() => setDeleteTarget(job)}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      />
      <DeleteAutomationDialog
        job={deleteTarget}
        busy={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onDelete={(job) => deleteMutation.mutate(job)}
      />
      <AutomationRunsDialog
        job={runsTarget}
        connectionId={active?.id ?? null}
        locale={i18n.locale}
        onOpenChange={(open) => {
          if (!open) setRunsTarget(null);
        }}
      />
    </>
  );
}

function AutomationStatusBadge({ job }: { job: CronJob }) {
  const { t } = useLingui();
  const label = job.enabled === false ? t`Paused` : String(job.last_status ?? t`Active`);
  const className =
    job.enabled === false
      ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
      : job.last_status === "error"
        ? "border-red-400/30 bg-red-400/10 text-red-200"
        : job.last_status === "degraded"
          ? "border-orange-300/30 bg-orange-300/10 text-orange-200"
          : "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${className}`}>
      {label}
    </span>
  );
}

function IconButton({
  label,
  disabled,
  tone = "default",
  children,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  children: React.ReactNode;
  onClick: () => void;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-200 hover:border-red-300/60 hover:bg-red-400/10"
      : "text-neutral-300 hover:border-cyan-400/60 hover:bg-cyan-400/10";
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] ${toneClass} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function DeleteAutomationDialog({
  job,
  busy,
  onCancel,
  onDelete,
}: {
  job: CronJob | null;
  busy: boolean;
  onCancel: () => void;
  onDelete: (job: CronJob) => void;
}) {
  const { t } = useLingui();
  return (
    <Dialog
      open={Boolean(job)}
      title={t`Delete automation`}
      onOpenChange={(open) => !open && onCancel()}
    >
      <section className="rounded-lg border border-red-400/25 bg-[#060b1a] p-5 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-300/30 bg-red-300/10 text-red-200">
            <Trash2 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-neutral-100">{t`Delete automation?`}</h3>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              {t`This removes the scheduled automation from the gateway. Recent run history may no longer be reachable from this page.`}
            </p>
            {job && (
              <p className="mt-3 truncate font-mono text-xs text-cyan-300">
                {String(job.name ?? job.id)}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-white/20 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            onClick={() => job && onDelete(job)}
            disabled={busy || !job}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-300 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {t`Delete`}
          </button>
        </div>
      </section>
    </Dialog>
  );
}

function AutomationRunsDialog({
  job,
  connectionId,
  locale,
  onOpenChange,
}: {
  job: CronJob | null;
  connectionId: string | null;
  locale?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const runsQuery = useQuery({
    queryKey: queryKeys.gateway.cronRuns(connectionId, job?.id ?? null),
    queryFn: () => (job ? apiCronRuns(job.id, 20) : Promise.resolve({ runs: [] })),
    enabled: Boolean(job),
  });
  const runs = runsQuery.data?.runs ?? [];
  return (
    <Dialog
      open={Boolean(job)}
      title={t`Automation run history`}
      className="max-w-5xl"
      onOpenChange={onOpenChange}
    >
      <section className="rounded-lg border border-white/10 bg-[#060b1a] shadow-2xl shadow-black/50">
        <header className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
            <History size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-neutral-100">{t`Automation run history`}</h3>
            <p className="mt-1 truncate font-mono text-xs text-cyan-300">
              {job ? String(job.name ?? job.id) : ""}
            </p>
            {job && (
              <p className="mt-1 truncate font-mono text-[10px] text-neutral-600">
                {t`ZeroClaw cron id`}: {job.id}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void runsQuery.refetch()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:border-cyan-400/60 hover:bg-cyan-400/10"
            aria-label={t`Refresh`}
          >
            {runsQuery.isFetching ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:border-white/30 hover:bg-white/10"
            aria-label={t`Close`}
          >
            <X size={13} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-auto p-4 zc-scrollbar">
          {runsQuery.isError ? (
            <p className="text-xs text-red-300">{errorMessage(runsQuery.error)}</p>
          ) : runsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Loader2 size={13} className="animate-spin" />
              {t`Loading run history...`}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-xs text-neutral-500">{t`No runs recorded yet.`}</p>
          ) : (
            <table className="w-full min-w-[780px] table-fixed text-xs">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="w-[180px] py-1 pr-2">{t`Started`}</th>
                  <th className="w-[90px] py-1 pr-2">{t`Status`}</th>
                  <th className="w-[90px] py-1 pr-2">{t`Duration`}</th>
                  <th className="py-1">{t`Output`}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <CronRunRow key={run.id} run={run} locale={locale} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </Dialog>
  );
}

function CronRunRow({ run, locale }: { run: CronRun; locale?: string }) {
  return (
    <tr className="border-t border-white/10 align-top">
      <td className="py-2 pr-2 font-mono text-neutral-400">
        {formatCronDateTime(run.started_at, locale)}
      </td>
      <td className="py-2 pr-2 font-mono text-neutral-300">{run.status}</td>
      <td className="py-2 pr-2 font-mono text-neutral-500">
        {formatCronRunDuration(run.duration_ms)}
      </td>
      <td className="py-2 text-neutral-300">
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded border border-white/10 bg-black/20 p-2 font-mono text-[11px] leading-relaxed zc-scrollbar">
          {run.output ?? ""}
        </pre>
      </td>
    </tr>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatRawSchedule(schedule: unknown) {
  if (typeof schedule === "string") return schedule;
  if (schedule == null) return "";
  try {
    return JSON.stringify(schedule, null, 2);
  } catch {
    return String(schedule);
  }
}
