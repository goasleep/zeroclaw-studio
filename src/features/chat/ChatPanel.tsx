// Chat/Code panel — session list + messages + composer.

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Brain,
  Check,
  CircleStop,
  Clipboard,
  Copy,
  Eye,
  FileText,
  FilePlus2,
  GitBranch,
  GitCompare,
  Loader2,
  Paperclip,
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
import { useChat, type ChatMessage } from "./use-chat";
import { useWorkspace } from "@/app/workspace-context";
import { useConnections } from "@/app/connection-context";
import { apiAgentWorkspaceList } from "@/api/client";
import {
  prepareChatAttachments,
  workspaceGitStatus,
  workspaceReadFile,
  type WorkspaceGitStatus,
} from "@/api/tauri";
import { readClipboardText } from "@/workspace/clipboard/clipboard";
import type { ChatMode, FileEntry } from "@/api/ws-chat";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

interface ContextAttachmentDraft {
  path: string;
  filename: string;
  mime: string;
  source: "file";
  status: "pending" | "too_large" | "ready";
  error?: string;
  embedBytes: boolean;
}

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
  if (["txt", "log", "rs", "ts", "tsx", "js", "jsx", "py", "toml", "yaml", "yml", "html", "css"].includes(ext)) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function formatBytes(size?: number) {
  if (size === undefined) return "size checked on send";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatPanel({
  agentAlias,
  mode = "chat",
  workspaceDir,
}: {
  agentAlias: string;
  mode?: ChatMode;
  workspaceDir?: string | null;
}) {
  const { active } = useConnections();
  const { root, selectedFiles, addFiles, clearSelection } = useWorkspace();
  const [cwd, setCwd] = useState(workspaceDir ?? "");
  const [appliedCwd, setAppliedCwd] = useState(workspaceDir ?? "");
  const [remoteEntries, setRemoteEntries] = useState<
    Array<{ path: string; name: string; isDir: boolean }> | null
  >(null);
  const [remoteBrowseAvailable, setRemoteBrowseAvailable] = useState(true);
  const chat = useChat({
    agentAlias,
    mode,
    workspaceDir: mode === "acp" ? appliedCwd || workspaceDir || null : null,
  });
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
    function focus() {
      textareaRef.current?.focus();
    }
    window.addEventListener("zeroclaw://quick-invoke", focus);
    return () => window.removeEventListener("zeroclaw://quick-invoke", focus);
  }, []);

  useEffect(() => {
    function selectSession(e: Event) {
      const sessionId = (e as CustomEvent<string>).detail;
      if (sessionId) chat.selectSession(sessionId);
    }
    window.addEventListener("zeroclaw://select-session", selectSession);
    return () =>
      window.removeEventListener("zeroclaw://select-session", selectSession);
  }, [chat.selectSession]);

  useEffect(() => {
    function newSession() {
      chat.newSession();
    }

    function refreshSessions() {
      void chat.refreshSessions();
    }

    window.addEventListener("zeroclaw://new-session", newSession);
    window.addEventListener("zeroclaw://refresh-sessions", refreshSessions);
    return () => {
      window.removeEventListener("zeroclaw://new-session", newSession);
      window.removeEventListener("zeroclaw://refresh-sessions", refreshSessions);
    };
  }, [chat.newSession, chat.refreshSessions]);

  useEffect(() => {
    if (!root) {
      setGitStatus(null);
      return;
    }
    let cancelled = false;
    void workspaceGitStatus(root)
      .then((status) => {
        if (!cancelled) setGitStatus(status);
      })
      .catch(() => {
        if (!cancelled) setGitStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

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

  async function previewFile(path: string) {
    setPreview({ path, content: "", loading: true });
    try {
      const content = await workspaceReadFile(path);
      setPreview({
        path,
        content:
          content.length > 80_000
            ? `${content.slice(0, 80_000)}\n\n[preview truncated]`
            : content,
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
      setComposerError("No active connection.");
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

  const isCode = mode === "acp";
  const remoteCode = isCode && active && active.transport !== "local";
  const currentSession = chat.sessions.find(
    (session) => session.session_id === chat.sessionId,
  );

  return (
    <div
      className="relative flex h-full min-h-0 overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-1.5 text-xs">
          {isCode ? (
            <TerminalSquare size={12} className="text-orange-400" />
          ) : (
            <Sparkles size={12} className="text-orange-400" />
          )}
          <span className="min-w-0 truncate text-neutral-300">
            {currentSession?.name ?? `New ${isCode ? "code" : "chat"}`}
          </span>
          <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {agentAlias}
          </span>
          <span
            className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${
              chat.connected
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {chat.connected ? "ws ready" : "connecting..."}
          </span>
          {remoteCode && (
            <div className="ml-2 flex min-w-0 flex-1 items-center gap-1">
              <input
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="Remote working directory"
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-orange-500"
              />
              <button
                type="button"
                onClick={() => setAppliedCwd(cwd)}
                className="rounded border border-neutral-800 px-2 py-1 text-[10px] text-neutral-300 hover:border-orange-500 hover:text-orange-300"
              >
                Apply
              </button>
              {remoteBrowseAvailable && (
                <button
                  type="button"
                  onClick={() => void browseRemoteWorkspace()}
                  className="rounded border border-neutral-800 px-2 py-1 text-[10px] text-neutral-300 hover:border-orange-500 hover:text-orange-300"
                >
                  Browse
                </button>
              )}
            </div>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void chat.abort()}
            className="flex items-center gap-1 text-neutral-400 hover:text-red-300"
            title="Abort current turn"
          >
            <CircleStop size={12} />
          </button>
          <button
            type="button"
            onClick={chat.clear}
            className="flex items-center gap-1 text-neutral-400 hover:text-orange-300"
            title="Clear local view"
          >
            <RotateCcw size={12} />
          </button>
        </header>

        {remoteCode && remoteEntries && remoteEntries.length > 0 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-800 px-3 py-1.5 text-[10px]">
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
                  className="shrink-0 rounded border border-neutral-800 px-2 py-1 font-mono text-neutral-400 hover:border-orange-500 hover:text-orange-300"
                  title={entry.path}
                >
                  {entry.name}
                </button>
              ))}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
          {chat.messages.length === 0 && (
            <p className="text-xs text-neutral-500">
              No messages yet. Type a message below, or attach files before
              sending.
            </p>
          )}
          {chat.messages.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              onApprove={chat.respondToApproval}
            />
          ))}
        </div>

        <footer className="border-t border-neutral-800 px-3 pb-3 pt-2">
          <GitContextSummary status={gitStatus} />
          <AttachmentStrip
            files={attachmentDrafts}
            onClear={clearSelection}
            onPreview={(path) => void previewFile(path)}
          />
          {composerError && (
            <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">
              {composerError}
            </div>
          )}
          <div className="flex items-end gap-2">
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
              rows={2}
              placeholder={`${isCode ? "Ask Code" : "Message"} ${agentAlias}...`}
              className="flex-1 resize-none rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-orange-500"
            />
            <button
              type="button"
              onClick={() => void pickFiles()}
              className="rounded border border-neutral-800 px-2 py-2 text-neutral-400 hover:border-orange-500 hover:text-orange-300"
              title="Add file attachment"
            >
              <FilePlus2 size={12} />
            </button>
            <button
              type="button"
              onClick={() => void pasteClipboard()}
              className="rounded border border-neutral-800 px-2 py-2 text-neutral-400 hover:border-orange-500 hover:text-orange-300"
              title="Paste clipboard into message"
            >
              <Clipboard size={12} />
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending}
              className="flex items-center gap-1 rounded bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-orange-400 disabled:opacity-50"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send
            </button>
          </div>
        </footer>
      </div>
      {preview && (
        <FilePreviewDialog preview={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function AttachmentStrip({
  files,
  onClear,
  onPreview,
}: {
  files: ContextAttachmentDraft[];
  onClear: () => void;
  onPreview: (path: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-2 rounded border border-neutral-800 bg-neutral-950/80 p-2 text-[10px]">
      <div className="mb-1 flex items-center gap-1 text-neutral-400">
        <Paperclip size={10} className="text-orange-400" />
        <span>
          {files.length} attachment{files.length === 1 ? "" : "s"}
        </span>
        <span className="text-neutral-600">drop files here or use the file button</span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-neutral-500 hover:text-red-300"
          title="Clear attachments"
        >
          <X size={10} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {files.map((file) => (
          <div
            key={file.path}
            className="group flex max-w-full items-center gap-1 rounded bg-neutral-900 px-1.5 py-1 font-mono text-neutral-300"
            title={file.path}
          >
            <FileText size={10} className="shrink-0 text-neutral-500" />
            <span className="max-w-40 truncate">{file.filename}</span>
            <span className="rounded bg-neutral-800 px-1 text-neutral-500">
              {file.embedBytes ? "bytes" : "path"}
            </span>
            <span className="text-neutral-600">{file.mime}</span>
            <span className="text-neutral-600">{formatBytes()}</span>
            <button
              type="button"
              onClick={() => onPreview(file.path)}
              className="ml-0.5 text-neutral-500 opacity-0 hover:text-orange-300 group-hover:opacity-100"
              title="Preview file"
            >
              <Eye size={10} />
            </button>
          </div>
        ))}
      </div>
      {files.length > 0 && (
        <p className="mt-1 text-[10px] text-neutral-600">
          Files over {formatBytes(MAX_ATTACHMENT_BYTES)} are rejected during send.
        </p>
      )}
    </div>
  );
}

function GitContextSummary({ status }: { status: WorkspaceGitStatus | null }) {
  if (!status?.is_repo) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-950/70 px-2 py-1.5 text-[10px] text-neutral-500">
      <GitBranch size={11} className="text-orange-400" />
      <span className="font-mono text-neutral-300">
        {status.branch ?? "detached"}
      </span>
      <span>{status.changed_count} changed</span>
      {status.diff_stat && (
        <span className="min-w-0 flex-1 truncate font-mono" title={status.diff_stat}>
          {status.diff_stat}
        </span>
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl">
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-2 text-xs">
          <FileText size={13} className="text-orange-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-neutral-200">
            {preview.path}
          </span>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(preview.path)}
            className="rounded px-1.5 py-1 text-neutral-500 hover:bg-neutral-900 hover:text-orange-300"
            title="Copy path"
          >
            <Copy size={12} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-1 text-neutral-500 hover:bg-neutral-900 hover:text-red-300"
          >
            <X size={12} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {preview.loading ? (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Loader2 size={13} className="animate-spin" />
              Loading preview...
            </div>
          ) : preview.error ? (
            <pre className="whitespace-pre-wrap text-xs text-red-300">
              {preview.error}
            </pre>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-300">
              {preview.content}
            </pre>
          )}
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
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-orange-500/15 text-neutral-100"
            : "bg-neutral-900/60 text-neutral-200"
        }`}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-neutral-400">
            {message.attachments.map((attachment) => (
              <span
                key={`${attachment.filename}-${attachment.mime_type}`}
                className="rounded bg-neutral-950 px-1.5 py-0.5 font-mono"
              >
                {attachment.filename}
                {attachment.size !== undefined && (
                  <span className="ml-1 text-neutral-600">
                    {formatBytes(attachment.size)}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {message.thinking && (
          <details className="mb-2 text-xs">
            <summary className="flex cursor-pointer items-center gap-1 text-neutral-500">
              <Brain size={10} />
              thinking
            </summary>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-neutral-950/60 p-2 text-[11px] text-neutral-400">
              {message.thinking}
            </pre>
          </details>
        )}

        {message.toolCalls.map((t, i) => (
          <div key={i} className="mb-2 rounded border border-neutral-800 bg-neutral-950/60 p-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-orange-300">
              <Wrench size={10} />
              <span className="font-mono">{t.name}</span>
              {t.result === undefined && (
                <Loader2 size={10} className="animate-spin text-neutral-500" />
              )}
            </div>
            {t.args !== undefined && (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-neutral-500">
                {JSON.stringify(t.args, null, 2)}
              </pre>
            )}
            {t.result !== undefined && (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-neutral-400">
                {typeof t.result === "string"
                  ? t.result
                  : JSON.stringify(t.result, null, 2)}
              </pre>
            )}
          </div>
        ))}

        {message.approval && (
          <div className="mb-2 overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs">
            <div className="border-b border-amber-500/20 px-3 py-2">
              <p className="flex items-center gap-1 font-medium text-amber-200">
                <GitCompare size={12} />
                Approval required
              </p>
              <p className="mt-1 text-neutral-300">
                Tool <code className="text-amber-300">{message.approval.tool}</code>{" "}
                wants to change local state. Review the preview before choosing a
                response.
              </p>
            </div>
            <div className="p-3">
            {message.approval.preview ? (
              <DiffPreviewBlock preview={message.approval.preview} />
            ) : (
              <pre className="mb-2 overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] text-neutral-400">
                {message.approval.arguments_summary}
              </pre>
            )}
            <div className="sticky bottom-0 flex gap-2 bg-amber-950/20 pt-2">
              <button
                type="button"
                onClick={() => onApprove(message.approval!.request_id, "approve")}
                className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-emerald-300 hover:bg-emerald-500/30"
              >
                <Check size={10} /> approve
              </button>
              <button
                type="button"
                onClick={() => onApprove(message.approval!.request_id, "always")}
                className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300 hover:bg-emerald-500/20"
                title="Always approve this request pattern for the current gateway policy"
              >
                always approve
              </button>
              <button
                type="button"
                onClick={() => onApprove(message.approval!.request_id, "deny")}
                className="flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-red-300 hover:bg-red-500/25"
              >
                <Trash2 size={10} /> deny
              </button>
            </div>
            </div>
          </div>
        )}

        {message.content && (
          <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-neutral-950 prose-pre:text-[12px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.cost_usd !== undefined && (
          <p className="mt-2 text-[10px] text-neutral-500">
            cost ${message.cost_usd.toFixed(4)}
          </p>
        )}
        {message.status === "error" && (
          <p className="mt-2 text-xs text-red-300">{message.error || "error"}</p>
        )}
        {message.status === "streaming" && (
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-orange-400" />
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
  const lines = useMemo(() => preview?.lines ?? [], [preview]);
  if (!preview) return null;
  return (
    <div className="mb-2 overflow-hidden rounded border border-neutral-800 bg-black/40">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400">
        <span className="min-w-0 flex-1 truncate">{preview.title}</span>
        {preview.path && (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(preview.path ?? "")}
            className="shrink-0 rounded px-1 py-0.5 text-neutral-500 hover:bg-neutral-900 hover:text-orange-300"
            title="Copy path"
          >
            <Copy size={10} />
          </button>
        )}
      </div>
      <pre className="max-h-72 overflow-auto p-2 text-[10px] leading-relaxed">
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
        <div className="border-t border-neutral-800 px-2 py-1 text-[10px] text-amber-300">
          Preview truncated to 400 lines.
        </div>
      )}
    </div>
  );
}
