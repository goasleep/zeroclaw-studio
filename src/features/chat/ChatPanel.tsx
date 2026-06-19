// Chat/Code panel — session list + messages + composer.

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Clipboard,
  Copy,
  Eye,
  FileText,
  FilePlus2,
  FolderOpen,
  GitCompare,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useChat, type ChatMessage, type ChatModelOverride } from "./use-chat";
import { useWorkspace } from "@/app/workspace-context";
import { useConnections } from "@/app/connection-context";
import { apiAgentWorkspaceList } from "@/api/tools";
import { apiConfigList, type ConfigListEntry } from "@/api/config";
import { apiQuickstartState } from "@/api/quickstart";
import {
  chatCapabilities,
  prepareChatAttachments,
  workspaceGitStatus,
  workspaceReadFile,
  type WorkspaceGitStatus,
} from "@/api/tauri";
import { readClipboardText } from "@/workspace/clipboard/clipboard";
import { Dialog } from "@/ui/dialog";
import { Select } from "@/ui/select";
import type { ChatMode, FileEntry } from "@/api/ws-chat";

interface ContextAttachmentDraft {
  path: string;
  filename: string;
  mime: string;
  source: "file";
  status: "pending" | "too_large" | "ready";
  error?: string;
  embedBytes: boolean;
}

const MODEL_FOLLOWS_AGENT = "__agent__";

type ConfiguredModelChoice = {
  value: string;
  model?: string;
};

function filenameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function mimeFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["png"].includes(ext)) return "image/png";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (["gif"].includes(ext)) return "image/gif";
  if (["webp"].includes(ext)) return "image/webp";
  if (["svg"].includes(ext)) return "image/svg+xml";
  if (ext === "pdf") return "application/pdf";
  if (ext === "json") return "application/json";
  if (ext === "csv") return "text/csv";
  if (["md", "markdown"].includes(ext)) return "text/markdown";
  if (
    [
      "txt",
      "log",
      "rs",
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "toml",
      "yaml",
      "yml",
      "html",
      "css",
    ].includes(ext)
  ) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function modelOverrideFor(value: string): ChatModelOverride | null {
  return value === MODEL_FOLLOWS_AGENT ? null : { modelProvider: value };
}

function configuredModelChoices(providerRefs: string[], entries: ConfigListEntry[]) {
  const byRef = new Map<string, ConfiguredModelChoice>();
  for (const ref of providerRefs) {
    if (ref.trim()) byRef.set(ref, { value: ref });
  }
  for (const entry of entries) {
    const parts = entry.path.split(".");
    if (parts.length < 5 || parts[0] !== "providers" || parts[1] !== "models") continue;
    const ref = `${parts[2]}.${parts[3]}`;
    const existing = byRef.get(ref) ?? { value: ref };
    if (parts.slice(4).join(".") === "model" && typeof entry.value === "string") {
      existing.model = entry.value;
    }
    byRef.set(ref, existing);
  }
  return Array.from(byRef.values()).sort((a, b) => a.value.localeCompare(b.value));
}

function formatBytes(size?: number) {
  if (size === undefined) return "size checked on send";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type ToolCallView = ChatMessage["toolCalls"][number];

function valueFromKeys(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const current = record[key];
    if (typeof current === "string" && current.trim()) return current.trim();
  }
  return null;
}

function compactText(value: unknown, max = 110) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const singleLine = raw.replace(/\s+/g, " ").trim();
  return singleLine.length > max ? `${singleLine.slice(0, max - 3)}...` : singleLine;
}

