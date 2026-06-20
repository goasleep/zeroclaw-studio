import { useMemo, useState } from "react";
import type { Connection } from "@/api/tauri";
import type { FileEntry } from "@/api/ws-chat";

export interface ContextAttachmentDraft {
  id: string;
  path?: string;
  filename: string;
  mime: string;
  source: "file" | "clipboard";
  status: "pending" | "too_large" | "ready";
  error?: string;
  embedBytes: boolean;
  size?: number;
}

export type ClipboardAttachment = Required<Pick<FileEntry, "data_b64" | "filename" | "mime_type">> &
  Pick<FileEntry, "size" | "source"> & {
    id: string;
    source: "clipboard";
  };

export const CLIENT_MAX_CLIPBOARD_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const CLIENT_MAX_ATTACHMENT_REQUEST_BYTES = 20 * 1024 * 1024;

export function useAttachments({
  active,
  selectedFiles,
  clearSelection,
}: {
  active: Connection | null;
  selectedFiles: string[];
  clearSelection: () => void;
}) {
  const [clipboardAttachments, setClipboardAttachments] = useState<ClipboardAttachment[]>([]);
  const attachmentDrafts = useMemo<ContextAttachmentDraft[]>(
    () => [
      ...selectedFiles.map((path) => ({
        id: `file:${path}`,
        path,
        filename: filenameFromPath(path),
        mime: mimeFromPath(path),
        source: "file" as const,
        status: "pending" as const,
        embedBytes: Boolean(active && active.transport !== "local"),
      })),
      ...clipboardAttachments.map((entry) => ({
        id: entry.id,
        filename: entry.filename,
        mime: entry.mime_type,
        source: "clipboard" as const,
        status: "ready" as const,
        embedBytes: true,
        size: entry.size,
      })),
    ],
    [active, clipboardAttachments, selectedFiles],
  );

  function clearAttachments() {
    clearSelection();
    setClipboardAttachments([]);
  }

  return {
    attachmentDrafts,
    clipboardAttachments,
    setClipboardAttachments,
    clearAttachments,
  };
}

export function filenameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function mimeFromPath(path: string) {
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

export function formatBytes(size?: number) {
  if (size === undefined) return "size checked on send";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function filePathsFromUriList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(pathFromFileUri)
    .filter((path): path is string => Boolean(path));
}

export function clipboardPathFromFile(file: File) {
  const path = (file as File & { path?: unknown }).path;
  if (typeof path !== "string" || !path.trim()) return null;
  return path.startsWith("file:") ? pathFromFileUri(path) : path;
}

export function clipboardFiles(data: DataTransfer) {
  const bySignature = new Map<string, File>();
  const add = (file: File | null) => {
    if (!file) return;
    bySignature.set(`${file.name}:${file.size}:${file.type}:${file.lastModified}`, file);
  };
  Array.from(data.files).forEach(add);
  Array.from(data.items)
    .filter((item) => item.kind === "file")
    .forEach((item) => add(item.getAsFile()));
  return Array.from(bySignature.values());
}

export function clipboardFilePaths(data: DataTransfer) {
  const paths = new Set<string>();
  for (const file of clipboardFiles(data)) {
    const path = clipboardPathFromFile(file);
    if (path) paths.add(path);
  }
  for (const type of ["text/uri-list", "text/plain"]) {
    filePathsFromUriList(data.getData(type)).forEach((path) => paths.add(path));
  }
  return Array.from(paths);
}

export async function fileToClipboardAttachment(file: File, limit: number, fallbackName: string) {
  if (file.size > limit) {
    throw new Error(
      `${file.name || fallbackName} is ${formatBytes(file.size)} (limit ${formatBytes(limit)})`,
    );
  }
  const mime = file.type || mimeFromPath(file.name || fallbackName);
  const filename = file.name || `${fallbackName}.${fileExtensionForMime(mime)}`;
  const dataB64 = arrayBufferToBase64(await file.arrayBuffer());
  return {
    id: idForClipboardAttachment(filename, file.size, dataB64),
    data_b64: dataB64,
    filename,
    mime_type: mime,
    size: file.size,
    source: "clipboard" as const,
  };
}

export function addClipboardAttachments(
  current: ClipboardAttachment[],
  incoming: ClipboardAttachment[],
) {
  const next = [...current];
  for (const entry of incoming) {
    if (!next.some((existing) => existing.id === entry.id)) next.push(entry);
  }
  return next;
}

export function totalAttachmentBytes(entries: Array<{ size?: number | null }>) {
  return entries.reduce((total, entry) => total + (entry.size ?? 0), 0);
}

function pathFromFileUri(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;
    const decoded = decodeURIComponent(url.pathname);
    return decoded.match(/^\/[A-Za-z]:\//) ? decoded.slice(1) : decoded;
  } catch {
    return null;
  }
}

export function fileExtensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/json") return "json";
  if (mime === "text/csv") return "csv";
  if (mime === "text/markdown") return "md";
  if (mime.startsWith("text/")) return "txt";
  return "bin";
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function idForClipboardAttachment(filename: string, size: number, dataB64: string) {
  return `clipboard:${filename}:${size}:${dataB64.slice(0, 48)}`;
}
