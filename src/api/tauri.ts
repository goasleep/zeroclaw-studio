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
