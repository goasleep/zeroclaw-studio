import {
  ChevronRight,
  FolderOpen,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useWorkspace } from "@/app/workspace-context";
import { useConnections } from "@/app/connection-context";
import type { NormalizedSession } from "@/features/chat/use-chat";
import type { WorkspacePage } from "./types";

interface WorkspaceSidebarProps {
  page: WorkspacePage;
  threads: NormalizedSession[];
  workspaceMap: Map<string, string>;
  activeThreadId: string | null;
  activeWorkspaceRoot: string | null;
  threadsLoading: boolean;
  threadError: string | null;
  onPage: (page: WorkspacePage) => void;
  onProject: (path: string) => void;
  onThread: (thread: NormalizedSession, workspaceRoot: string | null) => void;
  onNewThread: (workspaceRoot: string | null) => void;
  onRefreshThreads: () => void;
  onRenameThread: (sessionId: string, name: string) => void;
  onDeleteThread: (sessionId: string) => void;
  onPickRoot: () => void;
}

export function WorkspaceSidebar({
  page,
  threads,
  workspaceMap,
  activeThreadId,
  activeWorkspaceRoot,
  threadsLoading,
  threadError,
  onPage,
  onProject,
  onThread,
  onNewThread,
  onRefreshThreads,
  onRenameThread,
  onDeleteThread,
  onPickRoot,
}: WorkspaceSidebarProps) {
  const { t } = useLingui();
  const { root, recentRoots, selectedFiles } = useWorkspace();

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-white/[0.08] bg-[#020818]/90">
      <WorkspaceHeader />
      <ProjectList
        root={root}
        recentRoots={recentRoots}
        threads={threads}
        workspaceMap={workspaceMap}
        activeThreadId={activeThreadId}
        activeWorkspaceRoot={activeWorkspaceRoot}
        onPickRoot={onPickRoot}
        onRoot={onProject}
        onThread={onThread}
        onNewThread={onNewThread}
        onRename={onRenameThread}
        onDelete={onDeleteThread}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ThreadNav
          threads={threads.filter((thread) => !workspaceMap.has(thread.session_id))}
          activeThreadId={activeThreadId}
          loading={threadsLoading}
          error={threadError}
          selectedCount={selectedFiles.length}
          onThread={(thread) => onThread(thread, null)}
          onNewThread={() => onNewThread(null)}
          onRefresh={onRefreshThreads}
          onRename={onRenameThread}
          onDelete={onDeleteThread}
        />
      </div>

      <footer className="shrink-0 border-t border-white/10 p-2">
        <button
          type="button"
          onClick={() => onPage("settings")}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
            page === "settings"
              ? "bg-cyan-400/10 text-cyan-100"
              : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
          }`}
        >
          <Settings size={14} />
          <span className="min-w-0 flex-1 truncate">{t`Settings`}</span>
        </button>
      </footer>
    </aside>
  );
}

function WorkspaceHeader() {
  const { t } = useLingui();
  const { active } = useConnections();
  const { root } = useWorkspace();
  return (
    <header className="shrink-0 border-b border-white/[0.08] px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
        <FolderOpen size={12} className="text-cyan-300" />
        <span className="min-w-0 flex-1 truncate">{active?.name ?? t`Workspace`}</span>
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-neutral-600">
        {root ?? t`No workspace selected for this runtime.`}
      </div>
    </header>
  );
}

function ProjectList({
  root,
  recentRoots,
  threads,
  workspaceMap,
  activeThreadId,
  activeWorkspaceRoot,
  onPickRoot,
  onRoot,
  onThread,
  onNewThread,
  onRename,
  onDelete,
}: {
  root: string | null;
  recentRoots: string[];
  threads: NormalizedSession[];
  workspaceMap: Map<string, string>;
  activeThreadId: string | null;
  activeWorkspaceRoot: string | null;
  onPickRoot: () => void;
  onRoot: (path: string) => void;
  onThread: (thread: NormalizedSession, workspaceRoot: string | null) => void;
  onNewThread: (workspaceRoot: string | null) => void;
  onRename: (sessionId: string, name: string) => void;
  onDelete: (sessionId: string) => void;
}) {
  const { t } = useLingui();
  const visibleRoots = recentRoots.slice(0, 5);

  return (
    <section className="shrink-0 border-b border-white/[0.08] px-3 py-3">
      <div className="mb-2 flex items-center gap-1">
        <h2 className="min-w-0 flex-1 text-[10px] uppercase tracking-wide text-neutral-500">
          {t`Project`}
        </h2>
        <button
          type="button"
          onClick={onPickRoot}
          className="rounded p-1 text-neutral-500 hover:bg-white/[0.05] hover:text-cyan-300"
          title={t`Open project`}
        >
          <FolderOpen size={12} />
        </button>
      </div>
      {visibleRoots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-3">
          <p className="mb-2 text-xs leading-relaxed text-neutral-500">
            {t`No workspace selected for this runtime.`}
          </p>
          <button
            type="button"
            onClick={onPickRoot}
            className="text-left text-xs font-medium text-cyan-300 hover:text-cyan-200"
          >
            {t`Open project`}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRoots.map((path) => {
            const projectThreads = threads.filter(
              (thread) => workspaceMap.get(thread.session_id) === path,
            );
            return (
              <div key={path} className="min-w-0">
                <div className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onRoot(path)}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                      activeWorkspaceRoot === path
                        ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-50"
                        : "border-transparent text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                    }`}
                    title={path}
                  >
                    <FolderOpen size={13} className="shrink-0 text-cyan-300" />
                    <span className="min-w-0 flex-1 truncate">{basename(path)}</span>
                    {path === root && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNewThread(path)}
                    className="rounded p-1 text-neutral-600 opacity-0 transition hover:bg-white/[0.05] hover:text-cyan-300 group-hover:opacity-100"
                    title={t`New project session`}
                  >
                    <MessageSquarePlus size={11} />
                  </button>
                </div>
                {projectThreads.length > 0 && (
                  <div className="mt-1 space-y-0.5 border-l border-white/[0.06] pl-4 ml-3">
                    {projectThreads.slice(0, 5).map((thread) => (
                      <ThreadButton
                        key={thread.session_id}
                        thread={thread}
                        active={thread.session_id === activeThreadId}
                        compact
                        onSelect={() => onThread(thread, path)}
                        onRename={(name) => onRename(thread.session_id, name)}
                        onDelete={() => onDelete(thread.session_id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
  const { t } = useLingui();
  return (
    <section className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center gap-1">
        <h2 className="min-w-0 flex-1 text-[10px] uppercase tracking-wide text-neutral-500">
          {t`General Sessions`}
        </h2>
        <button
          type="button"
          onClick={onNewThread}
          className="rounded p-1 text-neutral-500 hover:bg-white/[0.05] hover:text-cyan-300"
          title={t`New general session`}
        >
          <MessageSquarePlus size={12} />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded p-1 text-neutral-500 hover:bg-white/[0.05] hover:text-cyan-300"
          title={t`Refresh sessions`}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {error && <p className="mb-2 text-[10px] text-red-300">{error}</p>}
      {threads.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs leading-relaxed text-neutral-500">
          {t`No general sessions yet.`}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-scroll overscroll-contain pr-1 [scrollbar-gutter:stable] zc-scrollbar">
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
      <div className="mt-3 shrink-0 rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1.5 text-[10px] text-neutral-500">
        {t`Attachments`}
        <span className="ml-1 text-neutral-300">{selectedCount}</span>
      </div>
    </section>
  );
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).slice(-1)[0] || path;
}

function ThreadButton({
  thread,
  active,
  compact = false,
  onSelect,
  onRename,
  onDelete,
}: {
  thread: NormalizedSession;
  active: boolean;
  compact?: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const messageCount =
    thread.message_count == null
      ? ""
      : thread.message_count === 1
        ? ` · ${t`${thread.message_count} message`}`
        : ` · ${t`${thread.message_count} messages`}`;

  if (compact) {
    return (
      <div
        className={`group flex min-w-0 items-center rounded-md text-xs transition ${
          active
            ? "bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-400/20"
            : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-200"
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left"
        >
          <span className="min-w-0 flex-1 truncate">{thread.name}</span>
          {active && <ChevronRight size={11} className="shrink-0" />}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => {
              const name = window.prompt(t`Rename session`, thread.name);
              if (name?.trim()) onRename(name.trim());
            }}
            className="rounded p-0.5 text-neutral-500 hover:text-cyan-300"
            title={t`Rename session`}
          >
            <Pencil size={9} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-0.5 text-neutral-600 hover:text-red-300"
            title={t`Delete session`}
          >
            <Trash2 size={9} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group rounded-md border ${
        active
          ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-50"
          : "border-transparent text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center gap-2 text-left text-xs ${
          compact ? "px-1.5 py-1" : "px-2 py-1.5"
        }`}
      >
        {!compact && <MessageSquare size={13} className="shrink-0 text-cyan-300" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{thread.name}</span>
          {!compact && (
            <span className="block truncate text-[10px] text-neutral-600">
              {thread.agent_alias ?? "default"}
              {messageCount}
            </span>
          )}
        </span>
        {active && <ChevronRight size={12} />}
      </button>
      <div className="flex items-center justify-end gap-1 px-1 pb-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => {
            const name = window.prompt(t`Rename session`, thread.name);
            if (name?.trim()) onRename(name.trim());
          }}
          className="rounded px-1 py-0.5 text-neutral-500 hover:text-cyan-300"
          title={t`Rename session`}
        >
          <Pencil size={10} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t`Delete session "${thread.name}"?`)) onDelete();
          }}
          className="rounded px-1 py-0.5 text-neutral-500 hover:text-red-300"
          title={t`Delete session`}
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}
