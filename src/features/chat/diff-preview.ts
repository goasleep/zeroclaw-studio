export type DiffPreview =
  | {
      kind: "diff";
      path?: string;
      title: string;
      lines: Array<{ type: "context" | "add" | "remove"; text: string }>;
    }
  | {
      kind: "write";
      path?: string;
      title: string;
      lines: Array<{ type: "context" | "add" | "remove"; text: string }>;
    };

export function buildApprovalPreview(
  tool: string,
  args: unknown,
): DiffPreview | null {
  if (!isRecord(args)) return null;
  const normalized = tool.toLowerCase().replace(/[-:]/g, "_");
  if (!normalized.includes("file_edit") && !normalized.includes("file_write")) {
    return null;
  }

  const path = stringValue(args, ["path", "file", "file_path", "target_path"]);
  if (normalized.includes("file_write")) {
    const content = stringValue(args, [
      "content",
      "text",
      "new_content",
      "contents",
    ]);
    if (content == null) return null;
    return {
      kind: "write",
      path: path ?? undefined,
      title: `Write ${path ?? "file"}`,
      lines: content.split(/\r?\n/).map((text) => ({ type: "add", text })),
    };
  }

  const before = stringValue(args, [
    "old_content",
    "before",
    "old",
    "original",
    "find",
    "search",
  ]);
  const after = stringValue(args, [
    "new_content",
    "after",
    "new",
    "replacement",
    "replace",
  ]);
  if (before == null || after == null) return null;
  return {
    kind: "diff",
    path: path ?? undefined,
    title: `Edit ${path ?? "file"}`,
    lines: simpleDiff(before, after),
  };
}

function simpleDiff(
  before: string,
  after: string,
): Array<{ type: "context" | "add" | "remove"; text: string }> {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const rows = longestCommonSubsequence(a, b);
  const lines: Array<{ type: "context" | "add" | "remove"; text: string }> = [];
  let i = 0;
  let j = 0;
  for (const [nextI, nextJ] of rows) {
    while (i < nextI) lines.push({ type: "remove", text: a[i++] });
    while (j < nextJ) lines.push({ type: "add", text: b[j++] });
    lines.push({ type: "context", text: a[nextI] });
    i = nextI + 1;
    j = nextJ + 1;
  }
  while (i < a.length) lines.push({ type: "remove", text: a[i++] });
  while (j < b.length) lines.push({ type: "add", text: b[j++] });
  return lines.slice(0, 400);
}

function longestCommonSubsequence(a: string[], b: string[]) {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return rows;
}

function stringValue(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
