import type { ConfigListEntry, PickerItem } from "@/api/config";
import type { ChannelConnection, ModelConnection } from "./types";

export function modelConnectionsFromEntries(
  entries: ConfigListEntry[],
  sectionKey: string,
  items: PickerItem[],
) {
  const prefixDot = `${sectionKey}.`;
  const providerByKey = new Map(items.map((item) => [item.key, item]));
  const seen = new Set<string>();
  const connections: ModelConnection[] = [];

  for (const entry of entries) {
    if (!entry.path.startsWith(prefixDot)) continue;
    const [providerKey, alias] = entry.path.slice(prefixDot.length).split(".");
    if (!providerKey || !alias) continue;
    const key = `${providerKey}:${alias}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = providerByKey.get(providerKey);
    connections.push({
      providerKey,
      providerLabel: item?.label || providerKey,
      alias,
      badge: item?.badge,
    });
  }

  return connections.sort(
    (a, b) =>
      a.providerLabel.localeCompare(b.providerLabel) ||
      a.alias.localeCompare(b.alias) ||
      a.providerKey.localeCompare(b.providerKey),
  );
}

export function channelConnectionsFromEntries(
  entries: ConfigListEntry[],
  sectionKey: string,
  items: PickerItem[],
) {
  const prefixDot = `${sectionKey}.`;
  const channelByKey = new Map(items.map((item) => [item.key, item]));
  const seen = new Set<string>();
  const connections: ChannelConnection[] = [];

  for (const entry of entries) {
    if (!entry.path.startsWith(prefixDot)) continue;
    const [channelKey, name] = entry.path.slice(prefixDot.length).split(".");
    if (!channelKey || !name) continue;
    const key = `${channelKey}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = channelByKey.get(channelKey);
    connections.push({
      channelKey,
      channelLabel: item?.label || channelKey,
      name,
      badge: item?.badge,
    });
  }

  return connections.sort(
    (a, b) =>
      a.channelLabel.localeCompare(b.channelLabel) ||
      a.name.localeCompare(b.name) ||
      a.channelKey.localeCompare(b.channelKey),
  );
}

export function recommendedModelProviders(items: PickerItem[]) {
  const matches: PickerItem[] = [];
  const used = new Set<string>();
  const targets = [
    "openrouter",
    "openai",
    "anthropic",
    "gemini",
    "google",
    "ollama",
    "openai-compatible",
    "custom",
  ];

  for (const target of targets) {
    const match = items.find((item) => {
      if (used.has(item.key)) return false;
      const haystack = `${item.key} ${item.label}`.toLowerCase();
      return haystack.includes(target);
    });
    if (match) {
      used.add(match.key);
      matches.push(match);
    }
  }

  for (const item of items) {
    if (matches.length >= 6) break;
    if (used.has(item.key)) continue;
    used.add(item.key);
    matches.push(item);
  }

  return matches;
}

export function recommendedChannels(items: PickerItem[]) {
  const matches: PickerItem[] = [];
  const used = new Set<string>();
  const targets = [
    "bluesky",
    "webhook",
    "discord",
    "slack",
    "telegram",
    "email",
    "matrix",
    "github",
  ];

  for (const target of targets) {
    const match = items.find((item) => {
      if (used.has(item.key)) return false;
      const haystack = `${item.key} ${item.label}`.toLowerCase();
      return haystack.includes(target);
    });
    if (match) {
      used.add(match.key);
      matches.push(match);
    }
  }

  for (const item of items) {
    if (matches.length >= 6) break;
    if (used.has(item.key)) continue;
    used.add(item.key);
    matches.push(item);
  }

  return matches;
}

export function modelProviderHint(item: PickerItem) {
  if (item.description) return item.description;
  const name = (item.label || item.key).toLowerCase();
  if (name.includes("openrouter")) return "Good first choice for routing many hosted models.";
  if (name.includes("openai")) return "Use OpenAI-compatible chat, reasoning, and tool models.";
  if (name.includes("anthropic")) return "Connect Claude models with your provider credentials.";
  if (name.includes("gemini") || name.includes("google")) return "Connect Google Gemini models.";
  if (name.includes("ollama")) return "Use local models running on this machine or network.";
  return "Create a reusable connection for agents.";
}

export function channelHint(item: PickerItem) {
  if (item.description) return item.description;
  const name = (item.label || item.key).toLowerCase();
  if (name.includes("bluesky"))
    return "Receive posts, mentions, or replies from a Bluesky account.";
  if (name.includes("webhook")) return "Accept incoming HTTP events from another app or service.";
  if (name.includes("discord")) return "Connect a Discord server or bot-style message source.";
  if (name.includes("slack")) return "Route Slack workspace messages to a ZeroClaw agent.";
  if (name.includes("telegram")) return "Connect a Telegram bot or chat entry point.";
  if (name.includes("email")) return "Bring mailbox messages into an agent workflow.";
  return "Create an incoming message connection for an agent.";
}
