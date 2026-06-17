// Main workspace shell — Codex-style chat surface with a separate Settings page.

import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Bot,
  ChevronRight,
  Clock,
  Code2,
  Cog,
  Database,
  FolderOpen,
  HardDrive,
  Home,
  MessageSquare,
  PlugZap,
  Settings,
  Stethoscope,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
import { useConnections } from "@/app/connection-context";
import { useWorkspace } from "@/app/workspace-context";
import { FileTree } from "@/workspace/files/FileTree";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { AgentSetupWizard } from "@/features/chat/AgentSetupWizard";
import { MemoryPanel } from "@/features/memory/MemoryPanel";
import { ConfigPanel } from "@/features/config/ConfigPanel";
import { CronPanel } from "@/features/cron/CronPanel";
import { ToolsPanel } from "@/features/tools/ToolsPanel";
import { LogsPanel } from "@/features/logs/LogsPanel";
import { DoctorPanel } from "@/features/doctor/DoctorPanel";
import { DevicesPanel } from "@/features/devices/DevicesPanel";
import { IntegrationsPanel } from "@/features/integrations/IntegrationsPanel";
import { apiQuickstartState } from "@/api/client";

type Page = "chat" | "code" | "settings";
type SettingsSection =
  | "app"
  | "gateway-config"
  | "memory"
  | "cron"
  | "tools"
  | "integrations"
  | "logs"
  | "doctor"
  | "devices";

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  group: "App" | "Gateway" | "Operations";
  icon: typeof Cog;
}> = [
  { id: "app", label: "App", group: "App", icon: Settings },
  { id: "gateway-config", label: "Gateway Config", group: "Gateway", icon: Cog },
  { id: "memory", label: "Memory", group: "Operations", icon: Database },
  { id: "cron", label: "Cron", group: "Operations", icon: Clock },
  { id: "tools", label: "Tools", group: "Operations", icon: Wrench },
  { id: "integrations", label: "Integrations", group: "Operations", icon: PlugZap },
  { id: "logs", label: "Logs", group: "Operations", icon: Terminal },
  { id: "doctor", label: "Doctor", group: "Operations", icon: Stethoscope },
  { id: "devices", label: "Devices", group: "Operations", icon: HardDrive },
];

