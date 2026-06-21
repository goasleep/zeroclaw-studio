import type { ClipboardEvent, RefObject } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronDown, Clipboard, FilePlus2, FolderOpen, Loader2, Send } from "lucide-react";
import { Select } from "@/ui/select";
import { AttachmentTray } from "./AttachmentTray";
import type { ContextAttachmentDraft } from "./use-attachments";

interface SelectOption {
  value: string;
  label: string;
}

export function ChatComposer({
  variant,
  mode,
  files,
  maxAttachmentBytes,
  maxAttachmentRequestBytes,
  onClearAttachments,
  onPreviewFile,
  composerError,
  textareaRef,
  draft,
  onDraft,
  onPaste,
  onSubmit,
  workspaceMenuOpen,
  onWorkspaceMenuOpen,
  workspaceRoot,
  workspaceName,
  recentRoots,
  onSelectWorkspaceRoot,
  onPickWorkspaceRoot,
  onPickFiles,
  onPasteClipboard,
  hasMessages,
  agentAlias,
  agentOptions,
  onAgentChange,
  sending,
  sendDisabled,
}: {
  variant: "center" | "footer";
  mode: "chat" | "acp";
  files: ContextAttachmentDraft[];
  maxAttachmentBytes: number | null;
  maxAttachmentRequestBytes: number | null;
  onClearAttachments: () => void;
  onPreviewFile: (path: string) => void;
  composerError: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraft: (value: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  workspaceMenuOpen: boolean;
  onWorkspaceMenuOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  workspaceRoot: string | null;
  workspaceName: string;
  recentRoots: string[];
  onSelectWorkspaceRoot: (path: string | null) => void;
  onPickWorkspaceRoot: () => void;
  onPickFiles: () => void;
  onPasteClipboard: () => void;
  hasMessages: boolean;
  agentAlias: string;
  agentOptions: SelectOption[];
  onAgentChange: (agent: string) => void;
  sending: boolean;
  sendDisabled?: boolean;
}) {
  const { t } = useLingui();
  return (
    <div
      className={
        variant === "center"
          ? "rounded-xl border border-white/10 bg-[#020818]/90 shadow-2xl shadow-black/30"
          : ""
      }
    >
      <div className={variant === "center" ? "p-3" : undefined}>
        <AttachmentTray
          files={files}
          maxAttachmentBytes={maxAttachmentBytes}
          maxAttachmentRequestBytes={maxAttachmentRequestBytes}
          onClear={onClearAttachments}
          onPreview={onPreviewFile}
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
            onChange={(e) => onDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (sendDisabled) return;
                onSubmit();
              }
            }}
            rows={variant === "center" ? 4 : 2}
            placeholder={variant === "center" ? t`Message the agent...` : t`Continue the chat...`}
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
            {!hasMessages && (
              <WorkspaceMenu
                mode={mode}
                open={workspaceMenuOpen}
                onOpen={onWorkspaceMenuOpen}
                workspaceRoot={workspaceRoot}
                workspaceName={workspaceName}
                recentRoots={recentRoots}
                onSelectWorkspaceRoot={onSelectWorkspaceRoot}
                onPickWorkspaceRoot={onPickWorkspaceRoot}
              />
            )}
            <button
              type="button"
              onClick={onPickFiles}
              className="rounded border border-white/10 px-2 py-2 text-neutral-400 hover:border-cyan-400 hover:text-cyan-300"
              title={t`Add file attachment`}
            >
              <FilePlus2 size={12} />
            </button>
            <button
              type="button"
              onClick={onPasteClipboard}
              className="rounded border border-white/10 px-2 py-2 text-neutral-400 hover:border-cyan-400 hover:text-cyan-300"
              title={t`Paste clipboard into message`}
            >
              <Clipboard size={12} />
            </button>
            <div className="flex-1" />
            {!hasMessages && (
              <Select
                value={agentAlias}
                options={agentOptions}
                onValueChange={onAgentChange}
                placeholder={t`Agent`}
                className="h-8 w-36 max-w-[44vw] border-white/10 bg-white/[0.04] py-0 text-[11px]"
              />
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={sendDisabled ?? sending}
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
}

function WorkspaceMenu({
  mode,
  open,
  onOpen,
  workspaceRoot,
  workspaceName,
  recentRoots,
  onSelectWorkspaceRoot,
  onPickWorkspaceRoot,
}: {
  mode: "chat" | "acp";
  open: boolean;
  onOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  workspaceRoot: string | null;
  workspaceName: string;
  recentRoots: string[];
  onSelectWorkspaceRoot: (path: string | null) => void;
  onPickWorkspaceRoot: () => void;
}) {
  const { t } = useLingui();
  const generalLabel = mode === "acp" ? t`General code task` : t`General chat`;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpen((current) => !current)}
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
      {open && (
        <div className="absolute bottom-11 left-0 z-20 w-72 overflow-hidden rounded-lg border border-white/10 bg-[#020818]/95 py-1 shadow-xl">
          <button
            type="button"
            onClick={() => onSelectWorkspaceRoot(null)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
              !workspaceRoot
                ? "bg-white/[0.05] text-neutral-100"
                : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
            }`}
          >
            <FolderOpen size={12} className="text-neutral-500" />
            <span className="min-w-0 flex-1 truncate">{generalLabel}</span>
          </button>
          {recentRoots.slice(0, 8).map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => onSelectWorkspaceRoot(path)}
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
            onClick={onPickWorkspaceRoot}
            className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-left text-xs text-cyan-300 hover:bg-white/[0.05]"
          >
            <FilePlus2 size={12} />
            <span className="min-w-0 flex-1 truncate">{t`Open project...`}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function filenameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}
