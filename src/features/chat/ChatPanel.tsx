// Chat/Code panel — session list + messages + composer.

import { useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Brain,
  Check,
  CircleStop,
  Clipboard,
  FilePlus2,
  GitCompare,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  RefreshCw,
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
import { useChat, type ChatMessage, type NormalizedSession } from "./use-chat";
import { useWorkspace } from "@/app/workspace-context";
import { useConnections } from "@/app/connection-context";
import { apiAgentWorkspaceList } from "@/api/client";
import { prepareChatAttachments } from "@/api/tauri";
import { readClipboardText } from "@/workspace/clipboard/clipboard";
import type { ChatMode, FileEntry } from "@/api/ws-chat";

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
  const { selectedFiles, clearSelection, toggleFile } = useWorkspace();
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  async function pasteClipboard() {
    const t = await readClipboardText();
    if (!t) return;
    setDraft((d) => (d ? `${d}\n\n${t}` : t));
  }

  async function pickFiles() {
    const chosen = await openDialog({ multiple: true, directory: false });
    const paths = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    for (const path of paths) {
      if (typeof path === "string" && !selectedFiles.includes(path)) {
        toggleFile(path);
      }
    }
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

  return (
    <div className="grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)]">
      <SessionRail
        sessions={chat.sessions}
        activeSessionId={chat.sessionId}
        loading={chat.sessionsLoading}
        error={chat.sessionError}
        onRefresh={() => void chat.refreshSessions()}
        onNew={chat.newSession}
        onSelect={chat.selectSession}
        onRename={(id, name) => void chat.renameSession(id, name)}
        onDelete={(id) => void chat.deleteSession(id)}
      />

      <div className="flex min-w-0 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-1.5 text-xs">
          {isCode ? (
            <TerminalSquare size={12} className="text-orange-400" />
          ) : (
            <Sparkles size={12} className="text-orange-400" />
          )}
          <span className="text-neutral-300">
            {isCode ? "Code" : "Chat"} / {agentAlias}
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
          <AttachmentStrip files={selectedFiles} onClear={clearSelection} />
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
    </div>
  );
}

function SessionRail({
  sessions,
  activeSessionId,
  loading,
  error,
  onRefresh,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: {
  sessions: NormalizedSession[];
  activeSessionId: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNew: () => void;
  onSelect: (sessionId: string | null) => void;
  onRename: (sessionId: string, name: string) => void;
  onDelete: (sessionId: string) => void;
}) {
  return (
    <aside className="flex min-w-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <header className="shrink-0 border-b border-neutral-800 p-2">
        <div className="mb-2 flex items-center gap-1">
          <button
            type="button"
            onClick={onNew}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-orange-500/15 px-2 py-1.5 text-xs text-orange-200 hover:bg-orange-500/25"
          >
            <MessageSquarePlus size={12} />
            New
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-neutral-800 px-2 py-1.5 text-neutral-400 hover:border-orange-500 hover:text-orange-300"
            title="Refresh sessions"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        {error && <p className="text-[10px] text-red-300">{error}</p>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && !loading ? (
          <p className="rounded border border-dashed border-neutral-800 bg-neutral-900/30 p-3 text-xs text-neutral-500">
            No saved sessions.
          </p>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <SessionButton
                key={session.session_id}
                session={session}
                active={session.session_id === activeSessionId}
                onSelect={() => onSelect(session.session_id)}
                onRename={(name) => onRename(session.session_id, name)}
                onDelete={() => onDelete(session.session_id)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function SessionButton({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  session: NormalizedSession;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group rounded-md border ${
        active
          ? "border-orange-500/30 bg-orange-500/10"
          : "border-transparent hover:bg-neutral-900"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full min-w-0 px-2 py-2 text-left"
      >
        <span className="block truncate text-xs text-neutral-200">
          {session.name}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
          {session.session_id}
        </span>
      </button>
      <div className="flex items-center justify-end gap-1 px-1 pb-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Rename session", session.name);
            if (name?.trim()) onRename(name.trim());
          }}
          className="rounded px-1 py-0.5 text-neutral-500 hover:text-orange-300"
          title="Rename"
        >
          <Pencil size={10} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete "${session.name}"?`)) onDelete();
          }}
          className="rounded px-1 py-0.5 text-neutral-500 hover:text-red-300"
          title="Delete"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}

function AttachmentStrip({
  files,
  onClear,
}: {
  files: string[];
  onClear: () => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 text-[10px]">
      <Paperclip size={10} className="text-orange-400" />
      <span className="text-neutral-400">
        {files.length} attachment{files.length === 1 ? "" : "s"}:
      </span>
      {files.slice(0, 5).map((p) => (
        <span
          key={p}
          className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-300"
          title={p}
        >
          {p.split("/").slice(-1)[0]}
        </span>
      ))}
      {files.length > 5 && (
        <span className="text-neutral-500">+{files.length - 5} more</span>
      )}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 text-neutral-500 hover:text-red-300"
        title="Clear attachments"
      >
        <X size={10} />
      </button>
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
          <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <p className="mb-2 flex items-center gap-1 font-medium text-amber-200">
              <GitCompare size={12} />
              Approval required
            </p>
            <p className="mb-2 text-neutral-300">
              Tool <code className="text-amber-300">{message.approval.tool}</code>{" "}
              wants to run.
            </p>
            {message.approval.preview ? (
              <DiffPreviewBlock preview={message.approval.preview} />
            ) : (
              <pre className="mb-2 overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] text-neutral-400">
                {message.approval.arguments_summary}
              </pre>
            )}
            <div className="flex gap-2">
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
              >
                always
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
      <div className="border-b border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400">
        {preview.title}
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
    </div>
  );
}
