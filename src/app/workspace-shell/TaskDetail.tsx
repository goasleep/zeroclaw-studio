import { Bot, PackageCheck, Sparkles } from "lucide-react";
import { useCallback } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChatPanel } from "@/features/chat/ChatPanel";
import type { StudioTask, TaskPatch } from "@/features/tasks/task-model";

interface TaskDetailProps {
  task: StudioTask | null;
  agents: string[];
  activeAgent: string | null;
  onAgentChange: (agent: string) => void;
  onWorkspaceRoot: (path: string | null) => void;
  onPatchTask: (id: string, patch: TaskPatch) => Promise<StudioTask>;
  onLinkSession: (id: string, sessionId: string) => Promise<StudioTask>;
  onOpenDashboard: () => void;
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
  onOpenDashboard,
  onOpenAgentSetup,
  onOpenSetupCenter,
}: TaskDetailProps) {
  const { t } = useLingui();

  const linkSession = useCallback(
    (sessionId: string) => {
      if (!task || task.session_id) return;
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

  if (!agentAlias) {
    return (
      <main className="flex h-full items-center justify-center bg-[#020818]/70 p-8 text-center">
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
      </main>
    );
  }

  return (
    <ChatPanel
      key={`${task.id}:${task.session_id ?? "new"}:${agentAlias}:${task.workspace_root ?? "none"}`}
      agentAlias={agentAlias}
      agents={agents}
      onAgentChange={onAgentChange}
      mode={mode}
      workspaceRoot={task.workspace_root}
      initialSessionId={task.session_id}
      workspaceDir={mode === "acp" ? task.workspace_root : null}
      onWorkspaceRoot={onWorkspaceRoot}
      taskTitle={task.title}
      onTaskSession={task.session_id ? undefined : linkSession}
      onTaskTitle={(title) => void onPatchTask(task.id, { title })}
      startBlank={!task.session_id}
    />
  );
}
