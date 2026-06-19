import { apiFetch } from "./base";

export interface LogEvent {
  "@timestamp": string;
  message: string;
  severity_text: string;
  attributes?: Record<string, unknown>;
}

export const apiLogs = (params?: URLSearchParams) =>
  apiFetch<{ events: LogEvent[]; at_end?: boolean }>(`/api/logs${params ? `?${params}` : ""}`);
