// Workspace shell — page-level state, deep links, and native menu commands.

import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useWorkspace } from "@/app/workspace-context";
import { apiQuickstartState } from "@/api/client";
import { ChatWorkspace } from "./workspace-shell/ChatWorkspace";
import { WorkspaceSidebar } from "./workspace-shell/WorkspaceSidebar";
import { SettingsPage } from "./workspace-shell/SettingsPage";
import { isSettingsSection } from "./workspace-shell/settings-sections";
import { useThreads } from "./workspace-shell/use-threads";
import type {
  SettingsSection,
  WorkspacePage,
} from "./workspace-shell/types";
import type { NormalizedSession } from "@/features/chat/use-chat";

export function WorkspaceShell() {
  const { addFiles, setRoot } = useWorkspace();
  const [page, setPage] = useState<WorkspacePage>("chat");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("app");
  const [configFocusSection, setConfigFocusSection] = useState<string | null>(
    null,
  );
  const [agents, setAgents] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const threads = useThreads();

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

  const openProject = useCallback(async () => {
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string") {
      await setRoot(chosen);
    }
  }, [setRoot]);

  const openSettings = useCallback((section: string) => {
    setSettingsSection(isSettingsSection(section) ? section : "app");
    setPage("settings");
  }, []);

  const focusComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("zeroclaw://quick-invoke"));
    });
  }, []);

  const openThread = useCallback(
    (thread: NormalizedSession) => {
      const agent = thread.agent_alias || activeAgent || agents[0];
      if (agent) setActiveAgent(agent);
      setActiveThreadId(thread.session_id);
      setPendingSessionId(thread.session_id);
      setPage("chat");
    },
    [activeAgent, agents],
  );

  const newThread = useCallback(() => {
    setActiveThreadId(null);
    setPage("chat");
    window.dispatchEvent(new CustomEvent("zeroclaw://new-session"));
    focusComposer();
  }, [focusComposer]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (!pendingSessionId || page !== "chat") return;
    const sessionId = pendingSessionId;
    window.requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("zeroclaw://select-session", { detail: sessionId }),
      );
      focusComposer();
    });
    setPendingSessionId(null);
  }, [activeAgent, focusComposer, page, pendingSessionId]);

  useEffect(() => {
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
      void openProject();
    }

    function onFocusChat() {
      setPage("chat");
      focusComposer();
    }

    function onFocusCode() {
      setPage("code");
      focusComposer();
    }

    window.addEventListener("zeroclaw://open-settings", onOpenSettings);
    window.addEventListener("zeroclaw://deep-link", onDeepLink);
    window.addEventListener("zeroclaw://open-project", onOpenProject);
    window.addEventListener("zeroclaw://focus-chat", onFocusChat);
    window.addEventListener("zeroclaw://focus-code", onFocusCode);
    return () => {
      window.removeEventListener("zeroclaw://open-settings", onOpenSettings);
      window.removeEventListener("zeroclaw://deep-link", onDeepLink);
      window.removeEventListener("zeroclaw://open-project", onOpenProject);
      window.removeEventListener("zeroclaw://focus-chat", onFocusChat);
      window.removeEventListener("zeroclaw://focus-code", onFocusCode);
    };
  }, [addFiles, focusComposer, openProject, openSettings]);

  return (
    <div className="h-full min-h-0 overflow-hidden bg-neutral-950 text-neutral-100">
      {page === "chat" || page === "code" ? (
        <div className="grid h-full min-h-0 grid-cols-[280px_minmax(420px,1fr)] overflow-hidden">
          <WorkspaceSidebar
            page={page}
            threads={threads.threads}
            activeThreadId={activeThreadId}
            threadsLoading={threads.loading}
            threadError={threads.error}
            onPage={setPage}
            onThread={openThread}
            onNewThread={newThread}
            onRefreshThreads={() => void threads.refresh()}
            onRenameThread={(id, name) => void threads.rename(id, name)}
            onDeleteThread={(id) => void threads.remove(id)}
            onPickRoot={() => void openProject()}
          />
          <ChatWorkspace
            mode={page === "code" ? "acp" : "chat"}
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
