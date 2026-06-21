export type MessageToolResultStatus = "success" | "error" | "running" | "unknown";

export interface MessageToolResultBlock {
  kind: "tool_result";
  name: string;
  status: MessageToolResultStatus;
  output: string;
}

export interface MessageToolCallBlock {
  kind: "tool_call";
  name: string;
  args: unknown;
  raw: string;
}

export interface MessageTextBlock {
  kind: "text";
  content: string;
}

export type MessageContentBlock = MessageTextBlock | MessageToolCallBlock | MessageToolResultBlock;

const TOOL_EVENT_PATTERN =
  /(?:\[Tool results\]\s*)?<(tool_result|tool_call)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ANSI_PATTERN = new RegExp(
  String.raw`[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))|\uFFFD\[[0-?]*[ -/]*[@-~]`,
  "g",
);

export function parseMessageContentBlocks(content: string): MessageContentBlock[] {
  const blocks: MessageContentBlock[] = [];
  let cursor = 0;

  for (const match of content.matchAll(TOOL_EVENT_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      pushTextBlock(blocks, content.slice(cursor, start));
    }

    const kind = match[1] as "tool_call" | "tool_result";
    const attrs = parseAttributes(match[2] ?? "");
    const body = cleanToolText(decodeEntities(match[3] ?? ""));
    blocks.push(
      kind === "tool_call"
        ? parseToolCallBlock(body, attrs)
        : {
            kind: "tool_result",
            name: attrs.name || "tool",
            status: normalizeStatus(attrs.status),
            output: body,
          },
    );
    cursor = start + match[0].length;
  }

  if (cursor < content.length) {
    pushTextBlock(blocks, content.slice(cursor));
  }

  return blocks.length > 0 ? blocks : [{ kind: "text", content }];
}

export function hasMessageToolResultBlock(blocks: MessageContentBlock[]) {
  return blocks.some((block) => block.kind === "tool_result");
}

export function hasMessageToolEventBlock(blocks: MessageContentBlock[]) {
  return blocks.some((block) => block.kind === "tool_call" || block.kind === "tool_result");
}

function pushTextBlock(blocks: MessageContentBlock[], content: string) {
  const trimmed = content.trim();
  if (trimmed) blocks.push({ kind: "text", content: trimmed });
}

function parseToolCallBlock(body: string, attrs: Record<string, string>): MessageToolCallBlock {
  const payload = parseJsonObject(body);
  const args = payload?.arguments ?? payload?.args;
  return {
    kind: "tool_call",
    name: stringValue(payload?.name) ?? attrs.name ?? "tool",
    args,
    raw: body,
  };
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function cleanToolText(value: string) {
  return value.replace(ANSI_PATTERN, "").trim();
}

function parseAttributes(value: string) {
  const attrs: Record<string, string> = {};
  const attrPattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of value.matchAll(attrPattern)) {
    attrs[match[1]] = decodeEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

function normalizeStatus(status: string | undefined): MessageToolResultStatus {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "ok" || normalized === "success" || normalized === "done") return "success";
  if (normalized === "error" || normalized === "failed" || normalized === "failure") return "error";
  if (normalized === "running" || normalized === "pending") return "running";
  return "unknown";
}

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