function stringifyValue(value: unknown) {
  if (value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function formatToolCallSummary(toolCall: ToolCallView) {
  const args = toolCall.args;
  const command = valueFromKeys(args, ["command", "cmd", "shell", "script"]);
  if (command) return command;
  const path = valueFromKeys(args, ["path", "file", "filename", "target", "root"]);
  if (path) return path;
  const query = valueFromKeys(args, ["query", "pattern", "url"]);
  if (query) return query;
  if (args !== undefined) return compactText(args);
  return toolCall.name;
}

function isErrorLikeOutput(output: unknown) {
  const text = compactText(output, 180).toLowerCase();
  return (
    text.includes("error") ||
    text.includes("failed") ||
    text.includes("denied") ||
    text.includes("not found")
  );
}

function buildExecutionRows(toolCalls: ToolCallView[]) {
  return toolCalls.map((toolCall, index) => ({
    id: `${toolCall.name}-${index}`,
    toolCall,
    summary: formatToolCallSummary(toolCall),
    status:
      toolCall.result === undefined
        ? "running"
        : isErrorLikeOutput(toolCall.result)
          ? "warning"
          : "done",
  }));
}

export function ChatPanel({
  agentAlias,
  agents,
  onAgentChange,
  mode = "chat",
  workspaceRoot = null,
  onWorkspaceRoot,
  workspaceDir,
}: {
  agentAlias: string;
  agents: string[];
  onAgentChange: (agent: string) => void;
  mode?: ChatMode;
  workspaceRoot?: string | null;
  onWorkspaceRoot?: (path: string | null) => void;
  workspaceDir?: string | null;
}) {
  const { t } = useLingui();
  const { active } = useConnections();
  const { recentRoots, selectedFiles, addFiles, clearSelection, setRoot } = useWorkspace();
  const [cwd, setCwd] = useState(workspaceDir ?? "");
  const [appliedCwd, setAppliedCwd] = useState(workspaceDir ?? "");
  const [remoteEntries, setRemoteEntries] = useState<Array<{
    path: string;
    name: string;
    isDir: boolean;
  }> | null>(null);
  const [remoteBrowseAvailable, setRemoteBrowseAvailable] = useState(true);
  const chat = useChat({
    agentAlias,
    mode,
    workspaceRoot,
    workspaceDir: mode === "acp" ? appliedCwd || workspaceDir || null : null,
  });
  const { selectSession, newSession, refreshSessions } = chat;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    path: string;
    content: string;
    error?: string;
    loading: boolean;
  } | null>(null);
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [maxAttachmentBytes, setMaxAttachmentBytes] = useState<number | null>(null);
  const [modelChoices, setModelChoices] = useState<ConfiguredModelChoice[]>([]);
  const [selectedModelProvider, setSelectedModelProvider] = useState(MODEL_FOLLOWS_AGENT);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentDrafts = useMemo<ContextAttachmentDraft[]>(
    () =>
      selectedFiles.map((path) => ({
        path,
        filename: filenameFromPath(path),
        mime: mimeFromPath(path),
        source: "file",
        status: "pending",
        embedBytes: Boolean(active && active.transport !== "local"),
      })),
    [active, selectedFiles],
  );

  useEffect(() => {
    setCwd(workspaceDir ?? "");
    setAppliedCwd(workspaceDir ?? "");
  }, [workspaceDir]);

  useEffect(() => {
    let cancelled = false;
    void chatCapabilities()
      .then((capabilities) => {
        if (!cancelled) setMaxAttachmentBytes(capabilities.max_attachment_bytes);
      })
      .catch(() => {
        if (!cancelled) setMaxAttachmentBytes(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiQuickstartState().catch(() => null),
      apiConfigList("providers.models").catch(() => ({ entries: [] as ConfigListEntry[] })),
    ]).then(([quickstart, config]) => {
      if (cancelled) return;
      setModelChoices(configuredModelChoices(quickstart?.model_providers ?? [], config.entries));
    });
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  useEffect(() => {
    if (
      selectedModelProvider !== MODEL_FOLLOWS_AGENT &&
      !modelChoices.some((choice) => choice.value === selectedModelProvider)
    ) {
      setSelectedModelProvider(MODEL_FOLLOWS_AGENT);
    }
  }, [modelChoices, selectedModelProvider]);

  useEffect(() => {
    function focus() {
      textareaRef.current?.focus();
    }
    window.addEventListener("zeroclaw://quick-invoke", focus);
    return () => window.removeEventListener("zeroclaw://quick-invoke", focus);
  }, []);

  useEffect(() => {
    function handleSelectSession(e: Event) {
      const sessionId = (e as CustomEvent<string>).detail;
      if (sessionId) selectSession(sessionId);
    }
    window.addEventListener("zeroclaw://select-session", handleSelectSession);
    return () => window.removeEventListener("zeroclaw://select-session", handleSelectSession);
  }, [selectSession]);

  useEffect(() => {
    function startNewSession() {
      newSession(modelOverrideFor(selectedModelProvider));
    }

    function reloadSessions() {
      void refreshSessions();
    }

    window.addEventListener("zeroclaw://new-session", startNewSession);
    window.addEventListener("zeroclaw://refresh-sessions", reloadSessions);
    return () => {
      window.removeEventListener("zeroclaw://new-session", startNewSession);
      window.removeEventListener("zeroclaw://refresh-sessions", reloadSessions);
    };
  }, [newSession, refreshSessions, selectedModelProvider]);

  useEffect(() => {
    if (!workspaceRoot) {
      setGitStatus(null);
      return;
    }
    let cancelled = false;
    void workspaceGitStatus(workspaceRoot)
      .then((status) => {
        if (!cancelled) setGitStatus(status);
      })
      .catch(() => {
        if (!cancelled) setGitStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot]);

  async function pasteClipboard() {
    const t = await readClipboardText();
    if (!t) return;
    setDraft((d) => (d ? `${d}\n\n${t}` : t));
  }

  async function pickFiles() {
    const chosen = await openDialog({ multiple: true, directory: false });
    const paths = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    addFiles(paths.filter((path): path is string => typeof path === "string"));
  }

  async function pickWorkspaceRoot() {
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen !== "string") return;
    await setRoot(chosen);
    onWorkspaceRoot?.(chosen);
    setWorkspaceMenuOpen(false);
  }

  async function selectWorkspaceRoot(path: string | null) {
    if (path) {
      await setRoot(path);
    }
    onWorkspaceRoot?.(path);
    setWorkspaceMenuOpen(false);
  }

  async function previewFile(path: string) {
    setPreview({ path, content: "", loading: true });
    try {
      const content = await workspaceReadFile(path);
      setPreview({
        path,
        content:
          content.length > 80_000 ? `${content.slice(0, 80_000)}\n\n[preview truncated]` : content,
        loading: false,
      });
    } catch (e) {
      setPreview({
        path,
        content: "",
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const paths = Array.from(e.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (paths.length > 0) addFiles(paths);
  }

  async function browseRemoteWorkspace() {
    setRemoteBrowseAvailable(true);
    try {
      const resp = await apiAgentWorkspaceList(agentAlias, cwd || undefined);
      setRemoteEntries(
        resp.entries.map((entry) => ({
          path: entry.path,
          name: entry.name ?? entry.path.split("/").filter(Boolean).pop() ?? entry.path,
          isDir: Boolean(entry.is_dir ?? entry.isDir),
        })),
      );
    } catch {
      setRemoteBrowseAvailable(false);
      setRemoteEntries(null);
    }
  }

  async function submit() {
    const trimmed = draft.trim();
    if (!trimmed && selectedFiles.length === 0) return;
    if (!active) {
      setComposerError(t`No active connection.`);
      return;
    }
    setSending(true);
    setComposerError(null);
    try {
      const prepared =
        selectedFiles.length > 0
          ? await prepareChatAttachments({
              paths: selectedFiles,
              connection_id: active.id,
            })
          : [];
      const attachments: FileEntry[] = prepared.map((entry) => ({
        path: entry.path,
        data_b64: entry.data_b64,
        filename: entry.filename,
        mime_type: entry.mime_type,
        size: entry.size,
        source: entry.source === "clipboard" ? "clipboard" : "file",
      }));
      chat.send(trimmed, attachments);
      setDraft("");
      clearSelection();
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function applySuggestedPrompt(prompt: string) {
    setDraft(prompt);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function changeModelProvider(value: string) {
    setSelectedModelProvider(value);
    if (!hasMessages) {
      newSession(modelOverrideFor(value));
    }
  }

  const isCode = mode === "acp";
  const remoteCode = isCode && active && active.transport !== "local";
  const currentSession = chat.sessions.find((session) => session.session_id === chat.sessionId);
  const hasMessages = chat.messages.length > 0;
  const selectedModelChoice = modelChoices.find((choice) => choice.value === selectedModelProvider);
  const agentOptions = agents.map((agent) => ({ value: agent, label: agent }));
  const modelOptions = [
    { value: MODEL_FOLLOWS_AGENT, label: t`Agent default` },
    ...modelChoices.map((choice) => ({
      value: choice.value,
      label: choice.model ? `${choice.value} · ${choice.model}` : choice.value,
    })),
  ];
  const workspaceName = workspaceRoot ? filenameFromPath(workspaceRoot) : t`No project`;
  const sessionName = currentSession?.name ?? (isCode ? t`New code` : t`New session`);
  const gitLabel =
    gitStatus?.is_repo && gitStatus.branch
      ? t`${gitStatus.branch} · ${gitStatus.changed_count} changed`
      : gitStatus?.is_repo
        ? t`${gitStatus.changed_count} changed`
        : t`No git status`;
  const contextScope = workspaceRoot ? filenameFromPath(workspaceRoot) : t`general`;
  const contextGit =
    gitStatus?.is_repo && gitStatus.branch
      ? t`${gitStatus.branch} · ${gitStatus.changed_count} changed`
      : gitStatus?.is_repo
        ? t`${gitStatus.changed_count} changed`
        : t`no git status`;
  const contextAttachments =
    attachmentDrafts.length === 1 ? t`1 attachment` : t`${attachmentDrafts.length} attachments`;
  const composerContext = t`Context: ${contextScope} · ${contextAttachments} · ${contextGit}`;
  const suggestedPrompts = [
    t`Review current changes`,
    t`Explain this project`,
    t`Find likely bugs`,
    t`Run diagnostics`,
  ];
  const renderComposer = (variant: "center" | "footer") => (
    <div
      className={
        variant === "center"
          ? "rounded-xl border border-white/10 bg-[#020818]/90 shadow-2xl shadow-black/30"
          : ""
      }
    >
      <div className={variant === "center" ? "p-3" : undefined}>
        <ContextSummaryBar label={composerContext} />
        <AttachmentStrip
          files={attachmentDrafts}
          maxAttachmentBytes={maxAttachmentBytes}
          onClear={clearSelection}
          onPreview={(path) => void previewFile(path)}
        />
        {composerError && (
          <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">
            {composerError}
          </div>
        )}
        <div className={variant === "center" ? "flex min-h-36 flex-col" : "flex flex-col gap-2"}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={variant === "center" ? 4 : 2}
            placeholder={
              variant === "center" ? t`Start this session...` : t`Continue this session...`
            }
            className={
              variant === "center"
                ? "min-h-20 flex-1 resize-none bg-transparent px-2 py-1 text-base text-neutral-100 outline-none placeholder:text-neutral-600"
                : "min-h-16 w-full resize-none rounded border border-white/10 bg-[#020818]/90 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            }
          />
          <div
            className={
              variant === "center"
                ? "mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2"
                : "flex flex-wrap items-center gap-2"
            }
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen((open) => !open)}
                className={`flex max-w-64 items-center gap-2 rounded border px-2 py-2 text-xs transition ${
                  workspaceRoot
                    ? "border-white/10 text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
                    : "border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:border-cyan-300"
                }`}
                title={workspaceRoot ?? t`No project`}
              >
                <FolderOpen size={13} />
                <span className="min-w-0 truncate">
                  {workspaceRoot ? t`Project: ${workspaceName}` : t`Open project`}
                </span>
                <ChevronDown size={12} className="shrink-0" />
              </button>
              {workspaceMenuOpen && (
                <div className="absolute bottom-11 left-0 z-20 w-72 overflow-hidden rounded-lg border border-white/10 bg-[#020818]/95 py-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => void selectWorkspaceRoot(null)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                      !workspaceRoot
                        ? "bg-white/[0.05] text-neutral-100"
                        : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
                    }`}
                  >
                    <FolderOpen size={12} className="text-neutral-500" />
                    <span className="min-w-0 flex-1 truncate">{t`General session`}</span>
                  </button>
                  {recentRoots.slice(0, 8).map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => void selectWorkspaceRoot(path)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                        workspaceRoot === path
                          ? "bg-white/[0.05] text-neutral-100"
                          : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
                      }`}
                      title={path}
                    >
                      <FolderOpen size={12} className="text-cyan-300" />
                      <span className="min-w-0 flex-1 truncate">{filenameFromPath(path)}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void pickWorkspaceRoot()}
                    className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-left text-xs text-cyan-300 hover:bg-white/[0.05]"
                  >
                    <FilePlus2 size={12} />
                    <span className="min-w-0 flex-1 truncate">{t`Open project...`}</span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void pickFiles()}
              className="rounded border border-white/10 px-2 py-2 text-neutral-400 hover:border-cyan-400 hover:text-cyan-300"
              title={t`Add file attachment`}
            >
              <FilePlus2 size={12} />
            </button>
            <button
              type="button"
              onClick={() => void pasteClipboard()}
              className="rounded border border-white/10 px-2 py-2 text-neutral-400 hover:border-cyan-400 hover:text-cyan-300"
              title={t`Paste clipboard into message`}
            >
              <Clipboard size={12} />
            </button>
            <div className="flex-1" />
            <Select
              value={agentAlias}
              options={agentOptions}
              onValueChange={onAgentChange}
              placeholder={t`Agent`}
              className="h-8 w-36 max-w-[44vw] border-white/10 bg-white/[0.04] py-0 text-[11px]"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending}
              className="flex items-center gap-1 rounded bg-sky-400 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {t`Send`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="relative flex h-full min-h-0 overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-white/10 px-3 py-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <FolderOpen
              size={12}
              className={workspaceRoot ? "text-cyan-300" : "text-neutral-600"}
            />
            <span className="min-w-0 truncate font-medium text-neutral-100">
              {t`Project:`} {workspaceRoot ? workspaceName : t`No project`}
            </span>
            <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-neutral-500">
              {gitLabel}
            </span>
            <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-neutral-400">
              {t`Agent:`} {agentAlias}
            </span>
            <Select
              value={selectedModelProvider}
              options={modelOptions}
              onValueChange={changeModelProvider}
              placeholder={t`Model`}
              className="h-6 max-w-64 border-white/10 bg-white/[0.04] py-0 text-[10px]"
            />
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                chat.connected
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-white/[0.08] text-neutral-500"
              }`}
            >
              {chat.connected ? t`Online` : t`Connecting`}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => newSession(modelOverrideFor(selectedModelProvider))}
              className="flex items-center gap-1 text-neutral-400 hover:text-cyan-300"
              title={
                selectedModelChoice
                  ? t`New session with ${selectedModelChoice.value}`
                  : t`New session`
              }
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              onClick={() => void chat.abort()}
              className="flex items-center gap-1 text-neutral-400 hover:text-red-300"
              title={t`Abort current turn`}
            >
              <CircleStop size={12} />
            </button>
            <button
              type="button"
              onClick={chat.clear}
              className="flex items-center gap-1 text-neutral-400 hover:text-cyan-300"
              title={t`Clear local view`}
            >
              <RotateCcw size={12} />
            </button>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-neutral-500">
            {isCode ? (
              <TerminalSquare size={11} className="text-cyan-300" />
            ) : (
              <Sparkles size={11} className="text-cyan-300" />
            )}
            <span className="min-w-0 truncate">
              {t`Session:`} {sessionName}
            </span>
          </div>
          {remoteCode && (
            <div className="mt-2 flex min-w-0 items-center gap-1">
              <input
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder={t`Remote working directory`}
                className="min-w-0 flex-1 rounded border border-white/10 bg-[#020818]/90 px-2 py-1 font-mono text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setAppliedCwd(cwd)}
                className="rounded border border-white/10 px-2 py-1 text-[10px] text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
              >
                {t`Apply`}
              </button>
              {remoteBrowseAvailable && (
                <button
                  type="button"
                  onClick={() => void browseRemoteWorkspace()}
                  className="rounded border border-white/10 px-2 py-1 text-[10px] text-neutral-300 hover:border-cyan-400 hover:text-cyan-300"
                >
                  {t`Browse`}
                </button>
              )}
            </div>
          )}
        </header>

        {remoteCode && remoteEntries && remoteEntries.length > 0 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-3 py-1.5 text-[10px] zc-scrollbar">
            {remoteEntries
              .filter((entry) => entry.isDir)
              .slice(0, 24)
              .map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => {
                    setCwd(entry.path);
                    setAppliedCwd(entry.path);
                  }}
                  className="shrink-0 rounded border border-white/10 px-2 py-1 font-mono text-neutral-400 hover:border-cyan-400 hover:text-cyan-300"
                  title={entry.path}
                >
                  {entry.name}
                </button>
              ))}
          </div>
        )}

        <div
          className={
            hasMessages
              ? "flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm zc-scrollbar"
              : "flex flex-1 items-center justify-center overflow-y-auto px-6 py-10 zc-scrollbar"
          }
        >
          {!hasMessages && (
            <div className="w-full max-w-4xl">
              <h1 className="mb-6 text-center text-3xl font-medium tracking-normal text-neutral-100">
                {t`What do you want to work on in this session?`}
              </h1>
              {!workspaceRoot && (
                <div className="mx-auto mb-4 flex max-w-xl items-center justify-center">
                  <button
                    type="button"
                    onClick={() => void pickWorkspaceRoot()}
                    className="flex items-center gap-2 rounded border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 hover:border-cyan-300"
                  >
                    <FolderOpen size={14} />
                    {t`Open Project`}
                  </button>
                </div>
              )}
              {renderComposer("center")}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => applySuggestedPrompt(prompt)}
                    className="rounded border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-neutral-300 transition hover:border-cyan-400 hover:text-cyan-300"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map((m) => (
            <MessageRow key={m.id} message={m} onApprove={chat.respondToApproval} />
          ))}
        </div>

        {hasMessages && (
          <footer className="border-t border-white/10 px-3 pb-3 pt-2">
            {renderComposer("footer")}
          </footer>
        )}
      </div>
      {preview && <FilePreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function AttachmentStrip({
  files,
  maxAttachmentBytes,
  onClear,
  onPreview,
}: {
  files: ContextAttachmentDraft[];
  maxAttachmentBytes: number | null;
  onClear: () => void;
  onPreview: (path: string) => void;
}) {
  const { t } = useLingui();
  if (files.length === 0) return null;
  return (
    <div className="mb-2 rounded border border-white/10 bg-[#020818]/80 p-2 text-[10px]">
      <div className="mb-1 flex items-center gap-1 text-neutral-400">
        <Paperclip size={10} className="text-cyan-300" />
        <span>{files.length === 1 ? t`1 attachment` : t`${files.length} attachments`}</span>
        <span className="text-neutral-600">{t`drop files here or use the file button`}</span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-neutral-500 hover:text-red-300"
          title={t`Clear attachments`}
        >
          <X size={10} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {files.map((file) => (
          <div
            key={file.path}
            className="group flex max-w-full items-center gap-1 rounded bg-white/[0.05] px-1.5 py-1 font-mono text-neutral-300"
            title={file.path}
          >
            <FileText size={10} className="shrink-0 text-neutral-500" />
            <span className="max-w-40 truncate">{file.filename}</span>
            <span className="rounded bg-white/[0.08] px-1 text-neutral-500">
              {file.embedBytes ? t`bytes` : t`path`}
            </span>
            <span className="text-neutral-600">{file.mime}</span>
            <span className="text-neutral-600">{formatBytes()}</span>
            <button
              type="button"
              onClick={() => onPreview(file.path)}
              className="ml-0.5 text-neutral-500 opacity-0 hover:text-cyan-300 group-hover:opacity-100"
              title={t`Preview file`}
            >
              <Eye size={10} />
            </button>
          </div>
        ))}
      </div>
      {files.length > 0 && (
        <p className="mt-1 text-[10px] text-neutral-600">
          {maxAttachmentBytes === null
            ? t`Files are checked during send.`
            : t`Files over ${formatBytes(maxAttachmentBytes)} are rejected during send.`}
        </p>
      )}
    </div>
  );
}

function FilePreviewDialog({
  preview,
  onClose,
}: {
  preview: { path: string; content: string; error?: string; loading: boolean };
  onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <Dialog open title={preview.path} onOpenChange={(open) => !open && onClose()}>
      <div className="flex max-h-[82vh] w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#020818]/90 shadow-2xl">
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 text-xs">
          <FileText size={13} className="text-cyan-300" />
          <span className="min-w-0 flex-1 truncate font-mono text-neutral-200">{preview.path}</span>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(preview.path)}
            className="rounded px-1.5 py-1 text-neutral-500 hover:bg-white/[0.05] hover:text-cyan-300"
            title={t`Copy path`}
          >
            <Copy size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-1 text-neutral-500 hover:bg-white/[0.05] hover:text-red-300"
          >
            <X size={12} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3 zc-scrollbar">
          {preview.loading ? (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Loader2 size={13} className="animate-spin" />
              {t`Loading preview...`}
            </div>
          ) : preview.error ? (
            <pre className="whitespace-pre-wrap text-xs text-red-300">{preview.error}</pre>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-300">
              {preview.content}
            </pre>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ContextSummaryBar({ label }: { label: string }) {
  return (
    <div className="mb-2 flex min-w-0 items-center gap-2 rounded border border-white/10 bg-[#020818]/70 px-2 py-1.5 text-[10px] text-neutral-500">
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  );
}

function ExecutionStream({ toolCalls }: { toolCalls: ToolCallView[] }) {
  const { t } = useLingui();
  const rows = buildExecutionRows(toolCalls);
  if (rows.length === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-white/10 bg-[#020818]/55 text-xs">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-neutral-400">
        <Wrench size={12} className="text-cyan-300" />
        <span className="font-medium text-neutral-300">{t`Execution`}</span>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {rows.map(({ id, toolCall, summary, status }) => (
          <div key={id} className="px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              {status === "running" ? (
                <Loader2 size={12} className="shrink-0 animate-spin text-cyan-300" />
              ) : status === "warning" ? (
                <AlertTriangle size={12} className="shrink-0 text-amber-300" />
              ) : (
                <CheckCircle2 size={12} className="shrink-0 text-emerald-300" />
              )}
              <span className="shrink-0 font-mono text-[11px] text-neutral-300">
                {toolCall.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-neutral-500" title={summary}>
                {summary}
              </span>
            </div>
            {(toolCall.args !== undefined || toolCall.result !== undefined) && (
              <details className="mt-1 pl-5 text-[10px] text-neutral-500">
                <summary className="cursor-pointer hover:text-neutral-300">{t`raw details`}</summary>
                {toolCall.args !== undefined && (
                  <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-[#020818]/80 p-2 zc-scrollbar">
                    {stringifyValue(toolCall.args)}
                  </pre>
                )}
                {toolCall.result !== undefined && (
                  <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-[#020818]/80 p-2 text-neutral-400 zc-scrollbar">
                    {stringifyValue(toolCall.result)}
                  </pre>
                )}
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({
  approval,
  toolCalls,
  onApprove,
}: {
  approval: NonNullable<ChatMessage["approval"]>;
  toolCalls: ToolCallView[];
  onApprove: (request_id: string, decision: "approve" | "deny" | "always") => void;
}) {
  const { t } = useLingui();
  const recentArgs = [...toolCalls]
    .reverse()
    .find((toolCall) => toolCall.name === approval.tool)?.args;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs">
      <div className="border-b border-amber-500/20 px-3 py-2">
        <p className="flex items-center gap-1 font-medium text-amber-200">
          <GitCompare size={12} />
          {t`Approval required`}
        </p>
        <p className="mt-1 text-neutral-300">
          {t`Tool`} <code className="text-amber-300">{approval.tool}</code>{" "}
          {t`requires approval before the agent can continue.`}
        </p>
        {approval.timeout_secs !== undefined && (
          <p className="mt-1 text-[10px] text-neutral-500">
            {t`Auto-denies after ${approval.timeout_secs}s without a response.`}
          </p>
        )}
      </div>
      <div className="p-3">
        <div className="mb-2 rounded border border-white/10 bg-[#020818]/75 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{t`Summary`}</div>
          <pre className="whitespace-pre-wrap text-[11px] text-neutral-300 zc-scrollbar">
            {approval.arguments_summary}
          </pre>
        </div>
        {approval.preview && (
          <div className="mb-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{t`Preview`}</div>
            <DiffPreviewBlock preview={approval.preview} />
          </div>
        )}
        {recentArgs !== undefined && (
          <details className="mb-2 text-[10px] text-neutral-500">
            <summary className="cursor-pointer hover:text-neutral-300">{t`tool input`}</summary>
            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-[#020818]/80 p-2 zc-scrollbar">
              {stringifyValue(recentArgs)}
            </pre>
          </details>
        )}
        <div className="sticky bottom-0 flex flex-wrap gap-2 bg-amber-950/20 pt-2">
          <button
            type="button"
            onClick={() => onApprove(approval.request_id, "approve")}
            className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 font-medium text-emerald-300 hover:bg-emerald-500/30"
          >
            <Check size={10} /> {t`Approve once`}
          </button>
          <button
            type="button"
            onClick={() => onApprove(approval.request_id, "deny")}
            className="flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-red-300 hover:bg-red-500/25"
          >
            <Trash2 size={10} /> {t`Reject`}
          </button>
          <button
            type="button"
            onClick={() => onApprove(approval.request_id, "always")}
            className="rounded border border-emerald-500/20 px-2 py-1 text-emerald-300 hover:bg-emerald-500/10"
            title={t`Allow this tool for the current gateway session policy`}
          >
            {t`Always allow`}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  onApprove,
}: {
  message: ChatMessage;
  onApprove: (request_id: string, decision: "approve" | "deny" | "always") => void;
}) {
  const { t } = useLingui();
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-cyan-400/10 text-neutral-100" : "bg-white/[0.06] text-neutral-200"
        }`}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-neutral-400">
            {message.attachments.map((attachment) => (
              <span
                key={`${attachment.filename}-${attachment.mime_type}`}
                className="rounded bg-[#020818]/90 px-1.5 py-0.5 font-mono"
              >
                {attachment.filename}
                {attachment.size !== undefined && (
                  <span className="ml-1 text-neutral-600">{formatBytes(attachment.size)}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {message.thinking && (
          <details className="mb-2 text-xs">
            <summary className="flex cursor-pointer items-center gap-1 text-neutral-500">
              <Brain size={10} />
              {t`thinking`}
            </summary>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-[#020818]/60 p-2 text-[11px] text-neutral-400">
              {message.thinking}
            </pre>
          </details>
        )}

        <ExecutionStream toolCalls={message.toolCalls} />

        {message.approval && (
          <ApprovalCard
            approval={message.approval}
            toolCalls={message.toolCalls}
            onApprove={onApprove}
          />
        )}

        {message.content && (
          <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[#020818]/90 prose-pre:text-[12px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.cost_usd !== undefined && (
          <p className="mt-2 text-[10px] text-neutral-500">
            {t`cost`} ${message.cost_usd.toFixed(4)}
          </p>
        )}
        {message.status === "error" && (
          <p className="mt-2 text-xs text-red-300">{message.error || t`error`}</p>
        )}
        {message.status === "streaming" && (
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
        )}
      </div>
    </div>
  );
}

function DiffPreviewBlock({
  preview,
}: {
  preview: NonNullable<ChatMessage["approval"]>["preview"];
}) {
  const { t } = useLingui();
  const lines = useMemo(() => preview?.lines ?? [], [preview]);
  if (!preview) return null;
  return (
    <div className="mb-2 overflow-hidden rounded border border-white/10 bg-[#020818]/80">
      <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1 font-mono text-[10px] text-neutral-400">
        <span className="min-w-0 flex-1 truncate">{preview.title}</span>
        {preview.path && (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(preview.path ?? "")}
            className="shrink-0 rounded px-1 py-0.5 text-neutral-500 hover:bg-white/[0.05] hover:text-cyan-300"
            title={t`Copy path`}
          >
            <Copy size={10} />
          </button>
        )}
      </div>
      <pre className="max-h-72 overflow-auto p-2 text-[10px] leading-relaxed zc-scrollbar">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={
              line.type === "add"
                ? "text-emerald-300"
                : line.type === "remove"
                  ? "text-red-300"
                  : "text-neutral-500"
            }
          >
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            {line.text}
          </div>
        ))}
      </pre>
      {preview.truncated && (
        <div className="border-t border-white/10 px-2 py-1 text-[10px] text-amber-300">
          {t`Preview truncated to 400 lines.`}
        </div>
      )}
    </div>
  );
}
