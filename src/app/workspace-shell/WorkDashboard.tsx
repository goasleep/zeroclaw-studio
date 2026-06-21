import { Activity, AlertTriangle, Clock3, Gauge, Inbox, ListTodo } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { apiCron, apiDoctor, apiStatus, type CronJob } from "@/api/tools";
import { apiLogs, type LogEvent } from "@/api/logs";
import { useConnections } from "@/app/connection-context";
import { useWorkspace } from "@/app/workspace-context";
import type { StudioTask } from "@/features/tasks/task-model";
import { taskActivityTime, taskStatusClass, taskStatusLabel } from "@/features/tasks/task-model";

interface WorkDashboardProps {
  tasks: StudioTask[];
  loading: boolean;
  error: string | null;
  approvalCount: number;
  renderCreateControl: () => ReactNode;
  onTask: (task: StudioTask) => void;
  onPage: (page: "approvals" | "automations" | "runtime" | "tasks") => void;
}

export function WorkDashboard({
  tasks,
  loading,
  error,
  approvalCount,
  renderCreateControl,
  onTask,
  onPage,
}: WorkDashboardProps) {
  const { t } = useLingui();
  const { active, health, activation } = useConnections();
  const { root } = useWorkspace();
  const activeId = active?.id ?? null;
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [logErrors, setLogErrors] = useState<LogEvent[]>([]);
  const [doctorIssues, setDoctorIssues] = useState(0);
  const [gatewayVersion, setGatewayVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId) {
      setCronJobs([]);
      setLogErrors([]);
      setDoctorIssues(0);
      setGatewayVersion(null);
      return;
    }
    let cancelled = false;
    void Promise.allSettled([apiCron(), apiLogs(), apiDoctor(), apiStatus()]).then((results) => {
      if (cancelled) return;
      const [cron, logs, doctor, status] = results;
      if (cron.status === "fulfilled") setCronJobs(cron.value.jobs);
      if (logs.status === "fulfilled") {
        setLogErrors(
          logs.value.events.filter((event) => /error|warn/i.test(event.severity_text)).slice(0, 5),
        );
      }
      if (doctor.status === "fulfilled") {
        setDoctorIssues(doctor.value.results.filter((item) => item.severity !== "ok").length);
      }
      if (status.status === "fulfilled") setGatewayVersion(status.value.version);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const visibleTasks = useMemo(() => tasks.filter((task) => task.status !== "archived"), [tasks]);
  const running = visibleTasks.filter(
    (task) => task.status === "running" || task.status === "needs_approval",
  );
  const failed = visibleTasks.filter((task) => task.status === "failed");
  const recent = [...visibleTasks]
    .sort((a, b) => taskActivityTime(b).localeCompare(taskActivityTime(a)))
    .slice(0, 6);
  const activeCron = cronJobs.filter((job) => job.enabled !== false);

  if (!active) {
    return (
      <DashboardShell title={t`Work Dashboard`}>
        <EmptyState
          icon={Gauge}
          title={t`No active connection`}
          body={t`Choose or create a ZeroClaw runtime before starting task work.`}
          action={
            <button
              type="button"
              onClick={() => onPage("runtime")}
              className="rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
            >
              {t`Open runtime settings`}
            </button>
          }
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={t`Work Dashboard`}>
      <section className="grid gap-3 lg:grid-cols-4">
        <MetricCard
          icon={Gauge}
          label={t`Runtime`}
          value={health ? (health.healthy ? t`online` : t`offline`) : (activation?.type ?? t`idle`)}
          detail={gatewayVersion ? t`Gateway ${gatewayVersion}` : active.name}
          onClick={() => onPage("runtime")}
        />
        <MetricCard
          icon={ListTodo}
          label={t`Running tasks`}
          value={String(running.length)}
          detail={root ?? t`No workspace selected`}
          onClick={() => onPage("tasks")}
        />
        <MetricCard
          icon={Inbox}
          label={t`Approvals`}
          value={String(approvalCount)}
          detail={approvalCount > 0 ? t`Needs attention` : t`Nothing waiting`}
          onClick={() => onPage("approvals")}
        />
        <MetricCard
          icon={Clock3}
          label={t`Automations`}
          value={String(activeCron.length)}
          detail={cronJobs.length > 0 ? t`${cronJobs.length} automations` : t`No schedules`}
          onClick={() => onPage("automations")}
        />
      </section>

      <div className="mt-5 grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035]">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">{t`Recent tasks`}</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                {t`Task shells are stored locally; execution stays in ZeroClaw runtime runs.`}
              </p>
            </div>
            {renderCreateControl()}
          </header>
          <div className="divide-y divide-white/10">
            {loading && <RowMuted>{t`Loading tasks...`}</RowMuted>}
            {error && <RowMuted tone="error">{error}</RowMuted>}
            {!loading && !error && recent.length === 0 && (
              <div className="p-6">
                <EmptyState
                  icon={ListTodo}
                  title={t`No tasks yet`}
                  body={t`Create a task to wrap the next runtime run in a product workflow.`}
                  action={renderCreateControl()}
                />
              </div>
            )}
            {recent.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onTask(task)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                  <Activity size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-100">
                    {task.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-500">
                    {task.workspace_root ?? t`No workspace selected`}
                  </span>
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${taskStatusClass(
                    task.status,
                  )}`}
                >
                  {taskStatusLabel(task.status)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <SummaryPanel title={t`Needs attention`} icon={AlertTriangle}>
            {approvalCount === 0 && failed.length === 0 && logErrors.length === 0 ? (
              <p className="text-xs text-neutral-500">{t`No approvals, failed tasks, or recent log errors.`}</p>
            ) : (
              <div className="space-y-2">
                {approvalCount > 0 && (
                  <AttentionButton onClick={() => onPage("approvals")}>
                    {t`${approvalCount} approvals waiting`}
                  </AttentionButton>
                )}
                {failed.slice(0, 3).map((task) => (
                  <AttentionButton key={task.id} onClick={() => onTask(task)}>
                    {task.title}
                  </AttentionButton>
                ))}
                {logErrors.slice(0, 3).map((event) => (
                  <div
                    key={`${event["@timestamp"]}-${event.message}`}
                    className="text-xs text-red-200"
                  >
                    <span className="font-mono text-red-300">{event.severity_text}</span>{" "}
                    {event.message}
                  </div>
                ))}
              </div>
            )}
          </SummaryPanel>

          <SummaryPanel title={t`Runtime health`} icon={Gauge}>
            <dl className="grid gap-2 text-xs">
              <Info label={t`Connection`} value={active.name} />
              <Info
                label={t`Health`}
                value={
                  health
                    ? health.healthy
                      ? t`online`
                      : t`offline`
                    : (activation?.type ?? t`unknown`)
                }
              />
              <Info label={t`Doctor issues`} value={String(doctorIssues)} />
              <Info label={t`Workspace`} value={root ?? t`No workspace selected`} mono />
            </dl>
          </SummaryPanel>
        </section>
      </div>
    </DashboardShell>
  );
}

function DashboardShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="h-full min-h-0 overflow-auto bg-[#020818]/70 p-5 zc-scrollbar">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-4 text-lg font-semibold text-neutral-100">{title}</h1>
        {children}
      </div>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-left hover:border-cyan-400/30 hover:bg-white/[0.055]"
    >
      <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
        <Icon size={14} className="text-cyan-300" />
        {label}
      </div>
      <div className="truncate text-xl font-semibold text-neutral-100">{value}</div>
      <div className="mt-1 truncate text-xs text-neutral-500">{detail}</div>
    </button>
  );
}

function SummaryPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Gauge;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-100">
        <Icon size={14} className="text-cyan-300" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Gauge;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
        <Icon size={18} />
      </div>
      <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

function RowMuted({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <div className={`px-4 py-3 text-xs ${tone === "error" ? "text-red-300" : "text-neutral-500"}`}>
      {children}
    </div>
  );
}

function AttentionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full truncate rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-left text-xs text-amber-100 hover:border-amber-300/40"
    >
      {children}
    </button>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`truncate text-neutral-200 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
