// Auto-generated Tauri command typings & invokers.
//
// The Rust commands live in `src-tauri/src/commands/`. This file keeps the
// frontend in sync. When you add or change a command on the backend, mirror
// it here.

import { invoke } from "@tauri-apps/api/core";

// ---- Types (mirror serde shapes from src-tauri/src/connection/mod.rs) ----

export type Transport = "local" | "http" | "ssh" | "tailscale";
export type Lifecycle = "managed" | "attach" | "remote";
export type AuthMode = "pairing" | "token";

export interface AuthConfig {
  mode: AuthMode;
  token: string | null;
}

export interface SshConfig {
  host: string;
  user: string;
  port: number | null;
  key_path: string | null;
  remote_port: number;
  local_forward_port: number | null;
}

export interface Connection {
  id: string;
  name: string;
  transport: Transport;
  url: string;
  ssh: SshConfig | null;
  auth: AuthConfig;
  lifecycle: Lifecycle;
  binary_path: string | null;
}

export interface DiscoveredLocal {
  url: string;
  healthy: boolean;
  require_pairing: boolean;
}

export interface DetectedBinary {
  path: string;
  version: string | null;
}

export interface InstallInstructions {
  command: string;
  notes: string[];
  docs_url: string;
}

export interface PairResult {
  outcome: string;
  token: string | null;
}

export type SupervisorStatus =
  | "Stopped"
  | "Running"
  | "Exited"
  | "Backoff"
  | "Error";

export interface HealthEvent {
  connection_id: string | null;
  url: string | null;
  healthy: boolean;
}

/**
 * Activation lifecycle events emitted on `zeroclaw://activation` while the
 * backend brings a connection online (probe → spawn → wait healthy → pair).
 * Tagged via serde's `type` field.
 */
export type ActivationStep =
  | { type: "started"; connection_id: string }
  | { type: "probing" }
  | { type: "starting_gateway"; binary_path: string }
  | { type: "awaiting_healthy" }
  | { type: "pairing" }
  | { type: "ready" }
  | { type: "binary_missing" }
  | { type: "needs_manual_pairing" }
  | { type: "failed"; message: string };

// ---- Connection commands ----

export const listConnections = () =>
  invoke<Connection[]>("list_connections");

export const getActiveConnection = () =>
  invoke<Connection | null>("get_active_connection");

export const upsertConnection = (conn: Connection) =>
  invoke<void>("upsert_connection", { conn });

export const removeConnection = (id: string) =>
  invoke<void>("remove_connection", { id });

export const setActiveConnection = (id: string | null) =>
  invoke<void>("set_active_connection", { id });

export const reactivate = () => invoke<void>("reactivate");

// ---- Gateway commands ----

export const discoverLocalGateway = () =>
  invoke<DiscoveredLocal | null>("discover_local_gateway");

export const ensureToken = (id: string) =>
  invoke<PairResult>("ensure_token", { id });

export const pairWithCode = (id: string, code: string) =>
  invoke<string>("pair_with_code", { id, code });

// ---- Runtime commands ----

export const detectLocalBinary = () =>
  invoke<DetectedBinary | null>("detect_local_binary");

export const installInstructions = () =>
  invoke<InstallInstructions>("install_instructions");

export const runtimeStart = (id: string) =>
  invoke<void>("runtime_start", { id });

export const runtimeStop = () => invoke<void>("runtime_stop");

export const runtimeStatus = () =>
  invoke<SupervisorStatus>("runtime_status");

// ---- SSH commands ----

export const sshOpenTunnel = (id: string) =>
  invoke<string>("ssh_open_tunnel", { id });

export const sshCloseTunnel = (id: string) =>
  invoke<void>("ssh_close_tunnel", { id });

// ---- Workspace FS commands ----

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
}

export interface FileEvent {
  path: string;
  kind: "created" | "modified" | "removed" | "other";
}

export const workspaceOpenRoot = (path: string) =>
  invoke<void>("workspace_open_root", { path });

export const workspaceGetRoot = () =>
  invoke<string | null>("workspace_get_root");

export const workspaceListDir = (path: string) =>
  invoke<DirEntry[]>("workspace_list_dir", { path });

export const workspaceReadFile = (path: string) =>
  invoke<string>("workspace_read_file", { path });

export const workspaceWriteFile = (path: string, content: string) =>
  invoke<void>("workspace_write_file", { path, content });

export const workspaceWatchStart = (path?: string) =>
  invoke<void>("workspace_watch_start", { path: path ?? null });

export const workspaceWatchStop = () =>
  invoke<void>("workspace_watch_stop");
