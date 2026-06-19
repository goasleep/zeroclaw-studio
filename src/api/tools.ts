import { apiFetch } from "./base";

export interface StatusResponse {
  version: string;
  uptime_secs?: number;
  agents?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ChannelInfo {
  name: string;
  type?: string;
  alias?: string;
  owning_agent?: string | null;
  enabled?: boolean;
  compiled?: boolean;
  status?: string;
  message_count?: number;
  last_message_at?: string | null;
  health?: string;
  readiness?: string;
  [k: string]: unknown;
}

export interface IntegrationInfo {
  name: string;
  description?: string;
  category?: "Chat" | "AiModel" | "ToolsAutomation" | "Platform" | string;
  status?: "Active" | "Available" | string;
  [k: string]: unknown;
}

export interface AgentWorkspaceEntry {
  name?: string;
  path: string;
  is_dir?: boolean;
  isDir?: boolean;
  [k: string]: unknown;
}

export const apiStatus = () => apiFetch<StatusResponse>("/api/status");

export const apiHealth = () =>
  apiFetch<{ status: string; require_pairing?: boolean }>("/api/health");

export const apiMemory = () =>
  apiFetch<{ entries: Array<{ key: string; value: unknown }> }>("/api/memory");

export const apiTools = () =>
  apiFetch<{ tools: Array<{ name: string; [k: string]: unknown }> }>("/api/tools");

export const apiChannels = () => apiFetch<{ channels: ChannelInfo[] }>("/api/channels");

export const apiCron = () =>
  apiFetch<{ jobs: Array<{ id: string; name?: string; [k: string]: unknown }> }>("/api/cron");

export const apiIntegrations = () =>
  apiFetch<{ integrations: IntegrationInfo[] }>("/api/integrations");

export const apiDoctor = () =>
  apiFetch<{ results: Array<{ severity: string; message: string }> }>("/api/doctor");

export const apiDevices = () =>
  apiFetch<{ devices: Array<{ id: string; name?: string }> }>("/api/devices");

export const apiAgentWorkspaceList = (alias: string, path?: string) =>
  apiFetch<{ entries: AgentWorkspaceEntry[] }>(
    `/api/agents/${encodeURIComponent(alias)}/workspace/list${
      path ? `?path=${encodeURIComponent(path)}` : ""
    }`,
  );
