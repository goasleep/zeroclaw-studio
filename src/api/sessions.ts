import { apiFetch } from "./base";

export interface SessionListItem {
  id?: string;
  session_id?: string;
  name?: string | null;
  agent_alias?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  message_count?: number | null;
  [k: string]: unknown;
}

export interface SessionMessage {
  role: string;
  content: string;
  created_at?: string | null;
}

export const apiSessions = () => apiFetch<{ sessions: SessionListItem[] }>("/api/sessions");

export const apiSessionMessages = (sessionId: string) =>
  apiFetch<{
    session_id: string;
    messages: SessionMessage[];
    session_persistence: boolean;
  }>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);

export const apiSessionRename = (sessionId: string, name: string) =>
  apiFetch<SessionListItem>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });

export const apiSessionDelete = (sessionId: string) =>
  apiFetch<undefined>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });

export const apiSessionAbort = (sessionId: string) =>
  apiFetch<undefined>(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: "POST",
  });
