import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLingui } from "@lingui/react/macro";
import {
  Bot,
  ChevronLeft,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { queryKeys } from "@/api/query";
import {
  agentWorkspaceCreateDir,
  agentWorkspaceCreateFile,
  agentWorkspaceDelete,
  agentWorkspaceListAgents,
  agentWorkspaceListDir,
  agentWorkspaceReadFile,
  agentWorkspaceWriteFile,
  type AgentWorkspaceAgent,
  type AgentWorkspaceEntry,
} from "@/api/tauri";
import { useConnections } from "@/app/connection-context";

const COMMON_FILES = ["IDENTITY.md", "SOUL.md", "HEARTBEAT.md"];
const EMPTY_AGENTS: AgentWorkspaceAgent[] = [];

export function AgentWorkspacePanel({ focusAlias = null }: { focusAlias?: string | null }) {
  const { t } = useLingui();
  const { active } = useConnections();
  const connectionId = active?.id ?? null;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [activeAlias, setActiveAlias] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savedDraft, setSavedDraft] = useState("");
  const [status, setStatus] = useState("");

  const agentsQuery = useQuery({
    queryKey: queryKeys.agentWorkspace.agents(connectionId),
    queryFn: agentWorkspaceListAgents,
    enabled: Boolean(connectionId),
  });

  const agents = agentsQuery.data ?? EMPTY_AGENTS;
  const focusedFromAgent = Boolean(focusAlias);
  const showAgentColumn = !focusedFromAgent;
  const filteredAgents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? agents.filter((agent) => agent.alias.toLowerCase().includes(q)) : agents;
  }, [agents, filter]);
  const activeAgent = agents.find((agent) => agent.alias === activeAlias) ?? null;

  useEffect(() => {
    if (agents.length === 0) {
      setActiveAlias(null);
      return;
    }
    if (focusAlias && agents.some((agent) => agent.alias === focusAlias)) {
      setActiveAlias(focusAlias);
      return;
    }
    if (!activeAlias || !agents.some((agent) => agent.alias === activeAlias)) {
      setActiveAlias(agents[0].alias);
    }
  }, [activeAlias, agents, focusAlias]);

  useEffect(() => {
    setCurrentDir("");
    setSelectedFile(null);
    setDraft("");
    setSavedDraft("");
    setStatus("");
  }, [activeAlias]);

  const entriesQuery = useQuery({
    queryKey: queryKeys.agentWorkspace.dir(connectionId, activeAlias, currentDir || null),
    queryFn: () => agentWorkspaceListDir(activeAlias ?? "", currentDir || null),
    enabled: Boolean(connectionId && activeAlias),
  });

  const fileQuery = useQuery({
    queryKey: queryKeys.agentWorkspace.file(connectionId, activeAlias, selectedFile),
    queryFn: () => agentWorkspaceReadFile(activeAlias ?? "", selectedFile ?? ""),
    enabled: Boolean(connectionId && activeAlias && selectedFile),
    retry: false,
  });

  useEffect(() => {
    if (fileQuery.data === undefined) return;
    setDraft(fileQuery.data);
    setSavedDraft(fileQuery.data);
    setStatus("");
  }, [fileQuery.data, selectedFile]);

  const invalidateAgentWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.agentWorkspace.agents(connectionId) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.agentWorkspace.dir(connectionId, activeAlias, currentDir || null),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.agentWorkspace.file(connectionId, activeAlias, selectedFile),
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeAlias || !selectedFile) return;
      await agentWorkspaceWriteFile(activeAlias, selectedFile, draft);
    },
    onSuccess: async () => {
      setSavedDraft(draft);
      setStatus(t`Saved`);
      await invalidateAgentWorkspace();
    },
  });

  const createFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      if (!activeAlias) return;
      await agentWorkspaceCreateFile(activeAlias, path, content);
      return path;
    },
    onSuccess: async (path) => {
      if (path) setSelectedFile(path);
      await invalidateAgentWorkspace();
    },
  });

  const createDirMutation = useMutation({
    mutationFn: async (path: string) => {
      if (!activeAlias) return;
      await agentWorkspaceCreateDir(activeAlias, path);
    },
    onSuccess: invalidateAgentWorkspace,
  });

  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      if (!activeAlias) return;
      await agentWorkspaceDelete(activeAlias, path);
      return path;
    },
    onSuccess: async (path) => {
      if (path === selectedFile || (path && selectedFile?.startsWith(`${path}/`))) {
        setSelectedFile(null);
        setDraft("");
        setSavedDraft("");
      }
      await invalidateAgentWorkspace();
    },
  });

  const dirty = draft !== savedDraft;
  const busy =
    saveMutation.isPending ||
    createFileMutation.isPending ||
    createDirMutation.isPending ||
    deleteMutation.isPending;

  function canLeaveFile() {
    return !dirty || window.confirm(t`Discard unsaved changes?`);
  }

  function chooseAgent(alias: string) {
    if (!canLeaveFile()) return;
    setActiveAlias(alias);
  }

  function backToAgentSelection() {
    if (!canLeaveFile()) return;
    window.dispatchEvent(new CustomEvent("zeroclaw://open-config-target", { detail: "agents" }));
  }

  function chooseDirectory(path: string) {
    if (!canLeaveFile()) return;
    setCurrentDir(path);
    setSelectedFile(null);
  }

  function chooseFile(path: string) {
    if (!canLeaveFile()) return;
    setSelectedFile(path);
  }

  function createFile() {
    if (!activeAlias) return;
    const name = window.prompt(t`New file`);
    if (!name?.trim()) return;
    const path = joinPath(currentDir, name.trim());
    createFileMutation.mutate({ path, content: "" });
  }

  function createDirectory() {
    if (!activeAlias) return;
    const name = window.prompt(t`New folder`);
    if (!name?.trim()) return;
    createDirMutation.mutate(joinPath(currentDir, name.trim()));
  }

  function deleteSelected() {
    if (!selectedFile) return;
    if (!window.confirm(t`Delete ${selectedFile}?`)) return;
    deleteMutation.mutate(selectedFile);
  }

  function openCommonFile(path: string) {
    if (!canLeaveFile()) return;
    setCurrentDir("");
    setSelectedFile(path);
  }

  return (
    <div
      className={`grid h-full min-h-0 overflow-hidden ${
        showAgentColumn
          ? "grid-cols-[280px_320px_minmax(0,1fr)]"
          : "grid-cols-[360px_minmax(0,1fr)]"
      }`}
    >
      {showAgentColumn && (
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#020818]/95">
          <header className="shrink-0 border-b border-white/10 p-3">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                <Bot size={15} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-neutral-100">
                  {t`Agent Workspace`}
                </h2>
                <p className="mt-0.5 truncate text-[10px] text-neutral-500">
                  {t`${agents.length} agents`}
                </p>
              </div>
            </div>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t`Search agents...`}
                className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-1.5 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
              />
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 zc-scrollbar">
            {agentsQuery.isLoading && <InlineLoading label={t`Loading agents...`} />}
            {agentsQuery.isError && <InlineError message={String(agentsQuery.error)} />}
            {agentsQuery.isSuccess && filteredAgents.length === 0 && (
              <p className="rounded-md border border-dashed border-white/10 p-3 text-xs text-neutral-500">
                {t`No agents match this search.`}
              </p>
            )}
            <div className="space-y-1">
              {filteredAgents.map((agent) => (
                <AgentButton
                  key={agent.alias}
                  agent={agent}
                  active={agent.alias === activeAlias}
                  onClick={() => chooseAgent(agent.alias)}
                />
              ))}
            </div>
          </div>
        </aside>
      )}

      <section className="flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#020818]/85">
        <header className="shrink-0 border-b border-white/10 p-3">
          <div className="mb-3 flex items-start gap-2">
            {focusedFromAgent && (
              <button
                type="button"
                onClick={backToAgentSelection}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2 py-1.5 text-xs text-neutral-400 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-200"
                title={t`Back to agents`}
                aria-label={t`Back to agents`}
              >
                <ChevronLeft size={13} />
                <Bot size={14} />
                <span>{t`Agents`}</span>
              </button>
            )}
            <FolderOpen size={15} className="mt-0.5 shrink-0 text-cyan-300" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-neutral-100">
                {activeAlias ?? t`No agent selected`}
              </h2>
              <p
                className="mt-0.5 truncate font-mono text-[10px] text-neutral-500"
                title={activeAgent?.workspace_path}
              >
                {activeAgent?.workspace_path ?? t`Workspace`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <IconButton label={t`New file`} onClick={createFile} disabled={!activeAlias || busy}>
              <Plus size={13} />
              <FileText size={13} />
            </IconButton>
            <IconButton
              label={t`New folder`}
              onClick={createDirectory}
              disabled={!activeAlias || busy}
            >
              <Plus size={13} />
              <Folder size={13} />
            </IconButton>
            <IconButton
              label={t`Refresh`}
              onClick={() => void entriesQuery.refetch()}
              disabled={!activeAlias || entriesQuery.isFetching}
            >
              <RefreshCw size={13} className={entriesQuery.isFetching ? "animate-spin" : ""} />
            </IconButton>
          </div>
        </header>

        <div className="shrink-0 border-b border-white/10 px-3 py-2">
          <div className="mb-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => chooseDirectory(parentPath(currentDir))}
              disabled={!currentDir}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/10 text-neutral-400 hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-35"
              title={t`Back`}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-400">
              /{currentDir}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {COMMON_FILES.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => openCommonFile(file)}
                className={`rounded border px-2 py-1 font-mono text-[10px] transition ${
                  selectedFile === file
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                    : "border-white/10 text-neutral-400 hover:border-cyan-400/35 hover:text-cyan-200"
                }`}
              >
                {file}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 zc-scrollbar">
          {!activeAlias && (
            <p className="rounded-md border border-dashed border-white/10 p-3 text-xs text-neutral-500">
              {t`No agent selected`}
            </p>
          )}
          {entriesQuery.isLoading && <InlineLoading label={t`Loading files...`} />}
          {entriesQuery.isError && <InlineError message={String(entriesQuery.error)} />}
          {entriesQuery.isSuccess && entriesQuery.data.length === 0 && (
            <p className="rounded-md border border-dashed border-white/10 p-3 text-xs text-neutral-500">
              {t`Empty directory`}
            </p>
          )}
          <div className="space-y-1">
            {(entriesQuery.data ?? []).map((entry) => (
              <EntryButton
                key={entry.path}
                entry={entry}
                active={entry.path === selectedFile}
                onOpen={() => (entry.isDir ? chooseDirectory(entry.path) : chooseFile(entry.path))}
                onDelete={() => {
                  if (window.confirm(t`Delete ${entry.path}?`)) deleteMutation.mutate(entry.path);
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <main className="flex min-h-0 min-w-0 flex-col bg-[#020818]/70">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <FileText size={15} className="text-cyan-300" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-mono text-sm font-semibold text-neutral-100">
              {selectedFile ?? t`Select a file`}
            </h2>
            <p className="mt-0.5 text-[10px] text-neutral-500">
              {dirty ? t`edited` : status || t`Ready`}
            </p>
          </div>
          <IconButton
            label={t`Save`}
            onClick={() => saveMutation.mutate()}
            disabled={!selectedFile || !dirty || busy}
          >
            {saveMutation.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
          </IconButton>
          <IconButton
            label={t`Revert`}
            onClick={() => setDraft(savedDraft)}
            disabled={!selectedFile || !dirty || busy}
          >
            <RotateCcw size={13} />
          </IconButton>
          <IconButton label={t`Delete`} onClick={deleteSelected} disabled={!selectedFile || busy}>
            <Trash2 size={13} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {!selectedFile ? (
            <EditorEmpty />
          ) : fileQuery.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <InlineLoading label={t`Loading preview...`} />
            </div>
          ) : fileQuery.isError ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                <div className="mb-3 flex items-start gap-2">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {String(fileQuery.error)}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    selectedFile &&
                    createFileMutation.mutate({
                      path: selectedFile,
                      content: "",
                    })
                  }
                  disabled={!selectedFile || busy}
                  className="inline-flex items-center gap-1 rounded border border-red-300/30 px-2 py-1 text-xs text-red-100 hover:border-red-200"
                >
                  <Plus size={12} />
                  {t`Create file`}
                </button>
              </div>
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setStatus("");
              }}
              spellCheck={false}
              className="h-full w-full resize-none overflow-auto bg-transparent p-4 font-mono text-xs leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 zc-scrollbar"
            />
          )}
        </div>
      </main>
    </div>
  );
}

