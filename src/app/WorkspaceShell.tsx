// Main workspace shell — stable three-column layout.
//
// Earlier builds used react-resizable-panels v4. Its default sizing could
// collapse sidebars to single-character columns in Tauri WebView, producing
// the "split / broken" look. The shell now starts from explicit CSS grid
// widths (260px / fluid / 300px). We can add draggable resizing later on top
// of this stable baseline.

import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Bot,
  Cog,
  Database,
  FolderOpen,
  ListChecks,
  MessageSquare,
  Server,
  Terminal,
  Trash2,
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

type Tab =
  | "chat"
  | "memory"
  | "config"
  | "cron"
  | "tools"
  | "logs"
  | "doctor"
  | "devices"
  | "integrations";

const TABS: Array<{ id: Tab; label: string; icon: typeof Bot }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "memory", label: "Memory", icon: Database },
  { id: "config", label: "Config", icon: Cog },
  { id: "cron", label: "Cron", icon: ListChecks },
  { id: "tools", label: "Tools", icon: Bot },
  { id: "integrations", label: "Integrations", icon: Server },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "doctor", label: "Doctor", icon: Server },
  { id: "devices", label: "Devices", icon: Server },
];

export function WorkspaceShell() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_minmax(420px,1fr)_300px] overflow-hidden bg-neutral-950">
      <Sidebar tab={tab} onTab={setTab} />
      <Center tab={tab} />
      <Inspector />
    </div>
  );
}

function Sidebar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { root, setRoot } = useWorkspace();

  async function pickRoot() {
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string") {
      await setRoot(chosen);
    }
  }

  return (
    <aside className="flex min-w-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-800 px-3 text-xs">
        <FolderOpen size={14} className="shrink-0 text-orange-400" />
        <span className="min-w-0 flex-1 truncate text-neutral-300" title={root ?? "no workspace"}>
          {root ? root.split("/").slice(-1)[0] : "No folder open"}
        </span>
        <button
          type="button"
          onClick={() => void pickRoot()}
          className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:border-orange-500 hover:text-orange-300"
        >
          {root ? "Change" : "Open"}
        </button>
      </header>

      <nav className="shrink-0 border-b border-neutral-800 py-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
              tab === t.id
                ? "bg-orange-500/10 text-orange-200"
                : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
            }`}
          >
            <t.icon size={13} className="shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {root ? (
          <FileTree />
        ) : (
          <div className="m-3 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 p-3 text-xs leading-relaxed text-neutral-500">
            Open a folder to use local files as context. Selected files appear
            in the right panel and are attached to your next chat turn.
          </div>
        )}
      </div>
    </aside>
  );
}

function Center({ tab }: { tab: Tab }) {
  const [agents, setAgents] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "chat") return;
    void apiQuickstartState()
      .then((s) => {
        const aliases = s.agents ?? [];
        setAgents(aliases);
        if (aliases.length > 0 && !activeAgent) setActiveAgent(aliases[0]);
      })
      .catch(() => setAgents([]));
  }, [tab, activeAgent]);

  const refreshAgents = useCallback(() => {
    void apiQuickstartState()
      .then((s) => {
        const aliases = s.agents ?? [];
        setAgents(aliases);
        if (aliases.length > 0) setActiveAgent(aliases[0]);
      })
      .catch(() => setAgents([]));
  }, []);

  if (tab === "chat") {
    if (agents.length === 0) {
      return (
        <section className="flex min-w-0 flex-col h-full overflow-hidden bg-neutral-950">
          <AgentSetupWizard onAgentCreated={refreshAgents} />
        </section>
      );
    }
    return (
      <section className="flex min-w-0 flex-col h-full overflow-hidden bg-neutral-950">
        <header className="flex h-11 shrink-0 items-center gap-1 border-b border-neutral-800 px-3 text-xs">
          {agents.map((alias) => (
            <button
              key={alias}
              type="button"
              onClick={() => setActiveAgent(alias)}
              className={`rounded-md px-2 py-1 transition ${
                activeAgent === alias
                  ? "bg-orange-500/15 text-orange-200"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              {alias}
            </button>
          ))}
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeAgent && <ChatPanel agentAlias={activeAgent} />}
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col h-full overflow-hidden bg-neutral-950">
      <header className="flex h-11 shrink-0 items-center border-b border-neutral-800 px-4 text-xs uppercase tracking-wide text-neutral-400">
        {tab}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "memory" && <MemoryPanel />}
        {tab === "config" && <ConfigPanel />}
        {tab === "cron" && <CronPanel />}
        {tab === "tools" && <ToolsPanel />}
        {tab === "logs" && <LogsPanel />}
        {tab === "doctor" && <DoctorPanel />}
        {tab === "devices" && <DevicesPanel />}
        {tab === "integrations" && <IntegrationsPanel />}
      </div>
    </section>
  );
}

function Inspector() {
  const { selectedFiles, clearSelection } = useWorkspace();
  const { active } = useConnections();

  return (
    <aside className="flex min-w-0 flex-col border-l border-neutral-800 bg-neutral-950 text-xs">
      <header className="flex h-11 shrink-0 items-center border-b border-neutral-800 px-3 uppercase tracking-wide text-neutral-400">
        Context
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <section className="mb-5">
          <h3 className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
            Active connection
          </h3>
          {active ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-2 font-mono text-neutral-300">
              <div className="truncate text-xs font-medium text-neutral-100">{active.name}</div>
              <div className="mt-1 truncate text-[10px] text-neutral-500">{active.url}</div>
            </div>
          ) : (
            <div className="text-neutral-500">none</div>
          )}
        </section>

        <section>
          <h3 className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
            <span>Chat attachments ({selectedFiles.length})</span>
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
          </h3>
          {selectedFiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 p-3 leading-relaxed text-neutral-500">
              Select files in the tree to attach them to your next chat
              message.
            </div>
          ) : (
            <ul className="space-y-1">
              {selectedFiles.map((p) => (
                <li
                  key={p}
                  className="truncate rounded bg-neutral-900/60 px-2 py-1 font-mono text-[10px] text-neutral-300"
                  title={p}
                >
                  {p.split("/").slice(-1)[0]}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
