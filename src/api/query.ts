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
    status: ["gateway", "status"] as const,
    health: ["gateway", "health"] as const,
    tools: ["gateway", "tools"] as const,
    channels: ["gateway", "channels"] as const,
    cron: ["gateway", "cron"] as const,
    integrations: ["gateway", "integrations"] as const,
    doctor: ["gateway", "doctor"] as const,
    devices: ["gateway", "devices"] as const,
    memory: ["gateway", "memory"] as const,
    logs: (paused: boolean) => ["gateway", "logs", { paused }] as const,
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