function AgentButton({
  agent,
  active,
  onClick,
}: {
  agent: AgentWorkspaceAgent;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
        active
          ? "bg-cyan-400/10 text-cyan-100"
          : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
      }`}
    >
      <Bot size={13} className="shrink-0 text-cyan-300" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{agent.alias}</span>
        <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
          {agent.file_count} files
        </span>
      </span>
    </button>
  );
}

function EntryButton({
  entry,
  active,
  onOpen,
  onDelete,
}: {
  entry: AgentWorkspaceEntry;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 rounded-md transition ${
        active ? "bg-cyan-400/10 text-cyan-100" : "text-neutral-300 hover:bg-white/[0.05]"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
      >
        {entry.isDir ? (
          <Folder size={13} className="shrink-0 text-cyan-300" />
        ) : (
          <FileText size={13} className="shrink-0 text-neutral-400" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{entry.name}</span>
          {!entry.isDir && (
            <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
              {formatBytes(entry.size)}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-500 opacity-0 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
        title="Delete"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-white/10 px-2 text-xs text-neutral-300 transition hover:border-cyan-400/45 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35"
      title={label}
      aria-label={label}
    >
      {children}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function InlineLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-2 text-xs text-neutral-500">
      <Loader2 size={13} className="animate-spin" />
      {label}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <pre className="whitespace-pre-wrap font-mono">{message}</pre>
    </div>
  );
}

function EditorEmpty() {
  const { t } = useLingui();
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <FileText size={28} className="mx-auto mb-3 text-neutral-600" />
        <h2 className="text-sm font-medium text-neutral-200">{t`Select a file`}</h2>
      </div>
    </div>
  );
}

function joinPath(dir: string, name: string) {
  const cleanName = name.replace(/^\/+/, "");
  return dir ? `${dir.replace(/\/+$/, "")}/${cleanName}` : cleanName;
}

function parentPath(path: string) {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function formatBytes(size: number | null) {
  if (size == null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
