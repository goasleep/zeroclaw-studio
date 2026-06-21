// Workspace shell — page-level state, deep links, native menu commands, and
// the single-gateway task workspace.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useLingui } from "@lingui/react/macro";
import { Plus, Sparkles } from "lucide-react";
import { useWorkspace } from "@/app/workspace-context";
import { useConnections } from "@/app/connection-context";
import { apiCron, apiCronCreate, type CronJobCreate } from "@/api/tools";
import { isLocalWorkspaceConnection, validateWorkspaceRoot } from "@/api/workspace";
import { apiQuickstartState } from "@/api/quickstart";
import { SettingsPage } from "./workspace-shell/SettingsPage";
import { WorkSidebar } from "./workspace-shell/WorkSidebar";
import { WorkDashboard } from "./workspace-shell/WorkDashboard";
import { WorkCreatePopover } from "./workspace-shell/WorkCreatePopover";
import { TasksPage } from "./workspace-shell/TasksPage";
import { TaskDetail } from "./workspace-shell/TaskDetail";
import { ApprovalsPage, type PendingApproval } from "./workspace-shell/ApprovalsPage";
import { AutomationsPage } from "./workspace-shell/AutomationsPage";
import { RuntimeDetail } from "./workspace-shell/RuntimeDetail";
import { settingsSectionForConfigTarget } from "./workspace-shell/settings-routing";
import { isSettingsSection } from "./workspace-shell/settings-sections";
import { useTaskSessions } from "./workspace-shell/use-task-sessions";
import { useWorkspaceCommands } from "./workspace-shell/use-workspace-commands";
import type { SettingsSection, WorkspacePage } from "./workspace-shell/types";
import {
  createDraftTask,
  nowIso,
  type StudioTask,
  type TaskPatch,
} from "@/features/tasks/task-model";
import { useTasks } from "@/features/tasks/use-tasks";

