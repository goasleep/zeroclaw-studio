// Main workspace shell — three resizable panes.
//
// Layout (left → right):
//   - Sidebar: workspace root picker + file tree + feature nav
//   - Center: tabbed view (Phase 4 will hang chat here)
//   - Inspector: selected file context, attachments queued for chat,
//     misc per-feature side panels.

import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
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
} from "lucide-react";
import { useConnections } from "@/app/connection-context";
import { useWorkspace } from "@/app/workspace-context";
import { FileTree } from "@/workspace/files/FileTree";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { apiStatus } from "@/api/client";
import { Trash2 } from "lucide-react";

type Tab =
  | "chat"
  | "memory"
  | "config"
  | "cron"
  | "tools"
  | "logs"
  | "doctor";

const TABS: Array<{ id: Tab; label: string; icon: typeof Bot }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "memory", label: "Memory", icon: Database },
  { id: "config", label: "Config", icon: Cog },
  { id: "cron", label: "Cron", icon: ListChecks },
  { id: "tools", label: "Tools", icon: Bot },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "doctor", label: "Doctor", icon: Server },
];

export function WorkspaceShell() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize={20} minSize={14} maxSize={40}>
        <Sidebar tab={tab} onTab={setTab} />
      </Panel>
      <Separator className="w-px bg-neutral-800 hover:bg-orange-500/40" />
      <Panel defaultSize={55} minSize={30}>
        <Center tab={tab} />
      </Panel>
      <Separator className="w-px bg-neutral-800 hover:bg-orange-500/40" />
      <Panel defaultSize={25} minSize={15} maxSize={45}>
        <Inspector />
      </Panel>
    </Group>
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
    <aside className="flex h-full flex-col border-r border-neutral-800 bg-neutral-950">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 text-xs">
        <FolderOpen size={12} className="text-orange-400" />
        <span className="flex-1 truncate text-neutral-400" title={root ?? "no workspace"}>
          {root ? root.split("/").slice(-1)[0] : "No workspace"}
        </span>
        <button
          type="button"
          onClick={() => void pickRoot()}
          className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:border-orange-500"
        >
          {root ? "Change" : "Open"}
        </button>
      </header>

      <nav className="border-b border-neutral-800 py-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={`flex w-full items-center gap-2 px-3 py-1 text-xs ${
              tab === t.id ? "bg-orange-500/10 text-orange-200" : "text-neutral-300 hover:bg-neutral-900"
            }`}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto">
        {root ? (
          <FileTree />
        ) : (
          <div className="px-3 py-4 text-xs text-neutral-500">
            Open a folder to see its files here. Multi-select files to send
            them as chat attachments.
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
    void apiStatus()
      .then((s) => {
        const aliases = Object.keys((s.agents as Record<string, unknown>) ?? {});
        setAgents(aliases);
        if (aliases.length > 0 && !activeAgent) setActiveAgent(aliases[0]);
      })
      .catch(() => setAgents([]));
  }, [tab, activeAgent]);

  if (tab === "chat") {
    if (agents.length === 0) {
      return (
        <section className="flex h-full items-center justify-center bg-neutral-950">
          <p className="px-8 text-center text-xs text-neutral-500">
            No agents configured on the active gateway yet.<br />
            Set one up via Config → Agents (Phase 6) or with{" "}
            <code className="text-neutral-300">zeroclaw quickstart</code>.
          </p>
        </section>
      );
    }
    return (
      <section className="flex h-full flex-col bg-neutral-950">
        <header className="flex items-center gap-1 border-b border-neutral-800 px-2 py-1 text-xs">
          {agents.map((alias) => (
            <button
              key={alias}
              type="button"
              onClick={() => setActiveAgent(alias)}
              className={`rounded px-2 py-1 ${
                activeAgent === alias
                  ? "bg-orange-500/15 text-orange-200"
                  : "text-neutral-400 hover:bg-neutral-900"
              }`}
            >
              {alias}
            </button>
          ))}
        </header>
        <div className="flex-1 overflow-hidden">
          {activeAgent && <ChatPanel agentAlias={activeAgent} />}
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col bg-neutral-950">
      <header className="border-b border-neutral-800 px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">
        {tab}
      </header>
      <div className="flex-1 overflow-auto p-6 text-sm text-neutral-300">
        <PlaceholderPanel tab={tab} />
      </div>
    </section>
  );
}

function Inspector() {
  const { selectedFiles, clearSelection } = useWorkspace();
  const { active } = useConnections();

  return (
    <aside className="flex h-full flex-col border-l border-neutral-800 bg-neutral-950 text-xs">
      <header className="border-b border-neutral-800 px-3 py-2 uppercase tracking-wide text-neutral-400">
        Context
      </header>
      <div className="flex-1 overflow-auto p-3">
        <section className="mb-4">
          <h3 className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
            Active connection
          </h3>
          {active ? (
            <div className="font-mono text-neutral-300">
              <div>{active.name}</div>
              <div className="truncate text-[10px] text-neutral-500">{active.url}</div>
            </div>
          ) : (
            <div className="text-neutral-500">none</div>
          )}
        </section>

        <section>
          <h3 className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
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
            <div className="text-neutral-500">
              Select files in the tree to attach them to your next chat message.
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

function PlaceholderPanel({ tab }: { tab: Tab }) {
  return (
    <div className="space-y-2 text-neutral-400">
      <p>
        <strong className="text-neutral-200">{tab}</strong> panel.
      </p>
      <p className="text-xs text-neutral-500">
        Phase 4 wires up chat (streaming WS + tool calls + approvals). Phase 6
        replicates memory, config, cron, tools, logs, and doctor.
      </p>
    </div>
  );
}