export function WorkspaceShell() {
  const [page, setPage] = useState<Page>("chat");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("app");
  const [configFocusSection, setConfigFocusSection] = useState<string | null>(
    null,
  );
  const [agents, setAgents] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

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

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  return (
    <div className="h-full min-h-0 overflow-hidden bg-neutral-950 text-neutral-100">
      {page === "chat" || page === "code" ? (
        <div className="grid h-full min-h-0 grid-cols-[280px_minmax(420px,1fr)] overflow-hidden">
          <Sidebar
            page={page}
            onPage={setPage}
            agents={agents}
            activeAgent={activeAgent}
            onActiveAgent={setActiveAgent}
          />
          <ChatMain
            mode={page === "code" ? "acp" : "chat"}
            agents={agents}
            activeAgent={activeAgent}
            onActiveAgent={setActiveAgent}
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

function Sidebar({
  page,
  onPage,
  agents,
  activeAgent,
  onActiveAgent,
}: {
  page: Page;
  onPage: (p: Page) => void;
  agents: string[];
  activeAgent: string | null;
  onActiveAgent: (agent: string) => void;
}) {
  const { root, setRoot, selectedFiles, clearSelection } = useWorkspace();

  async function pickRoot() {
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string") {
      await setRoot(chosen);
    }
  }

  return (
    <aside className="flex min-w-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-800 p-3">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <FolderOpen size={14} className="shrink-0 text-orange-400" />
          <span>Project</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100"
            title={root ?? "no workspace"}
          >
            {root ? root.split("/").slice(-1)[0] : "No folder open"}
          </span>
          <button
            type="button"
            onClick={() => void pickRoot()}
            className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:border-orange-500 hover:text-orange-300"
          >
            {root ? "Change" : "Open"}
          </button>
        </div>
      </header>

      <nav className="shrink-0 border-b border-neutral-800 p-2">
        <button
          type="button"
          onClick={() => onPage("chat")}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
            page === "chat"
              ? "bg-orange-500/10 text-orange-200"
              : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
          }`}
        >
          <MessageSquare size={14} />
          <span className="min-w-0 flex-1 truncate">Chat</span>
        </button>
        <button
          type="button"
          onClick={() => onPage("code")}
          className={`mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
            page === "code"
              ? "bg-orange-500/10 text-orange-200"
              : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
          }`}
        >
          <Code2 size={14} />
          <span className="min-w-0 flex-1 truncate">Code</span>
        </button>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-neutral-800 p-3">
          <h2 className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
            Chats
          </h2>
          {agents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 p-3 text-xs leading-relaxed text-neutral-500">
              No agents yet. Complete setup in the main panel to start chatting.
            </div>
          ) : (
            <div className="space-y-1">
              {agents.map((alias) => (
                <button
                  key={alias}
                  type="button"
                  onClick={() => {
                    onActiveAgent(alias);
                    onPage(page === "code" ? "code" : "chat");
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                    activeAgent === alias && (page === "chat" || page === "code")
                      ? "bg-neutral-800 text-neutral-100"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                  }`}
                >
                  <Bot size={13} className="shrink-0 text-orange-400" />
                  <span className="min-w-0 flex-1 truncate">{alias}</span>
                  {activeAgent === alias && <ChevronRight size={12} />}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="p-3">
          <h2 className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
            <span>Chat Context ({selectedFiles.length})</span>
            {selectedFiles.length > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-orange-300"
              >
                <Trash2 size={10} />
                clear
              </button>
            )}
          </h2>
          {root ? (
            <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
              <FileTree />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 p-3 text-xs leading-relaxed text-neutral-500">
              Open a folder to use local files as context. Selected files are
              attached to your next chat turn.
            </div>
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t border-neutral-800 p-2">
        <button
          type="button"
          onClick={() => onPage("settings")}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
            page === "settings"
              ? "bg-orange-500/10 text-orange-200"
              : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
          }`}
        >
          <Settings size={14} />
          <span className="min-w-0 flex-1 truncate">Settings</span>
        </button>
      </footer>
    </aside>
  );
}

function ChatMain({
  mode,
  agents,
  activeAgent,
  onActiveAgent,
  onAgentCreated,
}: {
  mode: "chat" | "acp";
  agents: string[];
  activeAgent: string | null;
  onActiveAgent: (agent: string) => void;
  onAgentCreated: () => void;
}) {
  const { root } = useWorkspace();
  const isCode = mode === "acp";

  if (agents.length === 0) {
    return (
      <section className="flex min-w-0 flex-col overflow-hidden bg-neutral-950">
        <AgentSetupWizard onAgentCreated={onAgentCreated} />
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden bg-neutral-950">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-800 px-4 text-xs">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <MessageSquare size={14} className="shrink-0 text-orange-400" />
          <span className="truncate font-medium text-neutral-100">
            {activeAgent ? `${isCode ? "Code" : "Chat"} / ${activeAgent}` : isCode ? "Code" : "Chat"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {agents.map((alias) => (
            <button
              key={alias}
              type="button"
              onClick={() => onActiveAgent(alias)}
              className={`rounded-md px-2 py-1 transition ${
                activeAgent === alias
                  ? "bg-orange-500/15 text-orange-200"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              {alias}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeAgent && (
          <ChatPanel
            agentAlias={activeAgent}
            mode={mode}
            workspaceDir={isCode ? root : null}
          />
        )}
      </div>
    </section>
  );
}

