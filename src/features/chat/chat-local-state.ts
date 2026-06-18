import type { ChatMode } from "@/api/ws-chat";
import type { ChatMessage } from "./use-chat";
import {
  chatLocalClearTranscript,
  chatLocalGetSelectedSession,
  chatLocalGetTranscript,
  chatLocalSetSelectedSession,
  chatLocalSetTranscript,
  workspaceImportLegacyState,
} from "@/api/tauri";

const LEGACY_RECENT_WORKSPACES_KEY = "zeroclaw_recent_workspaces";
const LEGACY_SESSION_PREFIX = "zeroclaw_session_id.";
const LEGACY_TRANSCRIPT_PREFIX = "zeroclaw_transcript.";

let migrationPromise: Promise<void> | null = null;

export function migrateLegacyLocalState() {
  migrationPromise ??= runLegacyMigration();
  return migrationPromise;
}

export async function loadSelectedSession(
  agentAlias: string,
  mode: ChatMode,
): Promise<string | null> {
  await migrateLegacyLocalState();
  return chatLocalGetSelectedSession(mode, agentAlias);
}

export async function saveSelectedSession(
  agentAlias: string,
  mode: ChatMode,
  sessionId: string | null,
) {
  await migrateLegacyLocalState();
  await chatLocalSetSelectedSession(mode, agentAlias, sessionId);
}

export async function readTranscriptCache(
  agentAlias: string,
  mode: ChatMode,
  sessionId: string,
): Promise<ChatMessage[]> {
  await migrateLegacyLocalState();
  const raw = await chatLocalGetTranscript(mode, agentAlias, sessionId);
  if (!raw) return [];
  return parseTranscript(raw);
}

export async function writeTranscriptCache(
  agentAlias: string,
  mode: ChatMode,
  sessionId: string,
  messages: ChatMessage[],
) {
  await migrateLegacyLocalState();
  await chatLocalSetTranscript(
    mode,
    agentAlias,
    sessionId,
    JSON.stringify(messages),
  );
}

export async function clearTranscriptCache(
  agentAlias: string,
  mode: ChatMode,
  sessionId: string,
) {
  await migrateLegacyLocalState();
  await chatLocalClearTranscript(mode, agentAlias, sessionId);
}

async function runLegacyMigration() {
  await importLegacyWorkspaces();
  await importLegacyChatState();
}

async function importLegacyWorkspaces() {
  const recentRoots = readLegacyStringArray(LEGACY_RECENT_WORKSPACES_KEY);
  if (recentRoots.length === 0) return;
  await workspaceImportLegacyState(recentRoots[0] ?? null, recentRoots);
  localStorage.removeItem(LEGACY_RECENT_WORKSPACES_KEY);
}

async function importLegacyChatState() {
  const keys = Object.keys(localStorage);
  const migrated: string[] = [];

  for (const key of keys) {
    if (key.startsWith(LEGACY_SESSION_PREFIX)) {
      const scope = parseLegacyScopedKey(key, LEGACY_SESSION_PREFIX);
      const sessionId = localStorage.getItem(key);
      if (scope && sessionId) {
        await chatLocalSetSelectedSession(scope.mode, scope.agentAlias, sessionId);
        migrated.push(key);
      }
      continue;
    }

    if (key.startsWith(LEGACY_TRANSCRIPT_PREFIX)) {
      const scope = parseLegacyTranscriptKey(key);
      const raw = localStorage.getItem(key);
      if (scope && raw && parseTranscript(raw).length > 0) {
        await chatLocalSetTranscript(
          scope.mode,
          scope.agentAlias,
          scope.sessionId,
          raw,
        );
        migrated.push(key);
      }
    }
  }

  for (const key of migrated) {
    localStorage.removeItem(key);
  }
}

function readLegacyStringArray(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function parseLegacyScopedKey(key: string, prefix: string) {
  const rest = key.slice(prefix.length);
  const separator = rest.indexOf(".");
  if (separator <= 0 || separator >= rest.length - 1) return null;
  return {
    mode: rest.slice(0, separator) as ChatMode,
    agentAlias: rest.slice(separator + 1),
  };
}

function parseLegacyTranscriptKey(key: string) {
  const scoped = parseLegacyScopedKey(key, LEGACY_TRANSCRIPT_PREFIX);
  if (!scoped) return null;
  const separator = scoped.agentAlias.lastIndexOf(".");
  if (separator <= 0 || separator >= scoped.agentAlias.length - 1) return null;
  return {
    mode: scoped.mode,
    agentAlias: scoped.agentAlias.slice(0, separator),
    sessionId: scoped.agentAlias.slice(separator + 1),
  };
}

function parseTranscript(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessage);
  } catch {
    return [];
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    Array.isArray(message.toolCalls) &&
    (message.status === "pending" ||
      message.status === "streaming" ||
      message.status === "done" ||
      message.status === "aborted" ||
      message.status === "error")
  );
}
