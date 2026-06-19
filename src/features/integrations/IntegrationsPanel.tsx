import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { queryKeys } from "@/api/query";
import { apiChannels, apiIntegrations, type ChannelInfo, type IntegrationInfo } from "@/api/tools";
import { Select } from "@/ui/select";

const CATEGORY_ORDER = ["Chat", "AiModel", "ToolsAutomation", "Platform"];
const EMPTY_INTEGRATIONS: IntegrationInfo[] = [];
const EMPTY_CHANNELS: ChannelInfo[] = [];

export function IntegrationsPanel({ onConfigure }: { onConfigure?: (section: string) => void }) {
  const integrationsQuery = useQuery({
    queryKey: queryKeys.gateway.integrations,
    queryFn: apiIntegrations,
  });
  const channelsQuery = useQuery({
    queryKey: queryKeys.gateway.channels,
    queryFn: apiChannels,
  });
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);

  const integrations = integrationsQuery.data?.integrations ?? EMPTY_INTEGRATIONS;
  const channels = channelsQuery.data?.channels ?? EMPTY_CHANNELS;
  const categories = useMemo(
    () => ["All", ...orderedUnique(integrations.map((i) => i.category ?? "Other"))],
    [integrations],
  );
  const statuses = useMemo(
    () => ["All", ...orderedUnique(integrations.map((i) => i.status ?? "Unknown"))],
    [integrations],
  );
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return integrations.filter((item) => {
      const matchesCategory = category === "All" || (item.category ?? "Other") === category;
      const matchesStatus = status === "All" || (item.status ?? "Unknown") === status;
      const aliases = aliasesForIntegration(item, channels)
        .map((c) => `${c.type ?? ""} ${c.alias ?? ""} ${c.name}`)
        .join(" ");
      const matchesFilter =
        !q ||
        [item.name, item.description, item.category, item.status, aliases].some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(q),
        );
      return matchesCategory && matchesStatus && matchesFilter;
    });
  }, [category, channels, filter, integrations, status]);
  const grouped = useMemo(() => groupIntegrations(filtered), [filtered]);
  const selectedItem = integrations.find((item) => item.name === selected) ?? filtered[0] ?? null;
  const loading = integrationsQuery.isLoading || channelsQuery.isLoading;
  const error = integrationsQuery.error ?? channelsQuery.error;
  const fetching = integrationsQuery.isFetching || channelsQuery.isFetching;

  function refresh() {
    void integrationsQuery.refetch();
    void channelsQuery.refetch();
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#020818]/90">
        <header className="shrink-0 border-b border-white/10 p-3">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search integrations..."
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-1.5 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Select
              value={category}
              onValueChange={setCategory}
              options={categories.map((value) => ({ value, label: categoryLabel(value) }))}
              className="w-full"
            />
            <Select
              value={status}
              onValueChange={setStatus}
              options={statuses.map((value) => ({ value, label: statusLabel(value) }))}
              className="w-full"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>{filtered.length} integrations</span>
            <button
              type="button"
              onClick={refresh}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-neutral-400 hover:bg-white/[0.05] hover:text-cyan-300"
            >
              <RefreshCw size={11} className={fetching ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 zc-scrollbar">
          {loading && (
            <div className="flex items-center gap-2 p-2 text-xs text-neutral-500">
              <Loader2 size={13} className="animate-spin" />
              Loading integrations...
            </div>
          )}
          {error && (
            <div className="m-1 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <pre className="whitespace-pre-wrap font-mono">{String(error)}</pre>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
              No integrations match your filters.
            </div>
          )}
          {grouped.map(({ category: group, items }) => (
            <section key={group} className="mb-4">
              <h3 className="mb-1 px-1 text-[10px] uppercase tracking-wide text-neutral-500">
                {categoryLabel(group)}
              </h3>
              <div className="space-y-1">
                {items.map((item) => {
                  const aliases = aliasesForIntegration(item, channels);
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setSelected(item.name)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
                        selectedItem?.name === item.name
                          ? "bg-cyan-400/10 text-cyan-100"
                          : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                      }`}
                    >
                      <CategoryIcon category={item.category} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{item.name}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
                          {item.description || aliasesSummary(aliases) || statusLabel(item.status)}
                        </span>
                      </span>
                      {aliases.length > 0 && (
                        <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-neutral-500">
                          {aliases.length}
                        </span>
                      )}
                      <StatusBadge status={item.status} />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>

      <main className="min-h-0 min-w-0 overflow-hidden">
        <IntegrationDetail item={selectedItem} channels={channels} onConfigure={onConfigure} />
      </main>
    </div>
  );
}

function IntegrationDetail({
  item,
  channels,
  onConfigure,
}: {
  item: IntegrationInfo | null;
  channels: ChannelInfo[];
  onConfigure?: (section: string) => void;
}) {
  if (!item) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <PlugZap size={28} className="mx-auto mb-3 text-neutral-600" />
          <h2 className="text-sm font-medium text-neutral-200">Select an integration</h2>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">
            Choose an integration to inspect status, configured aliases, and the related config
            section.
          </p>
        </div>
      </div>
    );
  }

  const aliases = aliasesForIntegration(item, channels);
  const configSection = configSectionForIntegration(item);

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
            <CategoryIcon category={item.category} size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-neutral-100">{item.name}</h2>
              <StatusBadge status={item.status} />
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-neutral-500">
                {categoryLabel(item.category)}
              </span>
            </div>
            {item.description && (
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">{item.description}</p>
            )}
          </div>
          {onConfigure && (
            <button
              type="button"
              onClick={() => onConfigure(configSection)}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
            >
              Configure
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
        <div className="mx-auto max-w-4xl space-y-4">
          <section className="rounded-lg border border-white/10 bg-white/[0.035]">
            <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
              Gateway catalog
            </h3>
            <dl className="grid gap-3 p-4 text-xs sm:grid-cols-2">
              <InfoItem label="Status" value={statusLabel(item.status)} />
              <InfoItem label="Category" value={categoryLabel(item.category)} />
              <InfoItem label="Config section" value={configSection} />
              <InfoItem label="Configured aliases" value={String(aliases.length)} />
            </dl>
          </section>

          {item.category === "Chat" && (
            <section className="rounded-lg border border-white/10 bg-white/[0.035]">
              <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
                Channels
              </h3>
              {aliases.length === 0 ? (
                <p className="px-4 py-3 text-xs text-neutral-500">
                  No configured aliases reported for this channel type.
                </p>
              ) : (
                <div className="divide-y divide-white/10">
                  {aliases.map((channel, index) => (
                    <ChannelRow key={`${channel.name}-${index}`} channel={channel} />
                  ))}
                </div>
              )}
            </section>
          )}

          <details className="rounded-lg border border-white/10 bg-white/[0.035]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-100">
              Raw integration payload
            </summary>
            <pre className="overflow-x-auto border-t border-white/10 p-4 text-xs leading-relaxed text-neutral-400 zc-scrollbar">
              {JSON.stringify(item, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function ChannelRow({ channel }: { channel: ChannelInfo }) {
  return (
    <div className="grid gap-3 px-4 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_160px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-neutral-200">{channel.alias ?? channel.name}</span>
          {channel.enabled !== undefined && (
            <StatusBadge status={channel.enabled ? "Active" : "Available"} />
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-neutral-500">
          {channel.type && <span>type {channel.type}</span>}
          {channel.owning_agent && <span>agent {channel.owning_agent}</span>}
          {channel.message_count !== undefined && <span>{channel.message_count} messages</span>}
        </div>
      </div>
      <div className="space-y-1 text-right text-[10px] text-neutral-500 sm:text-left">
        {channel.readiness && <div>readiness {channel.readiness}</div>}
        {channel.health && <div>health {channel.health}</div>}
        {channel.status && <div>status {channel.status}</div>}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="truncate rounded border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-neutral-300">
        {value}
      </dd>
    </div>
  );
}

function CategoryIcon({ category, size = 13 }: { category?: string; size?: number }) {
  if (category === "Chat") return <Bot size={size} className="shrink-0 text-cyan-300" />;
  if (category === "AiModel") {
    return <CheckCircle2 size={size} className="shrink-0 text-emerald-400" />;
  }
  return <PlugZap size={size} className="shrink-0 text-cyan-300" />;
}

function StatusBadge({ status }: { status?: string }) {
  const label = statusLabel(status);
  const active = String(status ?? "").toLowerCase() === "active";
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
        active ? "bg-emerald-500/10 text-emerald-300" : "bg-white/[0.05] text-neutral-500"
      }`}
    >
      {label}
    </span>
  );
}

function groupIntegrations(items: IntegrationInfo[]) {
  const groups = new Map<string, IntegrationInfo[]>();
  for (const item of items) {
    const group = item.category ?? "Other";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
    .map(([category, grouped]) => ({
      category,
      items: grouped.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function orderedUnique(values: string[]) {
  return Array.from(new Set(values)).sort(
    (a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b),
  );
}

function categoryRank(category: string) {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx >= 0 ? idx : CATEGORY_ORDER.length;
}

function categoryLabel(category?: string) {
  switch (category) {
    case "All":
      return "All categories";
    case "Chat":
      return "Chat";
    case "AiModel":
      return "AI models";
    case "ToolsAutomation":
      return "Tools and automation";
    case "Platform":
      return "Platform";
    default:
      return category || "Other";
  }
}

function statusLabel(status?: string) {
  if (!status || status === "All") return status === "All" ? "All statuses" : "Unknown";
  return status;
}

function aliasesForIntegration(item: IntegrationInfo, channels: ChannelInfo[]) {
  if (item.category !== "Chat") return [];
  const itemKey = normalize(item.name);
  return channels.filter((channel) => {
    const type = normalize(channel.type ?? "");
    const name = normalize(channel.name ?? "");
    return Boolean(type && itemKey.includes(type)) || Boolean(name && itemKey.includes(name));
  });
}

function aliasesSummary(channels: ChannelInfo[]) {
  if (channels.length === 0) return "";
  return channels
    .slice(0, 3)
    .map((channel) => channel.alias ?? channel.name)
    .join(", ");
}

function configSectionForIntegration(item: IntegrationInfo) {
  if (item.category === "Chat") return "channels";
  if (item.category === "AiModel") return "providers.models";
  if (item.category === "Platform") return "gateway";
  const name = normalize(item.name);
  if (name.includes("cron")) return "cron";
  if (name.includes("browser")) return "browser";
  if (name.includes("mcp")) return "mcp";
  if (name.includes("plugin")) return "plugins";
  return "mcp";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
