// Workspace shell — page-level state, deep links, native menu commands, and
// the single-gateway task workspace.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useLingui } from "@lingui/react/macro";
import { MessageSquare, Plus } from "lucide-react";
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
import { ApprovalsPage } from "./workspace-shell/ApprovalsPage";
import { AutomationsPage } from "./workspace-shell/AutomationsPage";
import { RuntimeDetail } from "./workspace-shell/RuntimeDetail";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { settingsSectionForConfigTarget } from "./workspace-shell/settings-routing";
import { isSettingsSection } from "./workspace-shell/settings-sections";
import { useTaskSessions } from "./workspace-shell/use-task-sessions";
import { useWorkspaceCommands } from "./workspace-shell/use-workspace-commands";
import type { RuntimeTab, SettingsSection, WorkspacePage } from "./workspace-shell/types";
import { createDraftTask, type StudioTask, type TaskPatch } from "@/features/tasks/task-model";
import { useTasks } from "@/features/tasks/use-tasks";
import { useApprovals } from "@/features/approvals/use-approvals";
import type { PendingApproval } from "@/api/tauri";

export function WorkspaceShell() {
  const { t } = useLingui();
  const { root, recentRoots, addFiles, setRoot, connectionId } = useWorkspace();
  const { active, connections, activate } = useConnections();
  const [page, setPage] = useState<WorkspacePage>("dashboard");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("app");
  const [runtimeTab, setRuntimeTab] = useState<RuntimeTab>("overview");
  const [composeWorkspaceRoot, setComposeWorkspaceRoot] = useState<string | null>(null);
  const [composeSeed, setComposeSeed] = useState(0);
  const [configFocusSection, setConfigFocusSection] = useState<string | null>(null);
  const [agentWorkspaceFocusAlias, setAgentWorkspaceFocusAlias] = useState<string | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [pendingTaskSessionId, setPendingTaskSessionId] = useState<string | null>(null);
  const [automationCount, setAutomationCount] = useState(0);
  const composeTitleRef = useRef("New chat");
  const composeWorkspaceRootRef = useRef<string | null>(null);
  const promotedComposeSessionRef = useRef<string | null>(null);
  const taskSessions = useTaskSessions();
  const tasks = useTasks({ connectionId });
  const approvals = useApprovals();

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

  const openSettings = useCallback((section: string) => {
    const nextSection = isSettingsSection(section) ? section : "app";
    setSettingsSection(nextSection);
    setConfigFocusSection(null);
    setAgentWorkspaceFocusAlias(null);
    if (nextSection === "app") {
      setPage("settings");
    } else {
      setRuntimeTab("config");
      setPage("runtime");
    }
  }, []);

  const openConfigTarget = useCallback((target: string) => {
    const clean = target.trim();
    if (!clean) return;
    setConfigFocusSection(clean);
    setAgentWorkspaceFocusAlias(null);
    setSettingsSection(settingsSectionForConfigTarget(clean));
    setRuntimeTab("config");
    setPage("runtime");
  }, []);

  const openRuntimeTab = useCallback((tab: RuntimeTab) => {
    setRuntimeTab(tab);
    setPage("runtime");
  }, []);

  const openAgentWorkspace = useCallback((alias: string) => {
    const clean = alias.trim();
    setConfigFocusSection(null);
    setAgentWorkspaceFocusAlias(clean || null);
    if (clean) setActiveAgent(clean);
    setSettingsSection("agent-workspace");
    setRuntimeTab("config");
    setPage("runtime");
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

  const openComposer = useCallback(
    async (workspaceRoot: string | null = null) => {
      if (workspaceRoot) await setRoot(workspaceRoot);
      composeTitleRef.current = t`New chat`;
      composeWorkspaceRootRef.current = workspaceRoot;
      promotedComposeSessionRef.current = null;
      setComposeWorkspaceRoot(workspaceRoot);
      setActiveTaskId(null);
      setComposeSeed((seed) => seed + 1);
      setPage("compose");
      window.requestAnimationFrame(focusComposer);
    },
    [focusComposer, setRoot, t],
  );

  const openProjectRoot = useCallback(
    async (path: string) => {
      await openComposer(path);
    },
    [openComposer],
  );

  const promoteComposeSession = useCallback(
    async (sessionId: string) => {
      if (!connectionId || promotedComposeSessionRef.current === sessionId) return;
      promotedComposeSessionRef.current = sessionId;
      const workspaceRoot = composeWorkspaceRootRef.current;
      const task = createDraftTask({
        connectionId,
        title: composeTitleRef.current,
        workspaceRoot,
        agentAlias: activeAgent ?? agents[0] ?? null,
        mode: "chat",
      });
      const saved = await tasks.upsert(task);
      await tasks.linkSession(saved.id, sessionId);
      void taskSessions.refresh();
      setActiveTaskId(saved.id);
    },
    [activeAgent, agents, connectionId, taskSessions, tasks],
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
      void taskSessions.refresh();
      return saved;
    },
    [tasks, taskSessions],
  );

  const createTaskFromCommand = useCallback(
    async (workspaceRoot: string | null, mode: "chat" | "acp" = "chat") => {
      if (mode === "chat") {
        await openComposer(null);
        return;
      }
      if (workspaceRoot) await setRoot(workspaceRoot);
      await createTask({
        mode,
        title: mode === "acp" ? "New code task" : "New task",
        workspaceRoot,
      });
    },
    [createTask, openComposer, setRoot],
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
    setComposeWorkspaceRoot(null);
    composeWorkspaceRootRef.current = null;
    promotedComposeSessionRef.current = null;
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

  useWorkspaceCommands({
    activeTaskWorkspaceRoot: root,
    addFiles,
    createTaskFromCommand,
    focusComposer,
    openAgentWorkspace,
    openConfigTarget,
    openRuntimeTab,
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

  async function openApproval(approval: PendingApproval) {
    if (active?.id !== approval.connection_id) {
      await activate(approval.connection_id);
      setPendingTaskSessionId(approval.session_id);
      return;
    }
    if (approval.task_id) {
      openTaskId(approval.task_id);
      return;
    }
    setPendingTaskSessionId(approval.session_id);
  }

  function renameTask(task: StudioTask) {
    const next = window.prompt(t`Rename task`, task.title);
    if (next?.trim()) void patchTask(task.id, { title: next.trim() });
  }

  async function deleteTask(task: StudioTask) {
    const confirmed = window.confirm(
      task.session_id ? t`Delete chat "${task.title}"?` : t`Delete ${task.title}?`,
    );
    if (!confirmed) return;

    const wasActiveTask = activeTaskId === task.id;
    const wasPendingSession = Boolean(task.session_id && pendingTaskSessionId === task.session_id);
    let localRemoved = false;
    try {
      await tasks.removeLocal(task.id);
      localRemoved = true;
      if (wasActiveTask) {
        setActiveTaskId(null);
        setPage("dashboard");
      }
      if (wasPendingSession) {
        setPendingTaskSessionId(null);
      }
      if (task.session_id) {
        await taskSessions.remove(task.session_id);
        await taskSessions.forgetLocal(task.session_id);
      }
    } catch (err) {
      if (localRemoved) {
        await tasks.upsert(task).catch(() => undefined);
        if (wasActiveTask) {
          setActiveTaskId(task.id);
          setPage("task");
        }
        if (wasPendingSession) {
          setPendingTaskSessionId(task.session_id ?? null);
        }
      }
      window.alert(err instanceof Error ? err.message : String(err));
    }
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

  function renderNewChatControl() {
    return (
      <button
        type="button"
        disabled={!active}
        onClick={() => void openComposer(null)}
        className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MessageSquare size={13} />
        {t`New Chat`}
      </button>
    );
  }

  function renderSidebarCreateControl() {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={!active}
          onClick={() => void openComposer(null)}
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageSquare size={13} />
          {t`New Chat`}
        </button>
        {renderCreatePopover(
          <button
            type="button"
            disabled={!active}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-300 hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t`More create options`}
          >
            <Plus size={14} />
          </button>,
          undefined,
          undefined,
          "bottom",
        )}
      </div>
    );
  }

  function renderPage() {
    switch (page) {
      case "compose": {
        const agentAlias = activeAgent ?? agents[0] ?? null;
        return agentAlias ? (
          <ChatPanel
            key={`compose:${composeSeed}:${connectionId ?? "no-connection"}:${agentAlias}:${
              composeWorkspaceRoot ?? "general"
            }`}
            agentAlias={agentAlias}
            agents={agents}
            onAgentChange={selectAgent}
            mode="chat"
            workspaceRoot={composeWorkspaceRoot}
            onWorkspaceRoot={(path) => {
              composeWorkspaceRootRef.current = path;
              setComposeWorkspaceRoot(path);
            }}
            startBlank
            onFirstMessage={(message) => {
              composeTitleRef.current = titleFromFirstMessage(message);
            }}
            onTaskSession={(sessionId) => void promoteComposeSession(sessionId)}
          />
        ) : (
          <main className="flex h-full items-center justify-center bg-[#020818]/70 p-8 text-center">
            <div className="max-w-sm">
              <h1 className="text-sm font-semibold text-neutral-100">{t`No agent configured`}</h1>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                {t`Set up an agent for this runtime before starting a chat.`}
              </p>
              <button
                type="button"
                onClick={() => openSettings("agents")}
                className="mt-4 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
              >
                {t`Set up agent`}
              </button>
            </div>
          </main>
        );
      }
      case "dashboard":
        return (
          <WorkDashboard
            tasks={tasks.visibleTasks}
            loading={tasks.loading}
            error={tasks.error}
            approvalCount={approvals.approvals.length}
            renderCreateControl={() => renderNewChatControl()}
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
            renderCreateControl={() => renderNewChatControl()}
            onTask={(task) => void openTask(task)}
            onRenameTask={renameTask}
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
            onOpenDashboard={() => setPage("dashboard")}
            onOpenAgentSetup={() => openSettings("agents")}
            onOpenSetupCenter={() => openSettings("setup-center")}
          />
        );
      case "approvals":
        return (
          <ApprovalsPage
            approvals={approvals.approvals}
            connections={connections}
            error={approvals.error}
            onOpenApproval={(approval) => void openApproval(approval)}
            onRespond={approvals.respond}
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
        return (
          <RuntimeDetail
            tab={runtimeTab}
            onTab={setRuntimeTab}
            onAutomations={() => setPage("automations")}
            settingsSection={settingsSection}
            configFocusSection={configFocusSection}
            onSettingsSection={setSettingsSection}
            onConfigFocusSection={setConfigFocusSection}
            onBackToApp={() => setPage("dashboard")}
            agentWorkspaceFocusAlias={agentWorkspaceFocusAlias}
          />
        );
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
      {page === "settings" || page === "runtime" ? (
        renderPage()
      ) : (
        <div className="grid h-full min-h-0 grid-cols-[300px_minmax(420px,1fr)] overflow-hidden">
          <WorkSidebar
            page={page}
            tasks={tasks.visibleTasks}
            activeTaskId={activeTaskId}
            approvalCount={approvals.approvals.length}
            automationCount={automationCount}
            onPage={setPage}
            onTask={(task) => void openTask(task)}
            onRenameTask={renameTask}
            onDeleteTask={(task) => void deleteTask(task)}
            createControl={renderSidebarCreateControl()}
            onProject={(path) => void openProjectRoot(path)}
            onPickRoot={() => void pickProject()}
            onNewProjectSession={() => void openComposer(root)}
          />
          {renderPage()}
        </div>
      )}
    </div>
  );
}

function titleFromFirstMessage(message: string) {
  const singleLine = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const compact = (singleLine ?? message).replace(/\s+/g, " ").trim();
  if (compact.length <= 60) return compact || "New chat";
  return `${compact.slice(0, 57).trimEnd()}...`;
}
