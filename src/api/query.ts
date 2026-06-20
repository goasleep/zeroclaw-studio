import { QueryClient, type QueryKey, type UseMutationOptions } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  connections: {
    all: ["connections"] as const,
    active: ["connections", "active"] as const,
    probe: (id: string) => ["connections", "probe", id] as const,
  },
  workspace: {
    state: ["workspace", "state"] as const,
    dir: (path: string | null) => ["workspace", "dir", path] as const,
    git: (root: string | null) => ["workspace", "git", root] as const,
  },
  agentWorkspace: {
    agents: (connectionId: string | null) => ["agent-workspace", connectionId, "agents"] as const,
    dir: (connectionId: string | null, alias: string | null, path?: string | null) =>
      ["agent-workspace", connectionId, "dir", alias, path ?? null] as const,
    file: (connectionId: string | null, alias: string | null, path?: string | null) =>
      ["agent-workspace", connectionId, "file", alias, path ?? null] as const,
  },
  sessions: {
    all: ["sessions"] as const,
    messages: (sessionId: string | null) => ["sessions", "messages", sessionId] as const,
  },
  config: {
    sections: ["config", "sections"] as const,
    picker: (section: string | null) => ["config", "picker", section] as const,
    list: (prefix?: string | null) => ["config", "list", prefix ?? null] as const,
    prop: (path: string | null, reveal = false) => ["config", "prop", path, reveal] as const,
    templates: (section?: string | null) => ["config", "templates", section ?? null] as const,
    drift: ["config", "drift"] as const,
    reloadStatus: ["config", "reload-status"] as const,
    skills: ["config", "skills"] as const,
  },
  setup: {
    status: (capability: string, prefix: string, alias?: string | null) =>
      ["setup", "status", capability, prefix, alias ?? null] as const,
  },
  gateway: {
    status: (connectionId: string | null) => ["gateway", connectionId, "status"] as const,
    health: (connectionId: string | null) => ["gateway", connectionId, "health"] as const,
    tools: (connectionId: string | null) => ["gateway", connectionId, "tools"] as const,
    channels: (connectionId: string | null) => ["gateway", connectionId, "channels"] as const,
    cron: (connectionId: string | null) => ["gateway", connectionId, "cron"] as const,
    integrations: (connectionId: string | null) =>
      ["gateway", connectionId, "integrations"] as const,
    doctor: (connectionId: string | null) => ["gateway", connectionId, "doctor"] as const,
    devices: (connectionId: string | null) => ["gateway", connectionId, "devices"] as const,
    memory: (connectionId: string | null) => ["gateway", connectionId, "memory"] as const,
    logs: (connectionId: string | null, paused: boolean) =>
      ["gateway", connectionId, "logs", { paused }] as const,
    agentWorkspace: (alias: string, path?: string | null) =>
      ["gateway", "agent-workspace", alias, path ?? null] as const,
    quickstart: {
      state: ["gateway", "quickstart", "state"] as const,
      fields: (section: string, typeKey: string) =>
        ["gateway", "quickstart", "fields", section, typeKey] as const,
    },
  },
};

export function invalidateQueries(queryKey: QueryKey) {
  return queryClient.invalidateQueries({ queryKey });
}

export function mutationOptions<TData, TError, TVariables, TContext>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
) {
  return options;
}
