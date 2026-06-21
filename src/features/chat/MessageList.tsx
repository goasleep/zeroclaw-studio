import { useMemo } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  Copy,
  GitCompare,
  Loader2,
  Trash2,
  Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ApprovalDecision, ChatMessage } from "./use-chat";
import { formatBytes } from "./use-attachments";
import {
  cleanToolText,
  hasMessageToolEventBlock,
  parseMessageContentBlocks,
  type MessageContentBlock,
  type MessageToolCallBlock,
  type MessageToolResultBlock,
  type MessageToolResultStatus,
} from "./tool-result-blocks";

type ToolCallView = ChatMessage["toolCalls"][number];

const MESSAGE_TIMESTAMP_PREFIX =
  /^\[((?:\d{4}-\d{2}-\d{2})[ T](?:\d{2}:\d{2}(?::\d{2})?)(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?)\]\s*/;

export function MessageList({
  messages,
  onApprove,
}: {
  messages: ChatMessage[];
  onApprove: (request_id: string, decision: ApprovalDecision) => Promise<void>;
}) {
  return (
    <>
      {messages.map((message) => (
        <MessageRow key={message.id} message={message} onApprove={onApprove} />
      ))}
    </>
  );
}

function MessageRow({
  message,
  onApprove,
}: {
  message: ChatMessage;
  onApprove: (request_id: string, decision: ApprovalDecision) => Promise<void>;
}) {
  const { t } = useLingui();
  const parsed = splitMessageTimestamp(message.content);
  const timestamp = message.timestamp ?? parsed.timestamp;
  const contentBlocks = useMemo(
    () => (parsed.content ? parseMessageContentBlocks(parsed.content) : []),
    [parsed.content],
  );
  const hasStructuredToolCalls = message.toolCalls.length > 0;
  const isHuman = messageAuthor(message, contentBlocks) === "human";
  return (
    <div className={`flex min-w-0 gap-3 ${isHuman ? "justify-end" : ""}`}>
      <div className={`flex min-w-0 max-w-[90%] flex-col ${isHuman ? "items-end" : "items-start"}`}>
        <div
          className={`max-w-full overflow-hidden rounded-lg px-3 py-2 text-sm ${
            isHuman ? "bg-cyan-400/10 text-neutral-100" : "bg-white/[0.06] text-neutral-200"
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

          {contentBlocks.map((block, index) =>
            block.kind === "tool_result" ? (
              <ToolResultBlock key={`tool-result-${index}`} block={block} />
            ) : block.kind === "tool_call" ? (
              hasStructuredToolCalls ? null : (
                <ToolCallBlock key={`tool-call-${index}`} block={block} />
              )
            ) : (
              <div
                key={`text-${index}`}
                className="prose prose-invert prose-sm max-w-none overflow-hidden prose-pre:overflow-x-hidden prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:bg-[#020818]/90 prose-pre:text-[12px]"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {block.content}
                </ReactMarkdown>
              </div>
            ),
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
        {timestamp && (
          <div className="mt-1 px-1 font-mono text-[10px] text-neutral-500">{timestamp}</div>
        )}
      </div>
    </div>
  );
}

type MessageAuthor = "agent" | "human";

function messageAuthor(message: ChatMessage, contentBlocks: MessageContentBlock[]): MessageAuthor {
  if (
    message.role === "user" &&
    !isExternalMessage(message) &&
    !hasMessageToolEventBlock(contentBlocks)
  ) {
    return "human";
  }
  return "agent";
}

function ToolCallBlock({ block }: { block: MessageToolCallBlock }) {
  const { t } = useLingui();
  const args = block.args !== undefined ? stringifyValue(block.args) : block.raw;
  const summary = compactText(args, 180);
  const multiline = args.includes("\n") || args.length > 140;

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] text-xs">
      <div className="flex min-w-0 items-center gap-2 border-b border-cyan-500/15 bg-cyan-500/[0.07] px-3 py-2">
        <Wrench size={13} className="shrink-0 text-cyan-300" />
        <span className="shrink-0 text-[10px] font-semibold uppercase text-neutral-400">
          {t`Tool call`}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-200">
          {block.name}
        </code>
      </div>
      <div className="px-3 py-2">
        {multiline ? (
          <>
            <p className="mb-2 truncate text-neutral-400" title={summary}>
              {summary}
            </p>
            <pre className="max-h-52 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded bg-[#020818]/75 p-2 font-mono text-[11px] leading-relaxed text-neutral-300 zc-scrollbar">
              {args}
            </pre>
          </>
        ) : (
          <p className="break-words font-mono text-[11px] leading-relaxed text-neutral-300">
            {args}
          </p>
        )}
      </div>
    </div>
  );
}

function ToolResultBlock({ block }: { block: MessageToolResultBlock }) {
  const { t } = useLingui();
  const tone = toolResultTone(block.status);
  const Icon = tone.icon;
  const output = block.output || t`No output`;
  const multiline = output.includes("\n") || output.length > 140;
  const summary = compactText(output, 180);
  const statusLabel =
    block.status === "error"
      ? t`error`
      : block.status === "success"
        ? t`ok`
        : block.status === "running"
          ? t`running`
          : t`result`;

  return (
    <div className={`my-1.5 overflow-hidden rounded-lg border ${tone.card} text-xs`}>
      <div className={`flex min-w-0 items-center gap-2 border-b px-3 py-2 ${tone.header}`}>
        <Icon size={13} className={`shrink-0 ${tone.iconClass}`} />
        <span className="shrink-0 text-[10px] font-semibold uppercase text-neutral-400">
          {t`Tool result`}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-200">
          {block.name}
        </code>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${tone.badge}`}>
          {statusLabel}
        </span>
      </div>
      <div className="px-3 py-2">
        {multiline ? (
          <>
            <p className="mb-2 truncate text-neutral-400" title={summary}>
              {summary}
            </p>
            <pre className="max-h-72 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded bg-[#020818]/75 p-2 font-mono text-[11px] leading-relaxed text-neutral-300 zc-scrollbar">
              {output}
            </pre>
          </>
        ) : (
          <p className="break-words font-mono text-[11px] leading-relaxed text-neutral-300">
            {output}
          </p>
        )}
      </div>
    </div>
  );
}

function toolResultTone(status: MessageToolResultStatus) {
  if (status === "error") {
    return {
      icon: AlertTriangle,
      iconClass: "text-red-300",
      card: "border-red-500/25 bg-red-500/[0.07]",
      header: "border-red-500/20 bg-red-500/[0.08]",
      badge: "bg-red-500/15 text-red-200",
    };
  }
  if (status === "success") {
    return {
      icon: CheckCircle2,
      iconClass: "text-emerald-300",
      card: "border-emerald-500/20 bg-emerald-500/[0.06]",
      header: "border-emerald-500/15 bg-emerald-500/[0.07]",
      badge: "bg-emerald-500/15 text-emerald-200",
    };
  }
  if (status === "running") {
    return {
      icon: Loader2,
      iconClass: "animate-spin text-cyan-300",
      card: "border-cyan-500/20 bg-cyan-500/[0.06]",
      header: "border-cyan-500/15 bg-cyan-500/[0.07]",
      badge: "bg-cyan-500/15 text-cyan-200",
    };
  }
  return {
    icon: Wrench,
    iconClass: "text-cyan-300",
    card: "border-white/10 bg-[#020818]/55",
    header: "border-white/10 bg-white/[0.03]",
    badge: "bg-white/[0.06] text-neutral-300",
  };
}

function isExternalMessage(message: ChatMessage) {
  return message.source !== undefined && message.source !== null && message.source !== "local";
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
                  <pre className="mt-1 max-h-52 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded bg-[#020818]/80 p-2 zc-scrollbar">
                    {stringifyValue(toolCall.args)}
                  </pre>
                )}
                {toolCall.result !== undefined && (
                  <pre className="mt-1 max-h-52 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded bg-[#020818]/80 p-2 text-neutral-400 zc-scrollbar">
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
  onApprove: (request_id: string, decision: ApprovalDecision) => Promise<void>;
}) {
  const { t } = useLingui();
  const recentArgs = [...toolCalls]
    .reverse()
    .find((toolCall) => toolCall.name === approval.tool)?.args;
  const response = approval.response;
  const locked = response?.status === "pending" || response?.status === "sent";
  const responseLabel =
    response?.status === "pending"
      ? t`Applying...`
      : response?.status === "sent"
        ? t`${approval.tool} responded.`
        : null;

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
          <pre className="whitespace-pre-wrap break-words text-[11px] text-neutral-300 zc-scrollbar">
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
            <pre className="mt-1 max-h-56 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded bg-[#020818]/80 p-2 zc-scrollbar">
              {stringifyValue(recentArgs)}
            </pre>
          </details>
        )}
        {response?.status === "error" && (
          <p className="mb-2 text-[10px] text-red-300">{response.error || t`error`}</p>
        )}
        {responseLabel && (
          <p className="mb-2 flex items-center gap-1 text-[10px] text-emerald-300">
            {response?.status === "pending" ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Check size={10} />
            )}
            {responseLabel}
          </p>
        )}
        <div className="sticky bottom-0 flex flex-wrap gap-2 bg-amber-950/20 pt-2">
          <button
            type="button"
            onClick={() => void onApprove(approval.request_id, "approve")}
            disabled={locked}
            className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={10} /> {t`Approve once`}
          </button>
          <button
            type="button"
            onClick={() => void onApprove(approval.request_id, "deny")}
            disabled={locked}
            className="flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-red-300 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={10} /> {t`Reject`}
          </button>
          <button
            type="button"
            onClick={() => void onApprove(approval.request_id, "always")}
            disabled={locked}
            className="rounded border border-emerald-500/20 px-2 py-1 text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            title={t`Allow this tool for the current runtime policy`}
          >
            {t`Always allow`}
          </button>
        </div>
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
      <pre className="max-h-72 overflow-x-hidden overflow-y-auto p-2 text-[10px] leading-relaxed zc-scrollbar">
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

function splitMessageTimestamp(content: string) {
  const match = content.match(MESSAGE_TIMESTAMP_PREFIX);
  if (!match) return { timestamp: null, content };
  return {
    timestamp: match[1],
    content: content.slice(match[0].length),
  };
}

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
  const raw = typeof value === "string" ? cleanToolText(value) : JSON.stringify(value);
  const singleLine = raw.replace(/\s+/g, " ").trim();
  return singleLine.length > max ? `${singleLine.slice(0, max - 3)}...` : singleLine;
}

function stringifyValue(value: unknown) {
  if (value === undefined) return "";
  return typeof value === "string" ? cleanToolText(value) : JSON.stringify(value, null, 2);
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
