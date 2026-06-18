import {
  ChevronRight,
  FolderOpen,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Server,
  Settings,
  Trash2,
} from "lucide-react";
import { useConnections } from "@/app/connection-context";
import { useWorkspace } from "@/app/workspace-context";
import type { NormalizedSession } from "@/features/chat/use-chat";
import type { WorkspacePage } from "./types";

interface WorkspaceSidebarProps {
  page: WorkspacePage;
  threads: NormalizedSession[];
  activeThreadId: string | null;
  threadsLoading: boolean;
  threadError: string | null;
  onPage: (page: WorkspacePage) => void;
  onThread: (thread: NormalizedSession) => void;
  onNewThread: () => void;
  onRefreshThreads: () => void;
  onRenameThread: (sessionId: string, name: string) => void;
  onDeleteThread: (sessionId: string) => void;
  onPickRoot: () => void;
}

export function WorkspaceSidebar({
  page,
  threads,
  activeThreadId,
  threadsLoading,
  threadError,
  onPage,
  onThread,
  onNewThread,
  onRefreshThreads,
  onRenameThread,
  onDeleteThread,
  onPickRoot,
}: WorkspaceSidebarProps) {
  const { active, health } = useConnections();
  const { root, recentRoots, selectedFiles, setRoot } = useWorkspace();
  const online = active && health?.connection_id === active.id && health.healthy;

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-neutral-800 bg-neutral-950">
      <WorkspaceHeader
        root={root}
        connectionName={active?.name ?? null}
        online={Boolean(online)}
        onPickRoot={onPickRoot}
      />
      <ProjectList
        root={root}
        recentRoots={recentRoots}
        onPickRoot={onPickRoot}
        onRoot={(path) => void setRoot(path)}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ThreadNav
          threads={threads}
          activeThreadId={activeThreadId}
          loading={threadsLoading}
          error={threadError}
          selectedCount={selectedFiles.length}
          onThread={onThread}
          onNewThread={onNewThread}
          onRefresh={onRefreshThreads}
          onRename={onRenameThread}
          onDelete={onDeleteThread}
        />
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

function WorkspaceHeader({
  root,
  connectionName,
  online,
  onPickRoot,
}: {
  root: string | null;
  connectionName: string | null;
  online: boolean;
  onPickRoot: () => void;
}) {
  const workspaceName = root
    ? root.split("/").filter(Boolean).slice(-1)[0]
    : (connectionName ?? "Workspace");

  return (
    <header className="shrink-0 border-b border-neutral-800 p-3">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <FolderOpen size={14} className="shrink-0 text-orange-400" />
        <span>Workspace</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100"
          title={root ?? "no workspace"}
        >
          {workspaceName}
        </span>
        <button
          type="button"
          onClick={onPickRoot}
          className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:border-orange-500 hover:text-orange-300"
        >
          {root ? "Switch" : "Open"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-neutral-500">
        <Server size={11} className="text-neutral-600" />
        <span className="min-w-0 flex-1 truncate">
          {connectionName ?? "No runtime"}
        </span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-neutral-700"}`}
        />
      </div>
    </header>
  );
}

function ProjectList({
  root,
  recentRoots,
  onPickRoot,
  onRoot,
}: {
  root: string | null;
  recentRoots: string[];
  onPickRoot: () => void;
  onRoot: (path: string) => void;
}) {
  const visibleRoots = recentRoots.slice(0, 5);

  return (
    <section className="shrink-0 border-b border-neutral-800 p-3">
      <div className="mb-2 flex items-center gap-1">
        <h2 className="min-w-0 flex-1 text-[10px] uppercase tracking-wide text-neutral-500">
          Projects
        </h2>
        <button
          type="button"
          onClick={onPickRoot}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-900 hover:text-orange-300"
          title="Open project"
        >
          <FolderOpen size={12} />
        </button>
      </div>
      {visibleRoots.length === 0 ? (
        <button
          type="button"
          onClick={onPickRoot}
          className="w-full rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 p-3 text-left text-xs text-neutral-500 hover:border-orange-500/50 hover:text-orange-300"
        >
          Open a project
        </button>
      ) : (
        <div className="space-y-1">
          {visibleRoots.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => onRoot(path)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                path === root
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
              title={path}
            >
              <FolderOpen size={13} className="shrink-0 text-orange-400" />
              <span className="min-w-0 flex-1 truncate">
                {basename(path)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ThreadNav({
  threads,
  activeThreadId,
  loading,
  error,
  selectedCount,
  onThread,
  onNewThread,
  onRefresh,
  onRename,
  onDelete,
}: {
  threads: NormalizedSession[];
  activeThreadId: string | null;
  loading: boolean;
  error: string | null;
  selectedCount: number;
  onThread: (thread: NormalizedSession) => void;
  onNewThread: () => void;
  onRefresh: () => void;
  onRename: (sessionId: string, name: string) => void;
  onDelete: (sessionId: string) => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center gap-1">
        <h2 className="min-w-0 flex-1 text-[10px] uppercase tracking-wide text-neutral-500">
          Chats
        </h2>
        <button
          type="button"
          onClick={onNewThread}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-900 hover:text-orange-300"
          title="New chat"
        >
          <MessageSquarePlus size={12} />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-900 hover:text-orange-300"
          title="Refresh chats"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {error && <p className="mb-2 text-[10px] text-red-300">{error}</p>}
      {threads.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 p-3 text-xs leading-relaxed text-neutral-500">
          No chats yet.
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-scroll overscroll-contain pr-1 [scrollbar-gutter:stable]">
          {threads.map((thread) => (
            <ThreadButton
              key={thread.session_id}
              thread={thread}
              active={thread.session_id === activeThreadId}
              onSelect={() => onThread(thread)}
              onRename={(name) => onRename(thread.session_id, name)}
              onDelete={() => onDelete(thread.session_id)}
            />
          ))}
        </div>
      )}
      <div className="mt-3 shrink-0 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-[10px] text-neutral-500">
        Context
        <span className="ml-1 text-neutral-300">{selectedCount}</span>
      </div>
    </section>
  );
}

function basename(path: string) {
  return path.split("/").filter(Boolean).slice(-1)[0] || path;
}

function ThreadButton({
  thread,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  thread: NormalizedSession;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group rounded-md border ${
        active
          ? "border-orange-500/30 bg-neutral-800 text-neutral-100"
          : "border-transparent text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
      >
        <MessageSquare size={13} className="shrink-0 text-orange-400" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{thread.name}</span>
          <span className="block truncate text-[10px] text-neutral-600">
            {thread.agent_alias ?? "default"}
            {thread.message_count != null ? ` · ${thread.message_count} messages` : ""}
          </span>
        </span>
        {active && <ChevronRight size={12} />}
      </button>
      <div className="flex items-center justify-end gap-1 px-1 pb-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Rename chat", thread.name);
            if (name?.trim()) onRename(name.trim());
          }}
          className="rounded px-1 py-0.5 text-neutral-500 hover:text-orange-300"
          title="Rename chat"
        >
          <Pencil size={10} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete "${thread.name}"?`)) onDelete();
          }}
          className="rounded px-1 py-0.5 text-neutral-500 hover:text-red-300"
          title="Delete chat"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}
