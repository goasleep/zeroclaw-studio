// Chat panel — agent picker + messages + composer.

import { useEffect, useRef, useState } from "react";
import {
  Brain,
  Check,
  CircleStop,
  Clipboard,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useChat, type ChatMessage } from "./use-chat";
import { useWorkspace } from "@/app/workspace-context";
import { readClipboardText } from "@/workspace/clipboard/clipboard";

export function ChatPanel({ agentAlias }: { agentAlias: string }) {
  const chat = useChat(agentAlias);
  const { selectedFiles, clearSelection } = useWorkspace();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Global shortcut (Phase 5) — focus composer when triggered.
  useEffect(() => {
    function focus() {
      textareaRef.current?.focus();
    }
    window.addEventListener("zeroclaw://quick-invoke", focus);
    return () =>
      window.removeEventListener("zeroclaw://quick-invoke", focus);
  }, []);

  async function pasteClipboard() {
    const t = await readClipboardText();
    if (!t) return;
    setDraft((d) => (d ? `${d}\n\n${t}` : t));
  }

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed && selectedFiles.length === 0) return;
    let content = trimmed;
    if (selectedFiles.length > 0) {
      const attachments = selectedFiles
        .map((p) => `- ${p}`)
        .join("\n");
      content = trimmed
        ? `${trimmed}\n\nAttached files:\n${attachments}`
        : `Please look at:\n${attachments}`;
      clearSelection();
    }
    chat.send(content);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5 text-xs">
        <Sparkles size={12} className="text-orange-400" />
        <span className="text-neutral-300">{agentAlias}</span>
        <span
          className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${
            chat.connected
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-neutral-800 text-neutral-500"
          }`}
        >
          {chat.connected ? "ws ready" : "connecting…"}
        </span>
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
          title="Clear local view (gateway session persists)"
        >
          <RotateCcw size={12} />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {chat.messages.length === 0 && (
          <p className="text-xs text-neutral-500">
            No messages yet. Type a message below, or attach files from the
            sidebar before sending.
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
        {selectedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1 text-[10px]">
            <Paperclip size={10} className="text-orange-400" />
            <span className="text-neutral-400">
              {selectedFiles.length} attachment{selectedFiles.length === 1 ? "" : "s"}:
            </span>
            {selectedFiles.slice(0, 3).map((p) => (
              <span
                key={p}
                className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-300"
                title={p}
              >
                {p.split("/").slice(-1)[0]}
              </span>
            ))}
            {selectedFiles.length > 3 && (
              <span className="text-neutral-500">+{selectedFiles.length - 3} more</span>
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="ml-1 text-neutral-500 hover:text-red-300"
            >
              <X size={10} />
            </button>
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
                submit();
              }
            }}
            rows={2}
            placeholder={`Message ${agentAlias}…  (⌘⇧Space anywhere to focus)`}
            className="flex-1 resize-none rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-orange-500"
          />
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
            onClick={submit}
            className="flex items-center gap-1 rounded bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-orange-400"
          >
            <Send size={12} />
            Send
          </button>
        </div>
      </footer>
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
            <p className="mb-2 font-medium text-amber-200">Approval required</p>
            <p className="mb-2 text-neutral-300">
              Tool <code className="text-amber-300">{message.approval.tool}</code>{" "}
              wants to run.
            </p>
            <pre className="mb-2 overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] text-neutral-400">
              {message.approval.arguments_summary}
            </pre>
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
