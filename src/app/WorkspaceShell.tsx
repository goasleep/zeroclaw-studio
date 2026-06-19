// Workspace shell — page-level state, deep links, and native menu commands.

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useWorkspace } from "@/app/workspace-context";
import {
  APP_COMMAND_EVENT,
  APP_COMMANDS,
  SETTINGS_COMMAND_SECTIONS,
  appCommandFromEvent,
  appCommandFromPayload,
  type AppCommandId,
} from "@/app/commands/commands";
import { apiQuickstartState } from "@/api/quickstart";
import { ChatWorkspace } from "./workspace-shell/ChatWorkspace";
import { WorkspaceSidebar } from "./workspace-shell/WorkspaceSidebar";
import { SettingsPage } from "./workspace-shell/SettingsPage";
import { isSettingsSection } from "./workspace-shell/settings-sections";
import { useThreads } from "./workspace-shell/use-threads";
import type { SettingsSection, WorkspacePage } from "./workspace-shell/types";
import type { NormalizedSession } from "@/features/chat/use-chat";

export function WorkspaceShell() {
  const { root, addFiles, setRoot } = useWorkspace();
  const [page, setPage] = useState<WorkspacePage>("chat");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("app");
  const [configFocusSection, setConfigFocusSection] = useState<string | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatScopeRoot, setChatScopeRoot] = useState<string | null | undefined>(undefined);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const threads = useThreads();
  const activeChatWorkspaceRoot = chatScopeRoot === undefined ? root : chatScopeRoot;

  const loadAgents = useCallback(() => {
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
  }, []);

  const focusComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("zeroclaw://quick-invoke"));
    });
  }, []);

  const pickProject = useCallback(async () => {
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string") {
      await setRoot(chosen);
      setChatScopeRoot(chosen);
      setActiveThreadId(null);
    }
  }, [setRoot]);

  const openProjectRoot = useCallback(
    async (path: string) => {
      await setRoot(path);
      setChatScopeRoot(path);
      setActiveThreadId(null);
      setPage("chat");
      focusComposer();
    },
    [focusComposer, setRoot],
  );

  const openSettings = useCallback((section: string) => {
    setSettingsSection(isSettingsSection(section) ? section : "app");
    setPage("settings");
  }, []);

  const openThread = useCallback(
    (thread: NormalizedSession, workspaceRoot: string | null) => {
      const agent = thread.agent_alias || activeAgent || agents[0];
      if (agent) setActiveAgent(agent);
      setChatScopeRoot(workspaceRoot);
      setActiveThreadId(thread.session_id);
      setPendingSessionId(thread.session_id);
      setPage("chat");
    },
    [activeAgent, agents],
  );

  const newThread = useCallback(
    (workspaceRoot: string | null) => {
      setChatScopeRoot(workspaceRoot);
      setActiveThreadId(null);
      setPage("chat");
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("zeroclaw://new-session"));
        focusComposer();
      });
    },
    [focusComposer],
  );

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (!pendingSessionId || page !== "chat") return;
    const sessionId = pendingSessionId;
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("zeroclaw://select-session", { detail: sessionId }));
      focusComposer();
    });
    setPendingSessionId(null);
  }, [activeAgent, focusComposer, page, pendingSessionId]);

  useEffect(() => {
    let disposed = false;
    let unlistenCommand: (() => void) | undefined;

    function runCommand(command: AppCommandId) {
      const settingsTarget = SETTINGS_COMMAND_SECTIONS[command];
      if (settingsTarget) {
        openSettings(settingsTarget);
        return;
      }

      switch (command) {
        case APP_COMMANDS.workspaceFocusChat.id:
          setPage("chat");
          focusComposer();
          break;
        case APP_COMMANDS.workspaceFocusCode.id:
          setPage("code");
          focusComposer();
          break;
        case APP_COMMANDS.workspaceOpenProject.id:
          void pickProject();
          break;
        case APP_COMMANDS.workspaceNewChat.id:
          newThread(activeChatWorkspaceRoot);
          break;
        case APP_COMMANDS.workspaceRefreshChats.id:
          window.dispatchEvent(new CustomEvent("zeroclaw://refresh-sessions"));
          break;
        case APP_COMMANDS.workspaceRetryConnection.id:
          break;
      }
    }

    function onCommand(e: Event) {
      const command = appCommandFromEvent(e);
      if (command) runCommand(command);
    }

    function onOpenSettings(e: Event) {
      openSettings((e as CustomEvent<string>).detail);
    }

    function onDeepLink(e: Event) {
      const url = (e as CustomEvent<URL>).detail;
      const arg = firstPathArg(url);
      if (url.host === "agent" && arg) {
        setActiveAgent(arg);
        setPage("chat");
        focusComposer();
        return;
      }
      if (url.host === "session" && arg) {
        setActiveThreadId(arg);
        setPendingSessionId(arg);
        setPage("chat");
        focusComposer();
        return;
      }
      if (url.host === "file") {
        const path = decodeURIComponent(url.pathname || "");
        if (path) {
          addFiles([path]);
          setPage("chat");
          focusComposer();
        }
      }
    }

    function onOpenProject() {
      runCommand(APP_COMMANDS.workspaceOpenProject.id);
    }

    function onFocusChat() {
      runCommand(APP_COMMANDS.workspaceFocusChat.id);
    }

    function onFocusCode() {
      runCommand(APP_COMMANDS.workspaceFocusCode.id);
    }

    void listen(APP_COMMAND_EVENT, (event) => {
      const command = appCommandFromPayload(event.payload);
      if (command) runCommand(command);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenCommand = unlisten;
      }
    });
    window.addEventListener(APP_COMMAND_EVENT, onCommand);
    window.addEventListener("zeroclaw://open-settings", onOpenSettings);
    window.addEventListener("zeroclaw://deep-link", onDeepLink);
    window.addEventListener("zeroclaw://open-project", onOpenProject);
    window.addEventListener("zeroclaw://focus-chat", onFocusChat);
    window.addEventListener("zeroclaw://focus-code", onFocusCode);
    return () => {
      disposed = true;
      unlistenCommand?.();
      window.removeEventListener(APP_COMMAND_EVENT, onCommand);
      window.removeEventListener("zeroclaw://open-settings", onOpenSettings);
      window.removeEventListener("zeroclaw://deep-link", onDeepLink);
      window.removeEventListener("zeroclaw://open-project", onOpenProject);
      window.removeEventListener("zeroclaw://focus-chat", onFocusChat);
      window.removeEventListener("zeroclaw://focus-code", onFocusCode);
    };
  }, [activeChatWorkspaceRoot, addFiles, focusComposer, newThread, openSettings, pickProject]);

  return (
    <div className="h-full min-h-0 overflow-hidden text-slate-100">
      {page === "chat" || page === "code" ? (
        <div className="grid h-full min-h-0 grid-cols-[280px_minmax(420px,1fr)] overflow-hidden">
          <WorkspaceSidebar
            page={page}
            threads={threads.threads}
            workspaceMap={threads.workspaceMap}
            activeThreadId={activeThreadId}
            activeWorkspaceRoot={activeChatWorkspaceRoot}
            threadsLoading={threads.loading}
            threadError={threads.error}
            onPage={setPage}
            onProject={openProjectRoot}
            onThread={openThread}
            onNewThread={newThread}
            onRefreshThreads={() => void threads.refresh()}
            onRenameThread={(id, name) => void threads.rename(id, name)}
            onDeleteThread={(id) => void threads.remove(id)}
            onPickRoot={() => void pickProject()}
          />
          <ChatWorkspace
            mode={page === "code" ? "acp" : "chat"}
            workspaceRoot={activeChatWorkspaceRoot}
            onWorkspaceRoot={setChatScopeRoot}
            agents={agents}
            activeAgent={activeAgent}
            onAgentCreated={loadAgents}
          />
        </div>
      ) : (
        <SettingsPage
          section={settingsSection}
          onSection={setSettingsSection}
          onBackToChat={() => setPage("chat")}
          configFocusSection={configFocusSection}
          onConfigFocusSection={setConfigFocusSection}
        />
      )}
    </div>
  );
}

function firstPathArg(url: URL) {
  return decodeURIComponent(url.pathname.replace(/^\/+/, "")).trim();
}
