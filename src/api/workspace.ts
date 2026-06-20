import { apiFetch } from "./base";
import {
  workspaceGitStatus as localWorkspaceGitStatus,
  workspaceListDir,
  workspaceReadFile,
  workspaceWriteFile,
  type Connection,
  type WorkspaceGitStatus,
} from "./tauri";

export interface WorkspaceScope {
  connectionId: string;
  root: string | null;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  relPath: string;
  isDir: boolean;
  size?: number | null;
}

interface RemoteBrowseEntry {
  name: string;
  kind?: "dir" | "file" | string;
  size?: number | null;
}

interface RemoteBrowseResponse {
  path: string;
  entries: RemoteBrowseEntry[];
}

interface RemoteReadResponse {
  path: string;
  size: number;
  is_text: boolean;
  content: string;
  encoding: "utf8" | "base64" | string;
}

export function isLocalWorkspaceConnection(conn: Connection | null | undefined) {
  return conn?.transport === "local";
}

export async function validateWorkspaceRoot(conn: Connection, root: string) {
  if (isLocalWorkspaceConnection(conn)) return root;
  const res = await apiFetch<{ root: string }>("/api/workspace/validate", {
    method: "POST",
    body: JSON.stringify({ root }),
  });
  return res.root;
}

export async function workspaceAdapterListDir(conn: Connection, root: string, relPath = "") {
  if (isLocalWorkspaceConnection(conn)) {
    const path = relPath ? joinWorkspacePath(root, relPath) : root;
    const entries = await workspaceListDir(path);
    return entries.map((entry) => {
      const childRel = relativeWorkspacePath(root, entry.path);
      return {
        name: entry.name,
        path: entry.path,
        relPath: childRel,
        isDir: entry.isDir,
        size: entry.size,
      };
    });
  }

  const params = new URLSearchParams({ root });
  if (relPath) params.set("path", relPath);
  const res = await apiFetch<RemoteBrowseResponse>(`/api/workspace/list?${params}`);
  return res.entries.map((entry) => {
    const childRel = joinRemoteRelPath(res.path, entry.name);
    return {
      name: entry.name,
      path: joinWorkspacePath(root, childRel),
      relPath: childRel,
      isDir: entry.kind === "dir",
      size: entry.size ?? null,
    };
  });
}

export async function workspaceAdapterReadFile(conn: Connection, root: string, path: string) {
  if (isLocalWorkspaceConnection(conn)) {
    return workspaceReadFile(path);
  }
  const relPath = relativeWorkspacePath(root, path);
  const params = new URLSearchParams({ root, path: relPath });
  const res = await apiFetch<RemoteReadResponse>(`/api/workspace/read?${params}`);
  if (res.encoding !== "utf8") {
    throw new Error("Only UTF-8 workspace previews are supported");
  }
  return res.content;
}

export async function workspaceAdapterWriteFile(
  conn: Connection,
  root: string,
  path: string,
  content: string,
) {
  if (isLocalWorkspaceConnection(conn)) {
    return workspaceWriteFile(path, content);
  }
  const relPath = relativeWorkspacePath(root, path);
  await apiFetch("/api/workspace/write", {
    method: "PUT",
    body: JSON.stringify({ root, path: relPath, content }),
  });
}

export async function workspaceAdapterGitStatus(conn: Connection, root: string) {
  if (isLocalWorkspaceConnection(conn)) {
    return localWorkspaceGitStatus(root);
  }
  const params = new URLSearchParams({ root });
  return apiFetch<WorkspaceGitStatus>(`/api/workspace/git?${params}`);
}

function joinRemoteRelPath(parent: string, name: string) {
  const cleanParent = parent.replace(/^\/+|\/+$/g, "");
  return cleanParent ? `${cleanParent}/${name}` : name;
}

function joinWorkspacePath(root: string, relPath: string) {
  if (!relPath) return root;
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/g, "")}${separator}${relPath.replace(/^[/\\]+/g, "")}`;
}

function relativeWorkspacePath(root: string, path: string) {
  const cleanRoot = root.replace(/[\\/]+$/g, "");
  if (path === cleanRoot || path === root) return "";
  if (path.startsWith(`${cleanRoot}/`) || path.startsWith(`${cleanRoot}\\`)) {
    return path.slice(cleanRoot.length + 1).replace(/\\/g, "/");
  }
  return path.replace(/^[/\\]+/g, "").replace(/\\/g, "/");
}
