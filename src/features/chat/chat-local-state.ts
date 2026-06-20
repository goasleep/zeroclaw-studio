import type { ChatMode } from "@/api/ws-chat";
import {
  chatLocalAssignSessionWorkspace,
  chatLocalGetSelectedSession,
  chatLocalListSessionWorkspaces,
  chatLocalSetSelectedSession,
  workspaceImportLegacyState,
} from "@/api/tauri";

const LEGACY_RECENT_WORKSPACES_KEY = "zeroclaw_recent_workspaces";
const LEGACY_SESSION_PREFIX = "zeroclaw_session_id.";

const migrationPromises = new Map<string, Promise<void>>();

export function migrateLegacyLocalState(connectionId: string) {
  let migrationPromise = migrationPromises.get(connectionId);
  if (!migrationPromise) {
    migrationPromise = runLegacyMigration(connectionId);
    migrationPromises.set(connectionId, migrationPromise);
  }
  return migrationPromise;
}

export async function loadSelectedSession(
  connectionId: string,
  workspaceRoot: string | null,
  agentAlias: string,
  mode: ChatMode,
): Promise<string | null> {
  await migrateLegacyLocalState(connectionId);
  return chatLocalGetSelectedSession(connectionId, workspaceRoot, mode, agentAlias);
}

export async function saveSelectedSession(
  connectionId: string,
  workspaceRoot: string | null,
  agentAlias: string,
  mode: ChatMode,
  sessionId: string | null,
) {
  await migrateLegacyLocalState(connectionId);
  await chatLocalSetSelectedSession(connectionId, workspaceRoot, mode, agentAlias, sessionId);
}

export async function assignSessionWorkspace(
  connectionId: string,
  sessionId: string,
  workspaceRoot: string | null,
) {
  await migrateLegacyLocalState(connectionId);
  if (!workspaceRoot) return;
  await chatLocalAssignSessionWorkspace(connectionId, sessionId, workspaceRoot);
}

export async function loadSessionWorkspaceMap(connectionId: string) {
  await migrateLegacyLocalState(connectionId);
  const bindings = await chatLocalListSessionWorkspaces(connectionId);
  return new Map(bindings.map((binding) => [binding.session_id, binding.workspace_root]));
}

async function runLegacyMigration(connectionId: string) {
  await importLegacyWorkspaces(connectionId);
  await importLegacyChatState(connectionId);
}

async function importLegacyWorkspaces(connectionId: string) {
  const recentRoots = readLegacyStringArray(LEGACY_RECENT_WORKSPACES_KEY);
  if (recentRoots.length === 0) return;
  await workspaceImportLegacyState(connectionId, recentRoots[0] ?? null, recentRoots);
  localStorage.removeItem(LEGACY_RECENT_WORKSPACES_KEY);
}

async function importLegacyChatState(connectionId: string) {
  const keys = Object.keys(localStorage);
  const migrated: string[] = [];

  for (const key of keys) {
    if (key.startsWith(LEGACY_SESSION_PREFIX)) {
      const scope = parseLegacyScopedKey(key, LEGACY_SESSION_PREFIX);
      const sessionId = localStorage.getItem(key);
      if (scope && sessionId) {
        await chatLocalSetSelectedSession(connectionId, null, scope.mode, scope.agentAlias, sessionId);
        migrated.push(key);
      }
      continue;
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