function SettingsPage({
  section,
  onSection,
  onBackToChat,
  configFocusSection,
  onConfigFocusSection,
}: {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onBackToChat: () => void;
  configFocusSection: string | null;
  onConfigFocusSection: (section: string | null) => void;
}) {
  const current = SETTINGS_SECTIONS.find((s) => s.id === section);

  return (
    <section className="grid h-full min-h-0 grid-cols-[280px_minmax(420px,1fr)] overflow-hidden bg-neutral-950">
      <SettingsNav
        section={section}
        onSection={onSection}
        onBackToChat={onBackToChat}
      />
      <main className="flex min-w-0 flex-col overflow-hidden border-l border-neutral-800">
        <header className="flex h-16 shrink-0 flex-col justify-center border-b border-neutral-800 px-8">
          <h1 className="truncate text-lg font-semibold text-neutral-100">
            {current?.label ?? "Settings"}
          </h1>
          <p className="truncate text-xs text-neutral-500">
            {current?.group ?? "Settings"}
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          {section === "app" && <AppSettings />}
          {section === "gateway-config" && (
            <ConfigPanel focusSection={configFocusSection} />
          )}
          {section === "memory" && <MemoryPanel />}
          {section === "cron" && <CronPanel />}
          {section === "tools" && <ToolsPanel />}
          {section === "integrations" && (
            <IntegrationsPanel
              onConfigure={(targetSection) => {
                onConfigFocusSection(targetSection);
                onSection("gateway-config");
              }}
            />
          )}
          {section === "logs" && <LogsPanel />}
          {section === "doctor" && <DoctorPanel />}
          {section === "devices" && <DevicesPanel />}
        </div>
      </main>
    </section>
  );
}

function SettingsNav({
  section,
  onSection,
  onBackToChat,
}: {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onBackToChat: () => void;
}) {
  const groups: Array<"App" | "Gateway" | "Operations"> = [
    "App",
    "Gateway",
    "Operations",
  ];

  return (
    <aside className="flex min-h-0 flex-col bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-800 p-3">
        <button
          type="button"
          onClick={onBackToChat}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-100"
        >
          <Home size={14} />
          <span className="min-w-0 flex-1 truncate">Back to app</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {groups.map((group) => (
          <section key={group} className="mb-5">
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
              {group}
            </h2>
            <div className="space-y-1">
              {SETTINGS_SECTIONS.filter((s) => s.group === group).map(
                ({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSection(id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                      section === id
                        ? "bg-orange-500/10 text-orange-200"
                        : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                  </button>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function AppSettings() {
  const { active, connections, health, activation } = useConnections();
  const { root, selectedFiles } = useWorkspace();
  const online = active && health?.connection_id === active.id && health.healthy;

  return (
    <div className="h-full overflow-auto p-5 text-sm">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-100">
            Connection
          </h2>
          {active ? (
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <InfoItem label="Name" value={active.name} />
              <InfoItem label="Status" value={online ? "Online" : "Offline"} />
              <InfoItem label="Transport" value={active.transport} />
              <InfoItem label="Lifecycle" value={active.lifecycle} />
              <InfoItem label="URL" value={active.url || "pending tunnel"} wide />
            </dl>
          ) : (
            <p className="text-xs text-neutral-500">No active connection.</p>
          )}
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-100">
            Workspace
          </h2>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <InfoItem label="Folder" value={root ?? "No folder open"} wide />
            <InfoItem label="Chat attachments" value={String(selectedFiles.length)} />
            <InfoItem label="Saved connections" value={String(connections.length)} />
            <InfoItem
              label="Activation"
              value={activation ? activation.type : "idle"}
            />
          </dl>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
          <h2 className="mb-2 text-sm font-medium text-neutral-100">
            App Settings
          </h2>
          <p className="text-xs leading-relaxed text-neutral-500">
            This page reflects current app state and gateway operations. Local
            UI preferences are not persisted yet.
          </p>
        </section>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="truncate rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 font-mono text-neutral-300">
        {value}
      </dd>
    </div>
  );
}
