// Chat/Code panel — session list + messages + composer.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Copy, FileText, FolderOpen, Loader2, Sparkles, TerminalSquare, X } from "lucide-react";
import { useChat, type ChatModelOverride } from "./use-chat";
import { useWorkspace } from "@/app/workspace-context";
import { useConnections } from "@/app/connection-context";
import { apiAgentWorkspaceList } from "@/api/tools";
import { apiConfigList, type ConfigListEntry } from "@/api/config";
import { apiQuickstartState } from "@/api/quickstart";
import { chatCapabilities, prepareChatAttachments, type WorkspaceGitStatus } from "@/api/tauri";
import {
  isLocalWorkspaceConnection,
  validateWorkspaceRoot,
  workspaceAdapterGitStatus,
  workspaceAdapterReadFile,
} from "@/api/workspace";
import { readClipboardText } from "@/workspace/clipboard/clipboard";
import { Dialog } from "@/ui/dialog";
import type { ChatMode, FileEntry } from "@/api/ws-chat";
import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { MODEL_FOLLOWS_AGENT, type ConfiguredModelChoice } from "./ModelOverrideSelect";
import { SessionControls } from "./SessionControls";
import {
  CLIENT_MAX_ATTACHMENT_REQUEST_BYTES,
  CLIENT_MAX_CLIPBOARD_ATTACHMENT_BYTES,
  addClipboardAttachments,
  clipboardFilePaths,
  clipboardFiles,
  clipboardPathFromFile,
  fileExtensionForMime,
  filePathsFromUriList,
  fileToClipboardAttachment,
  filenameFromPath,
  formatBytes,
  mimeFromPath,
  totalAttachmentBytes,
  useAttachments,
  type ClipboardAttachment,
} from "./use-attachments";

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
  const connectionId = active?.id ?? null;
  const [cwd, setCwd] = useState(workspaceDir ?? "");
  const [appliedCwd, setAppliedCwd] = useState(workspaceDir ?? "");
  const [remoteEntries, setRemoteEntries] = useState<Array<{
    path: string;
    name: string;
    isDir: boolean;
  }> | null>(null);
  const [remoteBrowseAvailable, setRemoteBrowseAvailable] = useState(true);
  const chat = useChat({
    connectionId: connectionId ?? "",
    agentAlias,
    mode,
    workspaceRoot,
    workspaceDir: appliedCwd || workspaceDir || workspaceRoot || null,
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
  const [maxAttachmentRequestBytes, setMaxAttachmentRequestBytes] = useState<number | null>(null);
  const [modelChoices, setModelChoices] = useState<ConfiguredModelChoice[]>([]);
  const [selectedModelProvider, setSelectedModelProvider] = useState(MODEL_FOLLOWS_AGENT);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messageBottomRef = useRef<HTMLDivElement | null>(null);
  const { attachmentDrafts, clipboardAttachments, setClipboardAttachments, clearAttachments } =
    useAttachments({
      active,
      selectedFiles,
      clearSelection,
    });

  useEffect(() => {
    setCwd(workspaceDir ?? "");
    setAppliedCwd(workspaceDir ?? "");
  }, [workspaceDir]);

  useEffect(() => {
    let cancelled = false;
    void chatCapabilities()
      .then((capabilities) => {
        if (!cancelled) {
          setMaxAttachmentBytes(capabilities.max_attachment_bytes);
          setMaxAttachmentRequestBytes(capabilities.max_attachment_request_bytes);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMaxAttachmentBytes(null);
          setMaxAttachmentRequestBytes(null);
        }
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
    if (chat.messages.length === 0) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      messageBottomRef.current?.scrollIntoView({ block: "end" });
      secondFrame = window.requestAnimationFrame(() => {
        messageBottomRef.current?.scrollIntoView({ block: "end" });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [chat.messages]);

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
    if (!active || !workspaceRoot) {
      setGitStatus(null);
      return;
    }
    let cancelled = false;
    void workspaceAdapterGitStatus(active, workspaceRoot)
      .then((status) => {
        if (!cancelled) setGitStatus(status);
      })
      .catch(() => {
        if (!cancelled) setGitStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active, workspaceRoot]);

  async function pasteClipboard() {
    const text = await readClipboardText();
    const paths = filePathsFromUriList(text);
    if (paths.length > 0) {
      addFiles(paths);
      setComposerError(attachmentTotalLimitError(clipboardAttachments));
      return;
    }

    const clipboardFiles = await readClipboardFilesFromNavigator();
    if (clipboardFiles.length > 0) {
      const nextAttachments = addClipboardAttachments(clipboardAttachments, clipboardFiles);
      setClipboardAttachments(nextAttachments);
      setComposerError(attachmentTotalLimitError(nextAttachments));
      return;
    }

    if (text) setDraft((d) => (d ? `${d}\n\n${text}` : text));
  }

  async function readClipboardFilesFromNavigator() {
    if (!navigator.clipboard?.read) return [];
    try {
      const items = await navigator.clipboard.read();
      const attachments: ClipboardAttachment[] = [];
      const limit = maxAttachmentBytes ?? CLIENT_MAX_CLIPBOARD_ATTACHMENT_BYTES;
      let index = 1;
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("text/")) continue;
          const blob = await item.getType(type);
          const file = new File([blob], `clipboard-${index}.${fileExtensionForMime(type)}`, {
            type,
          });
          attachments.push(await fileToClipboardAttachment(file, limit, `clipboard-${index}`));
          index += 1;
        }
      }
      return attachments;
    } catch {
      return [];
    }
  }

  async function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const paths = clipboardFilePaths(e.clipboardData);
    const files = clipboardFiles(e.clipboardData).filter((file) => !clipboardPathFromFile(file));
    if (paths.length === 0 && files.length === 0) return;

    e.preventDefault();
    if (paths.length > 0) addFiles(paths);
    if (files.length === 0) {
      setComposerError(attachmentTotalLimitError(clipboardAttachments));
      return;
    }

    const limit = maxAttachmentBytes ?? CLIENT_MAX_CLIPBOARD_ATTACHMENT_BYTES;
    const attachments: ClipboardAttachment[] = [];
    const rejected: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      try {
        attachments.push(
          await fileToClipboardAttachment(files[index], limit, `clipboard-${index + 1}`),
        );
      } catch (err) {
        rejected.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (attachments.length > 0) {
      const nextAttachments = addClipboardAttachments(clipboardAttachments, attachments);
      setClipboardAttachments(nextAttachments);
      const limitError = attachmentTotalLimitError(nextAttachments);
      if (limitError) rejected.push(limitError);
    }
    setComposerError(rejected.length > 0 ? rejected.join("\n") : null);
  }

  async function pickFiles() {
    const chosen = await openDialog({ multiple: true, directory: false });
    const paths = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    addFiles(paths.filter((path): path is string => typeof path === "string"));
  }

  async function pickWorkspaceRoot() {
    if (!active) return;
    if (!isLocalWorkspaceConnection(active)) {
      const typed = window.prompt(t`Remote working directory`, workspaceRoot ?? cwd ?? "");
      if (!typed) return;
      const canonical = await validateWorkspaceRoot(active, typed);
      await setRoot(canonical);
      onWorkspaceRoot?.(canonical);
      setCwd(canonical);
      setAppliedCwd(canonical);
      setWorkspaceMenuOpen(false);
      return;
    }
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
      if (!active || !workspaceRoot) throw new Error(t`No active workspace.`);
      const content = await workspaceAdapterReadFile(active, workspaceRoot, path);
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

  function attachmentTotalLimitError(files: Array<{ size?: number | null }>) {
    const totalSize = totalAttachmentBytes(files);
    const totalLimit = maxAttachmentRequestBytes ?? CLIENT_MAX_ATTACHMENT_REQUEST_BYTES;
    if (totalSize <= totalLimit) return null;
    return t`Attachments total ${formatBytes(totalSize)} exceeds upload limit ${formatBytes(totalLimit)}.`;
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

  async function applyWorkingDirectory() {
    const next = cwd.trim();
    if (!next) {
      setAppliedCwd("");
      onWorkspaceRoot?.(null);
      return;
    }
    if (active && !isLocalWorkspaceConnection(active)) {
      const canonical = await validateWorkspaceRoot(active, next);
      await setRoot(canonical);
      onWorkspaceRoot?.(canonical);
      setCwd(canonical);
      setAppliedCwd(canonical);
      return;
    }
    await setRoot(next);
    onWorkspaceRoot?.(next);
    setAppliedCwd(next);
  }

  async function submit() {
    const trimmed = draft.trim();
    if (!trimmed && selectedFiles.length === 0 && clipboardAttachments.length === 0) return;
    if (!active) {
      setComposerError(t`No active connection.`);
      return;
    }
    setSending(true);
    setComposerError(null);
    try {
      const prepared =
        selectedFiles.length > 0 && isLocalWorkspaceConnection(active)
          ? await prepareChatAttachments({
              paths: selectedFiles,
              connection_id: active.id,
            })
          : [];
      const attachments: FileEntry[] = [
        ...prepared.map<FileEntry>((entry) => ({
          path: entry.path,
          data_b64: entry.data_b64,
          filename: entry.filename,
          mime_type: entry.mime_type,
          size: entry.size,
          source: entry.source === "clipboard" ? "clipboard" : "file",
        })),
        ...(!isLocalWorkspaceConnection(active)
          ? selectedFiles.map<FileEntry>((path) => ({
              path,
              filename: filenameFromPath(path),
              mime_type: mimeFromPath(path),
              source: "file",
            }))
          : []),
        ...clipboardAttachments.map<FileEntry>(({ id: _id, ...entry }) => entry),
      ];
      const limitError = attachmentTotalLimitError(attachments);
      if (limitError) throw new Error(limitError);
      chat.send(trimmed, attachments);
      setDraft("");
      clearAttachments();
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function changeModelProvider(value: string) {
    setSelectedModelProvider(value);
    if (!hasMessages) {
      newSession(modelOverrideFor(value));
    }
  }

  function openAgentConfig() {
    if (!agentAlias) return;
    window.dispatchEvent(new CustomEvent("zeroclaw://open-agent-config", { detail: agentAlias }));
  }

  function openAgentWorkspace() {
    if (!agentAlias) return;
    window.dispatchEvent(
      new CustomEvent("zeroclaw://open-agent-workspace", { detail: agentAlias }),
    );
  }

  const isCode = mode === "acp";
  const remoteCode = isCode && active && active.transport !== "local";
  const currentSession = chat.sessions.find((session) => session.session_id === chat.sessionId);
  const hasMessages = chat.messages.length > 0;
  const selectedModelChoice = modelChoices.find((choice) => choice.value === selectedModelProvider);
  const agentOptions = agents.map((agent) => ({ value: agent, label: agent }));
  const workspaceName = workspaceRoot ? filenameFromPath(workspaceRoot) : t`No project`;
  const sessionName = currentSession?.name ?? (isCode ? t`New code` : t`New session`);
  const gitLabel =
    gitStatus?.is_repo && gitStatus.branch
      ? t`${gitStatus.branch} · ${gitStatus.changed_count} changed`
      : gitStatus?.is_repo
        ? t`${gitStatus.changed_count} changed`
        : null;
  const renderComposer = (variant: "center" | "footer") => (
    <ChatComposer
      variant={variant}
      files={attachmentDrafts}
      maxAttachmentBytes={maxAttachmentBytes}
      maxAttachmentRequestBytes={maxAttachmentRequestBytes}
      onClearAttachments={clearAttachments}
      onPreviewFile={(path) => void previewFile(path)}
      composerError={composerError}
      textareaRef={textareaRef}
      draft={draft}
      onDraft={setDraft}
      onPaste={(event) => void handlePaste(event)}
      onSubmit={() => void submit()}
      workspaceMenuOpen={workspaceMenuOpen}
      onWorkspaceMenuOpen={setWorkspaceMenuOpen}
      workspaceRoot={workspaceRoot}
      workspaceName={workspaceName}
      recentRoots={recentRoots}
      onSelectWorkspaceRoot={(path) => void selectWorkspaceRoot(path)}
      onPickWorkspaceRoot={() => void pickWorkspaceRoot()}
      onPickFiles={() => void pickFiles()}
      onPasteClipboard={() => void pasteClipboard()}
      hasMessages={hasMessages}
      agentAlias={agentAlias}
      agentOptions={agentOptions}
      onAgentChange={onAgentChange}
      sending={sending}
    />
  );

  return (
    <div
      className="relative flex h-full min-h-0 overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-white/[0.08] px-4 py-2.5 text-xs">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {isCode ? (
                <TerminalSquare size={13} className="shrink-0 text-cyan-300" />
              ) : (
                <Sparkles size={13} className="shrink-0 text-cyan-300" />
              )}
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-neutral-100">
                  <span className="truncate">{workspaceRoot ? workspaceName : t`General`}</span>
                  <span className="shrink-0 text-neutral-600">/</span>
                  <span className="truncate text-neutral-300">{sessionName}</span>
                </div>
                {gitLabel && (
                  <div className="mt-0.5 truncate font-mono text-[10px] text-neutral-500">
                    {gitLabel}
                  </div>
                )}
              </div>
            </div>
            <SessionControls
              selectedModelProvider={selectedModelProvider}
              selectedModelChoice={selectedModelChoice}
              modelChoices={modelChoices}
              onModelChange={changeModelProvider}
              agentAlias={agentAlias}
              onOpenAgentConfig={openAgentConfig}
              onOpenAgentWorkspace={openAgentWorkspace}
              onNewSession={() => newSession(modelOverrideFor(selectedModelProvider))}
              onAbort={() => void chat.abort()}
              onClear={chat.clear}
            />
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
                onClick={() => void applyWorkingDirectory()}
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
          ref={messageScrollRef}
          className={
            hasMessages
              ? "flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm zc-scrollbar"
              : "flex flex-1 items-center justify-center overflow-y-auto px-6 py-10 zc-scrollbar"
          }
        >
          {!hasMessages && (
            <div className="w-full max-w-4xl">
              <h1 className="mb-4 text-center text-2xl font-medium tracking-normal text-neutral-100">
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
            </div>
          )}
          <MessageList messages={chat.messages} onApprove={chat.respondToApproval} />
          <div ref={messageBottomRef} aria-hidden="true" />
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
