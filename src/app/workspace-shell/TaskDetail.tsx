import { Archive, Bot, FileText, Gauge, PackageCheck, Pencil, Route, Sparkles } from "lucide-react";
import { useCallback, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChatPanel } from "@/features/chat/ChatPanel";
import type { StudioTask, TaskPatch, TaskStatus } from "@/features/tasks/task-model";
import { nowIso, taskStatusClass, taskStatusLabel } from "@/features/tasks/task-model";
import { useConnections } from "@/app/connection-context";

interface TaskDetailProps {
  task: StudioTask | null;
  agents: string[];
  activeAgent: string | null;
  onAgentChange: (agent: string) => void;
  onWorkspaceRoot: (path: string | null) => void;
  onPatchTask: (id: string, patch: TaskPatch) => Promise<StudioTask>;
  onLinkSession: (id: string, sessionId: string) => Promise<StudioTask>;
  onArchive: (id: string) => Promise<StudioTask>;
  onOpenDashboard: () => void;
  onOpenRuntime: () => void;
  onOpenAgentSetup: () => void;
  onOpenSetupCenter: () => void;
}

export function TaskDetail({
  task,
  agents,
  activeAgent,
  onAgentChange,
  onWorkspaceRoot,
  onPatchTask,
  onLinkSession,
  onArchive,
  onOpenDashboard,
  onOpenRuntime,
  onOpenAgentSetup,
  onOpenSetupCenter,
}: TaskDetailProps) {
  const { t } = useLingui();
  const { active } = useConnections();
  const lastStatusRef = useRef<TaskStatus | null>(null);

  const patchStatus = useCallback(
    (status: "running" | "needs_approval" | "done" | "failed") => {
      if (!task || lastStatusRef.current === status) return;
      lastStatusRef.current = status;
      void onPatchTask(task.id, {
        status,
        last_activity_at: nowIso(),
      });
    },
    [onPatchTask, task],
  );

  const linkSession = useCallback(
    (sessionId: string) => {
      if (!task || task.session_id === sessionId) return;
      void onLinkSession(task.id, sessionId);
    },
    [onLinkSession, task],
  );

  if (!task) {
    return (
      <main className="flex h-full items-center justify-center bg-[#020818]/70 p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
            <Sparkles size={18} />
          </div>
          <h1 className="text-sm font-semibold text-neutral-100">{t`No task selected`}</h1>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            {t`Choose a task from the sidebar or create a new one from the dashboard.`}
          </p>
          <button
            type="button"
            onClick={onOpenDashboard}
            className="mt-4 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
          >
            {t`Open dashboard`}
          </button>
        </div>
      </main>
    );
  }

  const mode = task.mode === "acp" ? "acp" : "chat";
  const agentAlias = task.agent_alias ?? activeAgent ?? agents[0] ?? null;

  return (
    <section className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] overflow-hidden bg-[#020818]/70">
      <div className="flex min-w-0 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-white/[0.08] px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-base font-semibold text-neutral-100">{task.title}</h1>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${taskStatusClass(task.status)}`}
                >
                  {taskStatusLabel(task.status)}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                <span>{active?.name ?? t`No connection`}</span>
                <span>/</span>
                <span className="truncate font-mono">
                  {task.workspace_root ?? t`No workspace selected`}
                </span>
                {task.session_id && (
                  <>
                    <span>/</span>
                    <span className="font-mono">{task.session_id}</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = window.prompt(t`Rename task`, task.title);
                if (next?.trim()) void onPatchTask(task.id, { title: next.trim() });
              }}
              className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => void onArchive(task.id)}
              className="rounded-md border border-white/10 px-2 py-1.5 text-xs text-neutral-300 hover:border-red-400 hover:text-red-300"
            >
              <Archive size={13} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          {agentAlias ? (
            <ChatPanel
              key={`${task.id}:${task.session_id ?? "new"}:${agentAlias}:${task.workspace_root ?? "none"}`}
              agentAlias={agentAlias}
              agents={agents}
              onAgentChange={onAgentChange}
              mode={mode}
              workspaceRoot={task.workspace_root}
              workspaceDir={mode === "acp" ? task.workspace_root : null}
              onWorkspaceRoot={onWorkspaceRoot}
              taskId={task.id}
              taskTitle={task.title}
              onTaskSession={linkSession}
              onTaskStatus={patchStatus}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                  <Bot size={18} />
                </div>
                <h2 className="text-sm font-semibold text-neutral-100">{t`No agent configured`}</h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  {t`Set up an agent for this runtime before starting the task run.`}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenAgentSetup}
                    className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
                  >
                    <Bot size={13} />
                    {t`Set up agent`}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSetupCenter}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
                  >
                    <PackageCheck size={13} />
                    {t`Open Setup Center`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-[#020818]/90 p-4 zc-scrollbar">
        <h2 className="mb-3 text-sm font-semibold text-neutral-100">{t`Task Inspector`}</h2>
        <div className="space-y-3 text-xs">
          <InspectorItem icon={Gauge} label={t`Runtime`} value={active?.name ?? t`No connection`} />
          <InspectorItem
            icon={Route}
            label={t`Workspace`}
            value={task.workspace_root ?? t`No workspace selected`}
            mono
          />
          <InspectorItem
            icon={Sparkles}
            label={t`Agent`}
            value={agentAlias ?? t`No agent selected`}
          />
          <InspectorItem
            icon={FileText}
            label={t`Runtime reference`}
            value={task.session_id ?? t`Not linked yet`}
            mono
          />
        </div>
        <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <h3 className="mb-2 text-xs font-medium text-neutral-200">{t`Requirement`}</h3>
          {task.goal ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">
              {task.goal}
            </p>
          ) : (
            <p className="text-xs text-neutral-500">{t`No requirement captured yet.`}</p>
          )}
        </section>
        <section className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <h3 className="mb-2 text-xs font-medium text-neutral-200">{t`Pinned result`}</h3>
          {task.pinned_result ? (
            <div className="text-xs text-neutral-400">
              <div className="font-medium text-neutral-200">{task.pinned_result.label}</div>
              <div className="mt-1 truncate font-mono text-neutral-500">
                {task.pinned_result.value}
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">{t`No pinned result yet.`}</p>
          )}
        </section>
        <button
          type="button"
          onClick={onOpenRuntime}
          className="mt-4 w-full rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
        >
          {t`Open runtime diagnostics`}
        </button>
      </aside>
    </section>
  );
}

function InspectorItem({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
        <Icon size={12} className="text-cyan-300" />
        {label}
      </div>
      <div className={`truncate text-neutral-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