export function WorkspaceShell() {
  const { t } = useLingui();
  const { root, recentRoots, addFiles, setRoot, connectionId } = useWorkspace();
  const { active } = useConnections();
  const [page, setPage] = useState<WorkspacePage>("dashboard");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("app");
  const [configFocusSection, setConfigFocusSection] = useState<string | null>(null);
  const [agentWorkspaceFocusAlias, setAgentWorkspaceFocusAlias] = useState<string | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [pendingTaskSessionId, setPendingTaskSessionId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [automationCount, setAutomationCount] = useState(0);
  const taskSessions = useTaskSessions();
  const tasks = useTasks({
    connectionId,
    sessions: taskSessions.sessions,
    workspaceMap: taskSessions.workspaceMap,
  });

  const activeTask = useMemo(
    () => tasks.tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks.tasks],
  );

  const loadAgents = useCallback(() => {
    if (!connectionId) {
      setAgents([]);
      setActiveAgent(null);
      return;
    }
    void apiQuickstartState()
      .then((s) => {
        const aliases = s.agents ?? [];
        setAgents(aliases);
        setActiveAgent((current) =>
          current && aliases.includes(current) ? current : (aliases[0] ?? null),
        );
      })
      .catch(() => {
        setAgents([]);
        setActiveAgent(null);
      });
  }, [connectionId]);

  const focusComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("zeroclaw://quick-invoke"));
    });
  }, []);

  const pickProject = useCallback(async () => {
    if (active && !isLocalWorkspaceConnection(active)) {
      const chosen = window.prompt("Remote working directory", root ?? "");
      if (typeof chosen === "string" && chosen.trim()) {
        const canonical = await validateWorkspaceRoot(active, chosen.trim());
        await setRoot(canonical);
        if (activeTask) {
          await tasks.patch(activeTask.id, { workspace_root: canonical });
        }
      }
      return;
    }
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string") {
      await setRoot(chosen);
      if (activeTask) {
        await tasks.patch(activeTask.id, { workspace_root: chosen });
      }
    }
  }, [active, activeTask, root, setRoot, tasks]);

  const chooseWorkspaceRoot = useCallback(async () => {
    if (active && !isLocalWorkspaceConnection(active)) {
      const chosen = window.prompt("Remote working directory", root ?? "");
      if (typeof chosen === "string" && chosen.trim()) {
        return validateWorkspaceRoot(active, chosen.trim());
      }
      return null;
    }
    const chosen = await openDialog({ directory: true, multiple: false });
    return typeof chosen === "string" ? chosen : null;
  }, [active, root]);

  const openProjectRoot = useCallback(
    async (path: string) => {
      await setRoot(path);
      setPage("dashboard");
    },
    [setRoot],
  );

  const openSettings = useCallback((section: string) => {
    setSettingsSection(isSettingsSection(section) ? section : "app");
    setConfigFocusSection(null);
    setAgentWorkspaceFocusAlias(null);
    setPage("settings");
  }, []);

  const openConfigTarget = useCallback((target: string) => {
    const clean = target.trim();
    if (!clean) return;
    setConfigFocusSection(clean);
    setAgentWorkspaceFocusAlias(null);
    setSettingsSection(settingsSectionForConfigTarget(clean));
    setPage("settings");
  }, []);

  const openAgentWorkspace = useCallback((alias: string) => {
    const clean = alias.trim();
    setConfigFocusSection(null);
    setAgentWorkspaceFocusAlias(clean || null);
    if (clean) setActiveAgent(clean);
    setSettingsSection("agent-workspace");
    setPage("settings");
  }, []);

  const selectAgent = useCallback(
    (agent: string) => {
      setActiveAgent(agent);
      setAgentWorkspaceFocusAlias(null);
      if (activeTask) {
        void tasks.patch(activeTask.id, { agent_alias: agent });
      }
      focusComposer();
    },
    [activeTask, focusComposer, tasks],
  );

  const createTask = useCallback(
    async (
      options: {
        mode?: "chat" | "acp";
        title?: string;
        goal?: string | null;
        workspaceRoot?: string | null;
        agentAlias?: string | null;
      } = {},
    ) => {
      if (!connectionId) return null;
      const mode = options.mode ?? "chat";
      const goal = options.goal ?? null;
      const workspaceRoot = Object.prototype.hasOwnProperty.call(options, "workspaceRoot")
        ? (options.workspaceRoot ?? null)
        : root;
      const task = createDraftTask({
        connectionId,
        title: options.title ?? goal ?? "New task",
        goal,
        workspaceRoot,
        agentAlias: options.agentAlias ?? activeAgent ?? agents[0] ?? null,
        mode,
      });
      const saved = await tasks.upsert(task);
      setActiveTaskId(saved.id);
      setPage("task");
      window.requestAnimationFrame(focusComposer);
      return saved;
    },
    [activeAgent, agents, connectionId, focusComposer, root, tasks],
  );

  const refreshAutomationCount = useCallback(async () => {
    if (!active) {
      setAutomationCount(0);
      return;
    }
    try {
      const data = await apiCron();
      setAutomationCount(data.jobs.filter((job) => job.enabled !== false).length);
    } catch {
      setAutomationCount(0);
    }
  }, [active]);

  const createAutomation = useCallback(
    async (input: CronJobCreate) => {
      await apiCronCreate(input);
      await refreshAutomationCount();
      setPage("automations");
    },
    [refreshAutomationCount],
  );

  const openTask = useCallback(
    async (task: StudioTask) => {
      if (task.workspace_root) {
        await setRoot(task.workspace_root);
      }
      if (task.agent_alias) setActiveAgent(task.agent_alias);
      setActiveTaskId(task.id);
      setPage("task");
      window.requestAnimationFrame(focusComposer);
    },
    [focusComposer, setRoot],
  );

  const patchTask = useCallback(
    async (id: string, patch: TaskPatch) => {
      const saved = await tasks.patch(id, patch);
      if (saved.workspace_root && activeTaskId === id) {
        // Keep the workspace context label aligned with task metadata.
        // Remote paths were validated before entering the task metadata.
      }
      return saved;
    },
    [activeTaskId, tasks],
  );

  const linkTaskSession = useCallback(
    async (id: string, sessionId: string) => {
      const saved = await tasks.linkSession(id, sessionId);
      await tasks.patch(id, {
        status: "running",
        last_activity_at: nowIso(),
      });
      void taskSessions.refresh();
      return saved;
    },
    [tasks, taskSessions],
  );

  const archiveTask = useCallback(
    async (id: string) => {
      const saved = await tasks.archive(id);
      if (activeTaskId === id) {
        setActiveTaskId(null);
        setPage("dashboard");
      }
      return saved;
    },
    [activeTaskId, tasks],
  );

  const createTaskFromCommand = useCallback(
    async (workspaceRoot: string | null, mode: "chat" | "acp" = "chat") => {
      if (workspaceRoot) await setRoot(workspaceRoot);
      await createTask({
        mode,
        title: mode === "acp" ? "New code task" : "New task",
        workspaceRoot,
      });
    },
    [createTask, setRoot],
  );

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    void refreshAutomationCount();
  }, [refreshAutomationCount]);

  useEffect(() => {
    setActiveTaskId(null);
    setPendingTaskSessionId(null);
    setApprovals([]);
    setPage("dashboard");
  }, [connectionId]);

  useEffect(() => {
    if (!pendingTaskSessionId) return;
    const task = tasks.tasks.find((item) => item.session_id === pendingTaskSessionId);
    if (task) {
      void openTask(task);
      setPendingTaskSessionId(null);
    }
  }, [openTask, pendingTaskSessionId, tasks.tasks]);

  useEffect(() => {
    function onApproval(e: Event) {
      const detail = (e as CustomEvent<PendingApproval>).detail;
      if (!detail?.requestId) return;
      setApprovals((prev) => [
        detail,
        ...prev.filter((approval) => approval.requestId !== detail.requestId),
      ]);
    }
    window.addEventListener("zeroclaw://task-approval-request", onApproval);
    return () => window.removeEventListener("zeroclaw://task-approval-request", onApproval);
  }, []);

  useWorkspaceCommands({
    activeTaskWorkspaceRoot: root,
    addFiles,
    createTaskFromCommand,
    focusComposer,
    openAgentWorkspace,
    openConfigTarget,
    openSettings,
    pickProject,
    selectAgent,
    setActiveAgent,
    setPage,
    setPendingTaskSessionId,
  });

  function openTaskId(taskId: string) {
    const task = tasks.tasks.find((item) => item.id === taskId);
    if (task) void openTask(task);
  }

  function renderCreatePopover(
    trigger: ReactNode,
    defaultKind?: "task" | "automation",
    onAutomationCreated?: () => void | Promise<void>,
    side: "top" | "right" | "bottom" | "left" = "right",
  ) {
    return (
      <WorkCreatePopover
        defaultKind={defaultKind}
        side={side}
        agents={agents}
        activeAgent={activeAgent}
        root={root}
        recentRoots={recentRoots}
        onCreateTask={async (input) => {
          await createTask({
            mode: input.mode,
            title: input.title,
            goal: input.goal,
            workspaceRoot: input.workspaceRoot,
            agentAlias: input.agentAlias,
          });
        }}
        onCreateAutomation={async (input) => {
          await createAutomation({
            agent: input.agentAlias,
            name: input.name,
            prompt: input.prompt,
            schedule: input.schedule,
            enabled: true,
          });
          await onAutomationCreated?.();
        }}
        onOpenAgentSetup={() => openSettings("agents")}
        onOpenSetupCenter={() => openSettings("setup-center")}
        onChooseWorkspace={chooseWorkspaceRoot}
      >
        {trigger}
      </WorkCreatePopover>
    );
  }

  function renderPage() {
    switch (page) {
      case "dashboard":
        return (
          <WorkDashboard
            tasks={tasks.visibleTasks}
            loading={tasks.loading}
            error={tasks.error}
            approvalCount={approvals.length}
            renderCreateControl={() =>
              renderCreatePopover(
                <button
                  type="button"
                  disabled={!active}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={13} />
                  {t`New Task`}
                </button>,
                "task",
                undefined,
                "bottom",
              )
            }
            onTask={(task) => void openTask(task)}
            onPage={setPage}
          />
        );
      case "tasks":
        return (
          <TasksPage
            tasks={tasks.visibleTasks}
            loading={tasks.loading}
            error={tasks.error}
            currentRoot={root}
            renderCreateControl={() =>
              renderCreatePopover(
                <button
                  type="button"
                  disabled={!active}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={13} />
                  {t`New Task`}
                </button>,
                "task",
                undefined,
                "bottom",
              )
            }
            onTask={(task) => void openTask(task)}
          />
        );
      case "task":
        return (
          <TaskDetail
            task={activeTask}
            agents={agents}
            activeAgent={activeAgent}
            onAgentChange={selectAgent}
            onWorkspaceRoot={(path) => {
              if (activeTask) void patchTask(activeTask.id, { workspace_root: path });
            }}
            onPatchTask={patchTask}
            onLinkSession={linkTaskSession}
            onArchive={archiveTask}
            onOpenDashboard={() => setPage("dashboard")}
            onOpenRuntime={() => setPage("runtime")}
            onOpenAgentSetup={() => openSettings("agents")}
            onOpenSetupCenter={() => openSettings("setup-center")}
          />
        );
      case "approvals":
        return (
          <ApprovalsPage
            approvals={approvals}
            onOpenTask={openTaskId}
            onResolved={(requestId) =>
              setApprovals((prev) => prev.filter((approval) => approval.requestId !== requestId))
            }
          />
        );
      case "automations":
        return (
          <AutomationsPage
            onRuntime={() => setPage("runtime")}
            onCountChange={setAutomationCount}
            createControl={(onCreated) =>
              renderCreatePopover(
                <button
                  type="button"
                  disabled={!active}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={13} />
                  {t`Create`}
                </button>,
                "automation",
                onCreated,
                "bottom",
              )
            }
          />
        );
      case "runtime":
        return <RuntimeDetail onSettings={() => openSettings("gateway-overview")} />;
      case "settings":
        return (
          <SettingsPage
            key={connectionId ?? "no-connection"}
            section={settingsSection}
            onSection={setSettingsSection}
            onBackToApp={() => setPage("dashboard")}
            configFocusSection={configFocusSection}
            onConfigFocusSection={setConfigFocusSection}
            agentWorkspaceFocusAlias={agentWorkspaceFocusAlias}
          />
        );
    }
  }

  return (
    <div className="h-full min-h-0 overflow-hidden text-slate-100">
      {page === "settings" ? (
        renderPage()
      ) : (
        <div className="grid h-full min-h-0 grid-cols-[300px_minmax(420px,1fr)] overflow-hidden">
          <WorkSidebar
            page={page}
            tasks={tasks.visibleTasks}
            activeTaskId={activeTaskId}
            approvalCount={approvals.length}
            automationCount={automationCount}
            onPage={setPage}
            onTask={(task) => void openTask(task)}
            createControl={renderCreatePopover(
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300"
              >
                <Sparkles size={13} />
                {t`Create`}
              </button>,
              undefined,
            )}
            onProject={(path) => void openProjectRoot(path)}
            onPickRoot={() => void pickProject()}
          />
          {renderPage()}
        </div>
      )}
    </div>
  );
}
