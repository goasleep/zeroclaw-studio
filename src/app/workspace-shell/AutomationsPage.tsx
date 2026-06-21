import { Clock3, Loader2, Play, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { apiCron, apiCronDelete, apiCronPatch, apiCronRun, type CronJob } from "@/api/tools";
import { formatCronDateTime, formatCronSchedule } from "@/features/cron/format";
import { useConnections } from "@/app/connection-context";

export function AutomationsPage({
  onRuntime,
  onCountChange,
  createControl,
}: {
  onRuntime: () => void;
  onCountChange?: (count: number) => void;
  createControl?: (onCreated: () => Promise<void>) => ReactNode;
}) {
  const { t } = useLingui();
  const { active } = useConnections();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeId = active?.id ?? null;

  const refresh = useCallback(async () => {
    if (!active) {
      setJobs([]);
      onCountChange?.(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiCron();
      setJobs(data.jobs);
      onCountChange?.(data.jobs.filter((job) => job.enabled !== false).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [active, onCountChange]);

  useEffect(() => {
    void refresh();
  }, [activeId, refresh]);

  async function toggle(job: CronJob) {
    const agent = job.agent_alias?.trim();
    if (!agent) {
      setError("Automation is missing agent_alias; cannot update it safely.");
      return;
    }
    setBusyId(job.id);
    try {
      await apiCronPatch(job.id, {
        agent,
        enabled: job.enabled === false,
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function run(job: CronJob) {
    setBusyId(job.id);
    try {
      await apiCronRun(job.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(job: CronJob) {
    if (!window.confirm(t`Delete automation "${job.name ?? job.id}"?`)) return;
    setBusyId(job.id);
    try {
      await apiCronDelete(job.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="h-full min-h-0 overflow-auto bg-[#020818]/70 p-5 zc-scrollbar">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-neutral-100">{t`Automations`}</h1>
            <p className="mt-1 text-xs text-neutral-500">
              {t`Automations are scheduled agent jobs on this runtime.`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {createControl?.(refresh)}
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              {t`Refresh`}
            </button>
          </div>
        </header>

        {!active && (
          <EmptyAutomation
            onRuntime={onRuntime}
            title={t`No active connection`}
            body={t`Choose a runtime before inspecting scheduled work.`}
          />
        )}
        {active && loading && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 size={13} className="animate-spin" />
            {t`Loading automations...`}
          </div>
        )}
        {active && error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </div>
        )}
        {active && !loading && !error && jobs.length === 0 && (
          <EmptyAutomation
            onRuntime={onRuntime}
            createControl={createControl?.(refresh)}
            title={t`No automations yet`}
            body={t`Create an automation to run repeated agent work on this runtime.`}
          />
        )}
        {active && jobs.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-2">
            {jobs.map((job) => (
              <article
                key={job.id}
                className="rounded-lg border border-white/10 bg-white/[0.035] p-4"
              >
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                    <Clock3 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-neutral-100">
                      {job.name ?? job.id}
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {formatCronSchedule(job.schedule)}
                    </p>
                  </div>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${
                      job.enabled === false
                        ? "border-neutral-500/30 bg-white/[0.04] text-neutral-400"
                        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    }`}
                  >
                    {job.enabled === false ? t`Paused` : t`Enabled`}
                  </span>
                </div>
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <Info label={t`Agent`} value={job.agent_alias ?? t`Unknown`} />
                  <Info label={t`Next run`} value={formatCronDateTime(job.next_run)} />
                  <Info label={t`Last run`} value={formatCronDateTime(job.last_run)} />
                  <Info label={t`Last status`} value={job.last_status ?? t`Unknown`} />
                </dl>
                {job.prompt && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-neutral-500">
                    {job.prompt}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === job.id}
                    onClick={() => void run(job)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                  >
                    <Play size={13} />
                    {t`Run now`}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === job.id}
                    onClick={() => void toggle(job)}
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50"
                  >
                    {job.enabled === false ? t`Resume` : t`Pause`}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === job.id}
                    onClick={() => void remove(job)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 px-3 py-1.5 text-xs text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    {t`Delete`}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyAutomation({
  title,
  body,
  onRuntime,
  createControl,
}: {
  title: string;
  body: string;
  onRuntime: () => void;
  createControl?: ReactNode;
}) {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
      <div>
        <Clock3 size={28} className="mx-auto mb-3 text-neutral-600" />
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">{body}</p>
        <div className="mt-4 flex justify-center gap-2">
          {createControl}
          <button
            type="button"
            onClick={onRuntime}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
          >
            Runtime settings
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="truncate text-neutral-200">{value}</dd>
    </div>
  );
}
