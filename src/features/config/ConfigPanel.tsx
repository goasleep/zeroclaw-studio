import { useCallback, useEffect, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import {
  Activity,
  Boxes,
  Check,
  ChevronRight,
  Code2,
  Database,
  Eye,
  Layers3,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  apiConfigCreateMapKey,
  apiConfigDeleteMapKey,
  apiConfigDeleteProp,
  apiConfigDrift,
  apiConfigList,
  apiConfigPatch,
  apiConfigPicker,
  apiConfigProp,
  apiConfigReloadStatus,
  apiConfigSections,
  apiConfigSelectItem,
  apiConfigTemplates,
  apiConfigPutProp,
  apiSkillBundles,
  type ConfigTemplate,
  type ConfigListEntry,
  type ConfigSectionInfo,
  type PatchOp,
  type PickerItem,
} from "@/api/config";
import { ApiError } from "@/api/base";
import {
  configDraftError,
  defaultDraft,
  parseConfigDraft,
  parseRawConfigDraft,
} from "./config-value-schema";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/switch";
import { SetupDoctorTab } from "./SetupDoctorTab";
import { setupTargetsForPrefix } from "./setup-targets";
import {
  configGetSummaries,
  type AgentSummary,
  type RiskProfileSummary,
  type RuntimeProfileSummary,
} from "@/api/tauri";

const GROUP_ORDER = [
  "Foundation",
  "Agent",
  "Multi-agent",
  "Tools",
  "Integrations",
  "Network",
  "Storage",
  "Operations",
  "Other",
] as const;

type PanelMode = "overview" | "sections" | "advanced";
type StatusFilter = "all" | "needs" | "ready";
type FormTarget = {
  prefix: string;
  title: string;
  subtitle?: string;
  initialTab?: "fields" | "setup";
};
type TaskState = "ready" | "needs" | "neutral";
export type ConfigCategoryId =
  | "models-providers"
  | "agents"
  | "runtime-safety"
  | "channels"
  | "tools-skills";
type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; sections: ConfigSectionInfo[] }
  | { kind: "error"; message: string };

interface ConfigCategory {
  id: ConfigCategoryId;
  label: string;
  description: string;
  sectionKeys: string[];
  icon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
}

const CONFIG_CATEGORIES: Record<ConfigCategoryId, ConfigCategory> = {
  "models-providers": {
    id: "models-providers",
    label: "Model Connections",
    description: "Connect a model service, add credentials, and make it available to agents.",
    sectionKeys: ["providers.models"],
    icon: Sparkles,
    emptyTitle: "No model provider sections",
    emptyBody: "This gateway did not report provider config sections.",
  },
  agents: {
    id: "agents",
    label: "Agents",
    description: "Configure agent identities, prompts, default profiles, and peer groups.",
    sectionKeys: ["agents", "peer_groups"],
    icon: Activity,
    emptyTitle: "No agent sections",
    emptyBody: "This gateway did not report agent or peer group config sections.",
  },
  "runtime-safety": {
    id: "runtime-safety",
    label: "Runtime & Safety",
    description: "Manage risk profiles, runtime tuning, sandbox settings, and command policy.",
    sectionKeys: ["risk_profiles", "runtime_profiles"],
    icon: ShieldCheck,
    emptyTitle: "No runtime or safety sections",
    emptyBody: "This gateway did not report risk profile or runtime profile sections.",
  },
  channels: {
    id: "channels",
    label: "Channels",
    description: "Configure chat channels, webhooks, tokens, aliases, and agent routing.",
    sectionKeys: ["channels"],
    icon: Network,
    emptyTitle: "No channel sections",
    emptyBody: "This gateway did not report channel config sections.",
  },
  "tools-skills": {
    id: "tools-skills",
    label: "Tools & Skills",
    description: "Add capabilities, connect tools, and check setup.",
    sectionKeys: ["tools", "skills", "skill_bundles", "mcp"],
    icon: Wrench,
    emptyTitle: "No tools or skills sections",
    emptyBody: "This gateway did not report tools, skills, bundles, or MCP sections.",
  },
};

type LinguiI18n = ReturnType<typeof useLingui>["i18n"];

function configCategoryLabel(id: ConfigCategoryId, i18n: LinguiI18n) {
  switch (id) {
    case "models-providers":
      return i18n._(msg`Model Connections`);
    case "agents":
      return i18n._(msg`Agents`);
    case "runtime-safety":
      return i18n._(msg`Runtime & Safety`);
    case "channels":
      return i18n._(msg`Channels`);
    case "tools-skills":
      return i18n._(msg`Tools & Skills`);
  }
}

function configCategoryDescription(id: ConfigCategoryId, i18n: LinguiI18n) {
  switch (id) {
    case "models-providers":
      return i18n._(
        msg`Connect a model service, add credentials, and make it available to agents.`,
      );
    case "agents":
      return i18n._(msg`Configure agent identities, prompts, default profiles, and peer groups.`);
    case "runtime-safety":
      return i18n._(
        msg`Manage risk profiles, runtime tuning, sandbox settings, and command policy.`,
      );
    case "channels":
      return i18n._(msg`Configure chat channels, webhooks, tokens, aliases, and agent routing.`);
    case "tools-skills":
      return i18n._(msg`Add capabilities, connect tools, and check setup.`);
  }
}

function configCategoryEmptyTitle(id: ConfigCategoryId, i18n: LinguiI18n) {
  switch (id) {
    case "models-providers":
      return i18n._(msg`No model provider sections`);
    case "agents":
      return i18n._(msg`No agent sections`);
    case "runtime-safety":
      return i18n._(msg`No runtime or safety sections`);
    case "channels":
      return i18n._(msg`No channel sections`);
    case "tools-skills":
      return i18n._(msg`No tools or skills sections`);
  }
}

function configCategoryEmptyBody(id: ConfigCategoryId, i18n: LinguiI18n) {
  switch (id) {
    case "models-providers":
      return i18n._(msg`This gateway did not report provider config sections.`);
    case "agents":
      return i18n._(msg`This gateway did not report agent or peer group config sections.`);
    case "runtime-safety":
      return i18n._(msg`This gateway did not report risk profile or runtime profile sections.`);
    case "channels":
      return i18n._(msg`This gateway did not report channel config sections.`);
    case "tools-skills":
      return i18n._(msg`This gateway did not report tools, skills, bundles, or MCP sections.`);
  }
}

function configGroupLabel(group: string, i18n: LinguiI18n) {
  switch (group) {
    case "Foundation":
      return i18n._(msg`Foundation`);
    case "Agent":
      return i18n._(msg`Agent`);
    case "Multi-agent":
      return i18n._(msg`Multi-agent`);
    case "Tools":
      return i18n._(msg`Tools`);
    case "Integrations":
      return i18n._(msg`Integrations`);
    case "Network":
      return i18n._(msg`Network`);
    case "Storage":
      return i18n._(msg`Storage`);
    case "Operations":
      return i18n._(msg`Operations`);
    case "Other":
      return i18n._(msg`Other`);
    default:
      return group;
  }
}

const OVERVIEW_CARDS: Array<
  | { kind: "category"; categoryId: ConfigCategoryId }
  | {
      kind: "link";
      target: string;
      label: string;
      description: string;
      sectionKeys: string[];
      icon: LucideIcon;
    }
> = [
  { kind: "category", categoryId: "models-providers" },
  { kind: "category", categoryId: "agents" },
  { kind: "category", categoryId: "runtime-safety" },
  { kind: "category", categoryId: "channels" },
  {
    kind: "link",
    target: "memory",
    label: "Memory",
    description: "Configure memory backends and choose active memory per agent or profile.",
    sectionKeys: ["memory"],
    icon: Database,
  },
  { kind: "category", categoryId: "tools-skills" },
  {
    kind: "link",
    target: "integrations",
    label: "Integrations",
    description: "Browse integration status and jump into the right gateway configuration.",
    sectionKeys: ["channels", "providers.models", "mcp", "plugins"],
    icon: Boxes,
  },
];

const GROUP_ICONS: Record<string, LucideIcon> = {
  Foundation: Sparkles,
  Agent: Activity,
  "Multi-agent": Network,
  Tools: Wrench,
  Integrations: Boxes,
  Network,
  Storage: Database,
  Operations: SlidersHorizontal,
  Other: Layers3,
};

export function ConfigPanel({
  focusSection,
  categoryId = null,
  onNavigate,
}: {
  focusSection?: string | null;
  categoryId?: ConfigCategoryId | null;
  onNavigate?: (section: string) => void;
}) {
  const { t, i18n } = useLingui();
  const category = categoryId ? CONFIG_CATEGORIES[categoryId] : null;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [mode, setMode] = useState<PanelMode>(
    categoryId === "tools-skills" && !focusSection
      ? "overview"
      : categoryId || focusSection
        ? "sections"
        : "overview",
  );
  const [activeKey, setActiveKey] = useState<string | null>(focusSection ?? null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [target, setTarget] = useState<FormTarget | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadSections = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await apiConfigSections();
      const selectableSections = category
        ? data.sections.filter((section) => sectionMatchesCategory(section, category))
        : data.sections;
      setState({ kind: "ready", sections: data.sections });
      setActiveKey((current) => {
        if (focusSection && selectableSections.some((s) => s.key === focusSection)) {
          return focusSection;
        }
        if (current && selectableSections.some((s) => s.key === current)) {
          return current;
        }
        return selectableSections[0]?.key ?? null;
      });
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    }
  }, [category, focusSection]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  useEffect(() => {
    if (!focusSection || state.kind !== "ready") return;
    const selectableSections = category
      ? state.sections.filter((section) => sectionMatchesCategory(section, category))
      : state.sections;
    if (selectableSections.some((s) => s.key === focusSection)) {
      setMode("sections");
      setActiveKey(focusSection);
      setTarget(null);
    }
  }, [category, focusSection, state]);

  useEffect(() => {
    setMode(
      category?.id === "tools-skills" && !focusSection
        ? "overview"
        : category
          ? "sections"
          : focusSection
            ? "sections"
            : "overview",
    );
    setTarget(null);
    setFilter("");
    setStatusFilter("all");
  }, [categoryId, focusSection, category]);

  const sections = state.kind === "ready" ? state.sections : [];
  const visibleSections = category
    ? sections.filter((section) => sectionMatchesCategory(section, category))
    : sections;
  const activeSection = visibleSections.find((s) => s.key === activeKey) ?? null;
  const filteredGroups = useMemo(
    () =>
      groupSections(filterSections(filterSectionsByStatus(visibleSections, statusFilter), filter)),
    [filter, statusFilter, visibleSections],
  );
  const sectionStats = useMemo(() => getSectionStats(visibleSections), [visibleSections]);

  function chooseSection(section: ConfigSectionInfo) {
    setMode("sections");
    setActiveKey(section.key);
    setTarget(null);
  }

  if (category) {
    return (
      <ConfigCategoryWorkspace
        category={category}
        state={state}
        sections={visibleSections}
        activeSection={activeSection}
        target={target}
        reloadKey={reloadKey}
        mode={mode}
        onSection={chooseSection}
        onTarget={setTarget}
        onRefresh={loadSections}
        onOverview={() => {
          setMode("overview");
          setTarget(null);
        }}
        onAdvanced={() => {
          setMode("advanced");
          setTarget(null);
        }}
        onSaved={() => {
          setReloadKey((n) => n + 1);
          void loadSections();
        }}
      />
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#020818]/95">
        <div className="border-b border-white/10 p-3">
          <button
            type="button"
            onClick={() => {
              setMode("overview");
              setTarget(null);
            }}
            className={`mb-3 flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition ${
              mode === "overview"
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                : "border-white/10 bg-white/[0.025] text-neutral-300 hover:border-white/15 hover:text-neutral-100"
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
              <ShieldCheck size={15} />
            </div>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium">{t`Gateway overview`}</span>
              <span className="mt-0.5 block text-[10px] text-neutral-500">
                {t`${sectionStats.ready} ready / ${sections.length} sections`}
              </span>
            </span>
          </button>
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t`Search sections...`}
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-1.5 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-white/[0.025] p-1">
            {[
              { key: "all", label: t`All` },
              { key: "needs", label: t`Needs` },
              { key: "ready", label: t`Ready` },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(item.key as StatusFilter)}
                className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                  statusFilter === item.key
                    ? "bg-cyan-400/15 text-cyan-100"
                    : "text-neutral-500 hover:text-neutral-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>
              {t`${filteredGroups.reduce((sum, group) => sum + group.items.length, 0)} sections`}
            </span>
            <button
              type="button"
              onClick={() => void loadSections()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-neutral-400 hover:bg-white/[0.05] hover:text-cyan-300"
            >
              <RefreshCw size={11} />
              {t`Refresh`}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 zc-scrollbar">
          {state.kind === "loading" && <LoadingInline label={t`Loading config sections...`} />}
          {state.kind === "error" && <ErrorBox message={state.message} />}
          {state.kind === "ready" &&
            filteredGroups.map(({ group, items }) => (
              <section key={group} className="mb-4">
                <h3 className="mb-1 px-1 text-[10px] uppercase tracking-wide text-neutral-500">
                  {configGroupLabel(group, i18n)}
                </h3>
                <div className="space-y-1">
                  {items.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => chooseSection(section)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
                        mode === "sections" && activeKey === section.key
                          ? "bg-cyan-400/10 text-cyan-100"
                          : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                      }`}
                    >
                      <SectionStateDot section={section} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{section.label}</span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                          {section.key}
                        </span>
                      </span>
                      <SectionStatusBadge section={section} />
                      <ChevronRight size={12} className="shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
        </div>

        <div className="shrink-0 border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => {
              setMode("advanced");
              setTarget(null);
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
              mode === "advanced"
                ? "bg-cyan-400/10 text-cyan-100"
                : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
            }`}
          >
            <Code2 size={13} />
            <span className="min-w-0 flex-1 truncate">{t`Advanced raw paths`}</span>
          </button>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 overflow-hidden">
        {mode === "overview" && !category ? (
          <ConfigOverview
            sections={sections}
            state={state}
            stats={sectionStats}
            onRefresh={loadSections}
            onChoose={chooseSection}
            onNavigate={onNavigate}
            onAdvanced={() => {
              setMode("advanced");
              setTarget(null);
            }}
          />
        ) : mode === "advanced" ? (
          <AdvancedConfigEditor />
        ) : (
          <SectionExplorer
            section={activeSection}
            target={target}
            reloadKey={reloadKey}
            onTarget={setTarget}
            onSaved={() => {
              setReloadKey((n) => n + 1);
              void loadSections();
            }}
          />
        )}
      </main>
    </div>
  );
}

function ConfigCategoryWorkspace({
  category,
  state,
  sections,
  activeSection,
  target,
  reloadKey,
  mode,
  onSection,
  onTarget,
  onRefresh,
  onOverview,
  onAdvanced,
  onSaved,
}: {
  category: ConfigCategory;
  state: LoadState;
  sections: ConfigSectionInfo[];
  activeSection: ConfigSectionInfo | null;
  target: FormTarget | null;
  reloadKey: number;
  mode: PanelMode;
  onSection: (section: ConfigSectionInfo) => void;
  onTarget: (target: FormTarget | null) => void;
  onRefresh: () => void;
  onOverview: () => void;
  onAdvanced: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useLingui();
  const Icon = category.icon;
  const stats = getSectionStats(sections);
  const orderedSections = orderSectionsForCategory(sections, category);
  const showingAdvanced = mode === "advanced";
  const showingOverview = mode === "overview";
  const isToolsSkills = category.id === "tools-skills";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
              <Icon size={17} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-neutral-100">
                  {configCategoryLabel(category.id, i18n)}
                </h2>
                <Badge label={t`${stats.ready} ready`} />
                <Badge label={t`${sections.length} sections`} />
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-500">
                {configCategoryDescription(category.id, i18n)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300"
            >
              <RefreshCw size={12} />
              {t`Refresh`}
            </button>
            <button
              type="button"
              onClick={() => {
                if (showingAdvanced) {
                  const fallbackSection = activeSection ?? orderedSections[0];
                  if (fallbackSection) onSection(fallbackSection);
                  return;
                }
                onAdvanced();
              }}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${
                showingAdvanced
                  ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300"
              }`}
            >
              <Code2 size={12} />
              {t`Advanced`}
            </button>
          </div>
        </div>

        {orderedSections.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {isToolsSkills && (
              <button
                type="button"
                onClick={onOverview}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition ${
                  showingOverview
                    ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                    : "border-white/10 text-neutral-400 hover:border-white/15 hover:text-neutral-100"
                }`}
              >
                <Layers3 size={12} />
                <span>{t`Overview`}</span>
              </button>
            )}
            {orderedSections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => onSection(section)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition ${
                  !showingOverview && !showingAdvanced && activeSection?.key === section.key
                    ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                    : "border-white/10 text-neutral-400 hover:border-white/15 hover:text-neutral-100"
                }`}
              >
                <SectionStateDot section={section} />
                <span>{categorySectionLabel(category, section)}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {state.kind === "loading" ? (
          <LoadingInline label={t`Loading ${configCategoryLabel(category.id, i18n)}...`} />
        ) : state.kind === "error" ? (
          <div className="p-5">
            <ErrorBox message={state.message} />
          </div>
        ) : showingAdvanced ? (
          <AdvancedConfigEditor />
        ) : isToolsSkills && showingOverview ? (
          <ToolsSkillsBeginnerHome
            sections={orderedSections}
            onSection={onSection}
            onTarget={onTarget}
            onAdvanced={onAdvanced}
          />
        ) : sections.length === 0 ? (
          <EmptyState
            icon={<IconNode icon={category.icon} size={28} />}
            title={configCategoryEmptyTitle(category.id, i18n)}
            body={configCategoryEmptyBody(category.id, i18n)}
          />
        ) : (
          <SectionExplorer
            section={activeSection ?? orderedSections[0] ?? null}
            target={target}
            reloadKey={reloadKey}
            onTarget={onTarget}
            onSaved={onSaved}
          />
        )}
      </main>
    </div>
  );
}

function ToolsSkillsBeginnerHome({
  sections,
  onSection,
  onTarget,
  onAdvanced,
}: {
  sections: ConfigSectionInfo[];
  onSection: (section: ConfigSectionInfo) => void;
  onTarget: (target: FormTarget | null) => void;
  onAdvanced: () => void;
}) {
  const { t } = useLingui();
  const skills = sectionByRoot(sections, "skills");
  const bundles = sectionByRoot(sections, "skill_bundles");
  const mcp = sectionByRoot(sections, "mcp");
  const tools = sectionByRoot(sections, "tools");
  const readyCount = [skills, bundles, mcp].filter((section) => section?.ready).length;

  function openSection(section: ConfigSectionInfo | null) {
    if (section) onSection(section);
  }

  function openSetup(section: ConfigSectionInfo | null) {
    if (!section) return;
    const setupTargets = setupTargetsForPrefix(section.key);
    if (setupTargets.length === 0) {
      onSection(section);
      return;
    }
    onSection(section);
    onTarget({
      prefix: section.key,
      title: section.label,
      subtitle: section.help,
      initialTab: "setup",
    });
  }

  const rawPreview = [skills, bundles, mcp, tools]
    .flatMap((section) => (section ? [section.key] : []))
    .slice(0, 4);

  return (
    <div className="h-full overflow-auto zc-scrollbar">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-5">
        <section className="grid gap-3 md:grid-cols-3">
          <BeginnerStatusItem
            label={t`Skills`}
            detail={skills?.ready ? t`Ready to use` : t`Review setup`}
            state={statusState(skills)}
          />
          <BeginnerStatusItem
            label={t`Skill bundles`}
            detail={bundles?.completed ? t`Available to manage` : t`Not configured yet`}
            state={statusState(bundles)}
          />
          <BeginnerStatusItem
            label={t`MCP servers`}
            detail={mcp?.ready ? t`Connected` : t`Needs setup`}
            state={statusState(mcp)}
          />
        </section>

        <section className="grid gap-3 xl:grid-cols-3">
          <BeginnerCapabilityCard
            icon={Sparkles}
            title={t`Skills`}
            description={t`Use guided workflows for PDF, images, docs, code tasks, and other repeatable work.`}
            section={skills}
            primaryLabel={t`Manage skills`}
            onPrimary={() => openSection(skills)}
            secondaryLabel={t`Check setup`}
            onSecondary={() => openSetup(skills)}
          />
          <BeginnerCapabilityCard
            icon={Boxes}
            title={t`Skill Bundles`}
            description={t`Install or enable groups of skills from trusted sources.`}
            section={bundles}
            primaryLabel={t`Browse bundles`}
            onPrimary={() => openSection(bundles)}
          />
          <BeginnerCapabilityCard
            icon={Network}
            title={t`MCP Servers`}
            description={t`Connect external tools and local services so agents can use them safely.`}
            section={mcp}
            primaryLabel={t`Add server`}
            onPrimary={() => openSection(mcp)}
            secondaryLabel={t`Run doctor`}
            onSecondary={() => openSection(mcp)}
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">{t`Recommended next steps`}</h3>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                {t`Start here if you are setting up tools and skills for the first time.`}
              </p>
            </div>
            <Badge label={t`${readyCount} ready`} />
          </div>
          <div className="divide-y divide-white/10">
            <NextStepRow
              number="1"
              title={t`Enable Skills`}
              detail={t`Turn on the skills system before managing or installing skills.`}
              state={skills?.ready ? "ready" : skills?.completed ? "needs" : "neutral"}
              actionLabel={t`Review skills`}
              onAction={() => openSection(skills)}
            />
            <NextStepRow
              number="2"
              title={t`Choose skills folder`}
              detail={t`Pick where local skill markdown and community bundles should live.`}
              state={skills?.completed ? "ready" : "neutral"}
              actionLabel={t`Open fields`}
              onAction={() => openSection(skills)}
            />
            <NextStepRow
              number="3"
              title={t`Check Python support`}
              detail={t`Run the local setup check used by Python-backed skills.`}
              state={skills?.ready ? "ready" : "needs"}
              actionLabel={t`Check now`}
              onAction={() => openSetup(skills)}
            />
            <NextStepRow
              number="4"
              title={t`Add your first MCP server`}
              detail={t`Create a server entry when you want agents to use an external tool.`}
              state={mcp?.ready ? "ready" : "neutral"}
              actionLabel={t`Add server`}
              onAction={() => openSection(mcp)}
            />
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-neutral-100">{t`Advanced fields`}</h3>
                <Badge label={t`raw config`} />
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-500">
                {t`Use this when you know the exact config path you want to inspect or edit.`}
              </p>
              {rawPreview.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {rawPreview.map((path) => (
                    <span
                      key={path}
                      className="rounded border border-white/10 bg-[#020818]/80 px-2 py-1 font-mono text-[10px] text-neutral-500"
                    >
                      {path}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onAdvanced}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300"
            >
              <Code2 size={12} />
              {t`Advanced`}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function BeginnerStatusItem({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: TaskState;
}) {
  const tone =
    state === "ready"
      ? "border-emerald-400/20 bg-emerald-400/[0.045]"
      : state === "needs"
        ? "border-amber-400/20 bg-amber-400/[0.045]"
        : "border-white/10 bg-white/[0.03]";
  return (
    <div className={`rounded-md border px-4 py-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-neutral-100">{label}</span>
        <TaskBadge state={state} />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{detail}</p>
    </div>
  );
}

function BeginnerCapabilityCard({
  icon: Icon,
  title,
  description,
  section,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  section: ConfigSectionInfo | null;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <section className="flex min-h-[190px] flex-col rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
          <Icon size={16} />
        </span>
        {section ? <SectionStatusBadge section={section} /> : <Badge label="missing" />}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-neutral-100">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">{description}</p>
      {section?.help && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-neutral-600">
          {section.help}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <button
          type="button"
          onClick={onPrimary}
          disabled={!section}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {primaryLabel}
          <ChevronRight size={12} />
        </button>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            disabled={!section}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Wrench size={12} />
            {secondaryLabel}
          </button>
        )}
      </div>
    </section>
  );
}

function NextStepRow({
  number,
  title,
  detail,
  state,
  actionLabel,
  onAction,
}: {
  number: string;
  title: string;
  detail: string;
  state: TaskState;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[32px_minmax(0,1fr)_auto_auto] md:items-center">
      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-[#020818]/80 font-mono text-[11px] text-neutral-400">
        {number}
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-neutral-100">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-500">{detail}</span>
      </span>
      <TaskBadge state={state} />
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300"
      >
        {actionLabel}
        <ChevronRight size={12} />
      </button>
    </div>
  );
}

function TaskBadge({ state }: { state: TaskState }) {
  const { t } = useLingui();
  const label = state === "ready" ? t`ready` : state === "needs" ? t`needs setup` : t`next`;
  const tone =
    state === "ready"
      ? "bg-emerald-500/10 text-emerald-300"
      : state === "needs"
        ? "bg-amber-500/10 text-amber-300"
        : "bg-white/[0.05] text-neutral-500";
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${tone}`}>{label}</span>;
}

function ConfigOverview({
  sections,
  state,
  stats,
  onRefresh,
  onChoose,
  onNavigate,
  onAdvanced,
}: {
  sections: ConfigSectionInfo[];
  state: LoadState;
  stats: SectionStats;
  onRefresh: () => void;
  onChoose: (section: ConfigSectionInfo) => void;
  onNavigate?: (section: string) => void;
  onAdvanced: () => void;
}) {
  const { t, i18n } = useLingui();
  const areaCards = OVERVIEW_CARDS.map((card) => overviewCardFor(card, sections, i18n));
  const needsAttention = sections
    .filter((section) => !section.ready)
    .sort(
      (a, b) =>
        Number(b.completed) - Number(a.completed) || groupRank(a.group) - groupRank(b.group),
    )
    .slice(0, 6);
  const groups = groupSections(sections);

  return (
    <div className="h-full overflow-auto zc-scrollbar">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-neutral-100">{t`Gateway control center`}</h2>
              <Badge label={t`${sections.length} sections`} />
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-500">
              {t`Configure providers, runtime behavior, agents, tools, storage, and network settings from focused entry points.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300"
            >
              <RefreshCw size={12} />
              {t`Refresh`}
            </button>
            <button
              type="button"
              onClick={onAdvanced}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300"
            >
              <Code2 size={12} />
              {t`Raw paths`}
            </button>
          </div>
        </header>

        {state.kind === "loading" && <LoadingInline label={t`Loading config sections...`} />}
        {state.kind === "error" && <ErrorBox message={state.message} />}

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            icon={ShieldCheck}
            label={t`Ready`}
            value={String(stats.ready)}
            detail={t`${stats.completed} configured`}
            tone="emerald"
          />
          <StatCard
            icon={TriangleAlert}
            label={t`Needs setup`}
            value={String(stats.needs)}
            detail={t`${stats.empty} untouched`}
            tone="amber"
          />
          <StatCard
            icon={Layers3}
            label={t`Areas`}
            value={String(groups.length)}
            detail={t`${stats.quickstart} quickstart`}
            tone="cyan"
          />
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-100">{t`Configuration entry points`}</h3>
            <span className="text-[10px] uppercase tracking-wide text-neutral-600">
              {t`Common workflows`}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {areaCards.map((card) => (
              <OverviewEntryCard
                key={card.target}
                card={card}
                onClick={() => onNavigate?.(card.target)}
              />
            ))}
          </div>
        </section>

        {needsAttention.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">{t`Needs attention`}</h3>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {needsAttention.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => onChoose(section)}
                  className="flex min-h-[78px] items-start gap-3 rounded-md border border-amber-400/15 bg-amber-400/[0.035] px-3 py-3 text-left transition hover:border-amber-300/35 hover:bg-amber-400/[0.06]"
                >
                  <SectionStateDot section={section} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-neutral-100">
                      {section.label}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-neutral-500">
                      {section.key}
                    </span>
                    <span className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-neutral-500">
                      {section.help || section.group}
                    </span>
                  </span>
                  <ChevronRight size={13} className="mt-0.5 shrink-0 text-neutral-500" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-neutral-100">{t`Configuration areas`}</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groups.map(({ group, items }) => (
              <GroupCard key={group} group={group} sections={items} onChoose={onChoose} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-400/[0.045] text-emerald-300"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-400/[0.045] text-amber-300"
        : "border-cyan-400/20 bg-cyan-400/[0.045] text-cyan-300";
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-md border ${toneClass}`}>
          <Icon size={16} />
        </span>
        <span className="text-2xl font-semibold text-neutral-100">{value}</span>
      </div>
      <div className="mt-3 text-xs font-medium text-neutral-200">{label}</div>
      <div className="mt-1 text-[11px] text-neutral-500">{detail}</div>
    </section>
  );
}

interface OverviewCardView {
  target: string;
  label: string;
  description: string;
  sections: ConfigSectionInfo[];
  stats: SectionStats;
  icon: LucideIcon;
}

function OverviewEntryCard({ card, onClick }: { card: OverviewCardView; onClick: () => void }) {
  const { t } = useLingui();
  const Icon = card.icon;
  const detail =
    card.sections.length > 0
      ? t`${card.stats.ready} ready / ${card.sections.length} sections`
      : t`Open console`;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[128px] flex-col rounded-md border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-400/35 hover:bg-cyan-400/[0.04]"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
          <Icon size={16} />
        </span>
        <Badge label={card.stats.needs === 0 && card.sections.length > 0 ? t`ready` : t`open`} />
      </span>
      <span className="mt-3 block text-sm font-semibold text-neutral-100">{card.label}</span>
      <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">
        {card.description}
      </span>
      <span className="mt-auto flex items-center gap-1 pt-3 font-mono text-[10px] text-neutral-500 group-hover:text-cyan-300">
        {detail}
        <ChevronRight size={12} />
      </span>
    </button>
  );
}

function overviewCardFor(
  card:
    | { kind: "category"; categoryId: ConfigCategoryId }
    | {
        kind: "link";
        target: string;
        label: string;
        description: string;
        sectionKeys: string[];
        icon: LucideIcon;
      },
  sections: ConfigSectionInfo[],
  i18n: LinguiI18n,
): OverviewCardView {
  if (card.kind === "category") {
    const category = CONFIG_CATEGORIES[card.categoryId];
    const related = sections.filter((section) => sectionMatchesCategory(section, category));
    return {
      target: category.id,
      label: configCategoryLabel(category.id, i18n),
      description: configCategoryDescription(category.id, i18n),
      sections: related,
      stats: getSectionStats(related),
      icon: category.icon,
    };
  }

  const related = sections.filter((section) => sectionMatchesKeys(section, card.sectionKeys));
  return {
    target: card.target,
    label: card.target === "memory" ? i18n._(msg`Memory`) : i18n._(msg`Integrations`),
    description:
      card.target === "memory"
        ? i18n._(msg`Configure memory backends and choose active memory per agent or profile.`)
        : i18n._(msg`Browse integration status and jump into the right gateway configuration.`),
    sections: related,
    stats: getSectionStats(related),
    icon: card.icon,
  };
}

function IconNode({ icon: Icon, size }: { icon: LucideIcon; size: number }) {
  return <Icon size={size} />;
}

function GroupCard({
  group,
  sections,
  onChoose,
}: {
  group: string;
  sections: ConfigSectionInfo[];
  onChoose: (section: ConfigSectionInfo) => void;
}) {
  const { t, i18n } = useLingui();
  const Icon = iconForGroup(group);
  const ready = sections.filter((section) => section.ready).length;
  const preview = [...sections].sort((a, b) => Number(b.ready) - Number(a.ready)).slice(0, 4);
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#020818]/80 text-cyan-300">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-neutral-100">
            {configGroupLabel(group, i18n)}
          </h4>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            {t`${ready} ready / ${sections.length} sections`}
          </p>
        </div>
      </div>
      <div className="divide-y divide-white/10">
        {preview.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => onChoose(section)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-neutral-300 transition hover:bg-white/[0.04] hover:text-neutral-100"
          >
            <SectionStateDot section={section} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{section.label}</span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                {section.key}
              </span>
            </span>
            <ChevronRight size={12} className="shrink-0 text-neutral-500" />
          </button>
        ))}
      </div>
    </section>
  );
}

function SectionExplorer({
  section,
  target,
  reloadKey,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo | null;
  target: FormTarget | null;
  reloadKey: number;
  onTarget: (target: FormTarget | null) => void;
  onSaved: () => void;
}) {
  const { t } = useLingui();
  if (!section) {
    return (
      <EmptyState
        icon={<Code2 size={28} />}
        title={t`Select a config section`}
        body={t`Choose a section to inspect its picker, aliases, and editable fields.`}
      />
    );
  }

  if (target) {
    return (
      <ConfigFieldForm
        key={`${reloadKey}-${target.prefix}`}
        target={target}
        onBack={() => onTarget(null)}
        onSaved={onSaved}
      />
    );
  }

  if (!section.has_picker || section.shape === "direct_form") {
    return (
      <ConfigFieldForm
        key={`${reloadKey}-${section.key}`}
        target={{
          prefix: section.key,
          title: section.label,
          subtitle: section.help,
        }}
        onSaved={onSaved}
      />
    );
  }

  return <PickerSection section={section} onTarget={onTarget} onSaved={onSaved} />;
}

function PickerSection({
  section,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const { t } = useLingui();
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState<PickerItem | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [inlineTarget, setInlineTarget] = useState<FormTarget | null>(null);
  const typed =
    section.shape === "typed_family_map" || section.shape === undefined || section.shape === null;
  const oneTier = section.shape === "one_tier_alias_map";

  const openOneTierItem = useCallback(
    async (item: PickerItem) => {
      setOpeningKey(item.key);
      setShowCreateItem(false);
      setError(null);
      try {
        const result = await apiConfigSelectItem(section.key, item.key);
        setSelectedItem(item);
        setInlineTarget({
          prefix: result.fields_prefix,
          title: item.label || item.key,
          subtitle: result.created ? t`Created new ${entryNoun(section)}` : undefined,
        });
      } catch (e) {
        setSelectedItem(null);
        setInlineTarget(null);
        setError(errorMessage(e));
      } finally {
        setOpeningKey(null);
      }
    },
    [section, t],
  );

  const openBackendItem = useCallback(
    async (item: PickerItem) => {
      setError(null);
      try {
        const result = await apiConfigSelectItem(section.key, item.key);
        onSaved();
        onTarget({
          prefix: result.fields_prefix,
          title: item.label || item.key,
          subtitle: result.created ? t`Created ${entryNoun(section)} from picker` : undefined,
        });
      } catch (e) {
        setSelectedItem(null);
        setError(errorMessage(e));
      }
    },
    [onSaved, onTarget, section, t],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFilter("");
    setNewItemName("");
    setShowCreateItem(false);
    setOpeningKey(null);
    setInlineTarget(null);
    setSelectedItem(null);
    void apiConfigPicker(section.key)
      .then((resp) => {
        if (cancelled) return;
        setItems(resp.items);
        setSelectedItem(typed ? (resp.items[0] ?? null) : null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typed, section.key]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? items.filter((item) =>
          [item.key, item.label, item.description, item.badge]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : items;
  }, [filter, items]);
  const selectableItems = useMemo(() => {
    if (!selectedItem || filtered.some((item) => item.key === selectedItem.key)) return filtered;
    return [selectedItem, ...filtered];
  }, [filtered, selectedItem]);

  if (section.key === "providers.models" && typed) {
    return (
      <ModelConnectionsPanel
        section={section}
        items={items}
        filtered={filtered}
        filter={filter}
        loading={loading}
        error={error}
        onFilterChange={setFilter}
        onTarget={onTarget}
        onSaved={onSaved}
      />
    );
  }

  if (section.key === "channels" && typed) {
    return (
      <ChannelConnectionsPanel
        section={section}
        items={items}
        filtered={filtered}
        filter={filter}
        loading={loading}
        error={error}
        onFilterChange={setFilter}
        onTarget={onTarget}
        onSaved={onSaved}
      />
    );
  }

  async function createOneTierItem() {
    const clean = newItemName.trim();
    if (!clean) return;
    setCreatingItem(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, clean);
      const nextItem: PickerItem = { key: clean, label: clean, badge: "configured" };
      setItems((current) =>
        current.some((item) => item.key === clean)
          ? current.map((item) => (item.key === clean ? { ...item, badge: "configured" } : item))
          : [...current, nextItem],
      );
      setSelectedItem(nextItem);
      setInlineTarget({
        prefix: result.fields_prefix,
        title: clean,
        subtitle: result.created ? t`Created new ${entryNoun(section)}` : section.help,
      });
      setNewItemName("");
      setShowCreateItem(false);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreatingItem(false);
    }
  }

  if (oneTier) {
    return (
      <OneTierAliasManager
        section={section}
        items={items}
        filtered={filtered}
        filter={filter}
        selectedItem={selectedItem}
        newItemName={newItemName}
        loading={loading}
        creatingItem={creatingItem}
        showCreateItem={showCreateItem || items.length === 0}
        openingKey={openingKey}
        error={error}
        inlineTarget={inlineTarget}
        onFilterChange={setFilter}
        onNewItemNameChange={setNewItemName}
        onStartCreate={() => {
          setInlineTarget(null);
          setSelectedItem(null);
          setShowCreateItem(true);
        }}
        onOpenItem={(item) => void openOneTierItem(item)}
        onCreateItem={() => void createOneTierItem()}
        onCloseDrawer={() => {
          setShowCreateItem(false);
          setInlineTarget(null);
        }}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-neutral-100">{section.label}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-neutral-500">
            {loading ? <Loader2 size={12} className="animate-spin" /> : null}
            <span>{choiceCountLabel(section, items.length)}</span>
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(220px,360px)_minmax(180px,1fr)]">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              {pickerSelectionLabel(section)}
            </span>
            <select
              value={selectedItem?.key ?? ""}
              onChange={(e) => {
                const next = items.find((item) => item.key === e.target.value) ?? null;
                setSelectedItem(next);
                if (oneTier && next) void openOneTierItem(next);
                if (!oneTier && !typed && next) void openBackendItem(next);
              }}
              disabled={loading || selectableItems.length === 0}
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-2 font-mono text-xs text-neutral-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t`Select ${pickerSelectionOption(section)}`}</option>
              {selectableItems.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.badge ? `${item.label} (${item.badge})` : item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              {t`Filter`}
            </span>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t`Filter ${pickerSelectionOption(section)}s...`}
                className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-2 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
              />
            </div>
          </label>
        </div>

        {oneTier && (
          <div className="mt-3 grid gap-2 rounded-md border border-dashed border-white/10 bg-white/[0.025] p-2 sm:grid-cols-[auto_minmax(160px,1fr)_auto] sm:items-center">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
              <Plus size={12} className="text-cyan-300" />
              {createEntryLabel(section)}
            </div>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createOneTierItem();
              }}
              placeholder={entryNamePlaceholder(section)}
              className="min-w-0 rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
            <button
              type="button"
              onClick={() => void createOneTierItem()}
              disabled={!newItemName.trim() || creatingItem}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-sky-400 px-2.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingItem ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {createButtonLabel(section)}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="mt-3 rounded-md border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
            {t`No ${pickerSelectionOption(section)}s match this filter.`}
          </div>
        )}
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {selectedItem ? (
          oneTier ? (
            <LoadingInline label={t`Opening ${entryNoun(section)}...`} />
          ) : typed ? (
            <TypedAliasPanel
              section={section}
              item={selectedItem}
              onTarget={onTarget}
              onSaved={onSaved}
            />
          ) : (
            <LoadingInline label={t`Opening fields...`} />
          )
        ) : oneTier ? (
          <EmptyState
            icon={<Plus size={28} />}
            title={t`Create or select ${entryNoun(section)}`}
            body={t`Add a ${entryNoun(section)} or open an existing one.`}
          />
        ) : (
          <EmptyState
            icon={<Plus size={28} />}
            title={t`Pick a choice`}
            body={t`Choose an option above to create, choose, or inspect its config fields.`}
          />
        )}
      </div>
    </div>
  );
}

type ModelConnection = {
  providerKey: string;
  providerLabel: string;
  alias: string;
  badge?: string;
};

function ModelConnectionsPanel({
  section,
  items,
  filtered,
  filter,
  loading,
  error,
  onFilterChange,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  items: PickerItem[];
  filtered: PickerItem[];
  filter: string;
  loading: boolean;
  error: string | null;
  onFilterChange: (value: string) => void;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const [connections, setConnections] = useState<ModelConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [alias, setAlias] = useState("default");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelConnection | null>(null);
  const recommended = useMemo(() => recommendedModelProviders(items), [items]);

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    setConnectionsError(null);
    try {
      const data = await apiConfigList(section.key);
      setConnections(modelConnectionsFromEntries(data.entries, section.key, items));
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setLoadingConnections(false);
    }
  }, [items, section.key]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function openConnection(item: PickerItem, nextAlias = alias) {
    const clean = nextAlias.trim() || "default";
    const key = `${item.key}:${clean}`;
    setBusyKey(key);
    setConnectionsError(null);
    try {
      const result = await apiConfigSelectItem(section.key, item.key, clean);
      onSaved();
      await loadConnections();
      onTarget({
        prefix: result.fields_prefix,
        title: `${item.label || item.key} / ${clean}`,
        subtitle: result.created
          ? "New connection created. Add an API key, choose a default model, then save."
          : "Review this model connection, credentials, default model, and endpoint settings.",
      });
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteConnection(connection: ModelConnection) {
    const key = `${connection.providerKey}:${connection.alias}`;
    setDeletingKey(key);
    setConnectionsError(null);
    try {
      await apiConfigDeleteMapKey(`${section.key}.${connection.providerKey}`, connection.alias);
      setDeleteTarget(null);
      onSaved();
      await loadConnections();
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="h-full overflow-auto p-5 zc-scrollbar">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.035] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-100">Connect a model service</h2>
                <Badge label="guided setup" />
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-500">
                Pick a provider, keep the connection name as default, then add credentials on the
                next screen. Advanced provider settings stay available after the connection opens.
              </p>
            </div>
            <label className="block w-full min-w-0 sm:w-60">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                Connection name
              </span>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="default"
                className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
              />
            </label>
          </div>
        </section>

        {(error || connectionsError) && <ErrorBox message={error || connectionsError || ""} />}

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Saved connections</h3>
            <span className="rounded bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400">
              {loadingConnections ? "Loading..." : `${connections.length} saved`}
            </span>
          </div>

          {loadingConnections ? (
            <LoadingInline label="Loading saved model connections..." />
          ) : connections.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 bg-white/[0.025] px-4 py-5">
              <h4 className="text-sm font-medium text-neutral-100">No model connections yet</h4>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                Start with one of the recommended providers below. The connection will appear here
                after it is created.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
              {connections.map((connection) => {
                const item = items.find((candidate) => candidate.key === connection.providerKey);
                const busy = busyKey === `${connection.providerKey}:${connection.alias}`;
                const deleting = deletingKey === `${connection.providerKey}:${connection.alias}`;
                return (
                  <div
                    key={`${connection.providerKey}:${connection.alias}`}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(140px,1fr)_minmax(120px,180px)_auto] md:items-center"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-neutral-100">
                          {connection.providerLabel}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                          {connection.providerKey}
                        </span>
                      </span>
                    </span>
                    <span className="font-mono text-xs text-neutral-400">{connection.alias}</span>
                    <span className="flex items-center justify-between gap-2 md:justify-end">
                      {connection.badge && <Badge label={connection.badge} />}
                      <button
                        type="button"
                        onClick={() => {
                          if (item) void openConnection(item, connection.alias);
                        }}
                        disabled={!item || busy || deleting}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-cyan-400/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                        Manage
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(connection)}
                        disabled={busy || deleting}
                        aria-label={`Remove ${connection.providerLabel} ${connection.alias}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-500 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deleting ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Add a model connection</h3>
            <span className="text-[10px] uppercase tracking-wide text-neutral-600">
              Recommended
            </span>
          </div>

          {loading ? (
            <LoadingInline label="Loading provider types..." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recommended.map((item) => {
                const busy = busyKey === `${item.key}:${alias.trim() || "default"}`;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => void openConnection(item)}
                    disabled={busy}
                    className="group flex min-h-[132px] flex-col rounded-md border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-400/35 hover:bg-cyan-400/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                        <Sparkles size={16} />
                      </span>
                      <span className="flex items-center gap-2">
                        {item.badge && <Badge label={item.badge} />}
                        {busy ? (
                          <Loader2 size={13} className="animate-spin text-neutral-500" />
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-3 block text-sm font-semibold text-neutral-100">
                      {item.label || item.key}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">
                      {modelProviderHint(item)}
                    </span>
                    <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-medium text-cyan-300">
                      Set up connection
                      <ChevronRight size={13} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <details className="rounded-lg border border-white/10 bg-white/[0.025]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-100">
            Looking for another provider?
          </summary>
          <div className="space-y-3 border-t border-white/10 p-4">
            <label className="block max-w-xl">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                Search all providers
              </span>
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => onFilterChange(e.target.value)}
                  placeholder="Search provider name..."
                  className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-2 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
                />
              </div>
            </label>

            {!loading && filtered.length === 0 && (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
                No provider types match this search.
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="divide-y divide-white/10 overflow-hidden rounded-md border border-white/10">
                {filtered.map((item) => {
                  const busy = busyKey === `${item.key}:${alias.trim() || "default"}`;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => void openConnection(item)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-neutral-100">
                          {item.label || item.key}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                          {item.key}
                        </span>
                      </span>
                      {item.badge && <Badge label={item.badge} />}
                      {busy ? (
                        <Loader2 size={13} className="animate-spin text-neutral-500" />
                      ) : (
                        <ChevronRight size={13} className="text-neutral-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </details>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-model-connection-title"
            className="w-full max-w-md rounded-lg border border-red-500/25 bg-[#060b1a] p-5 shadow-2xl shadow-black/50"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300">
                <Trash2 size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  id="delete-model-connection-title"
                  className="text-sm font-semibold text-neutral-100"
                >
                  Remove model connection?
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                  This removes{" "}
                  <span className="font-medium text-neutral-100">
                    {deleteTarget.providerLabel} / {deleteTarget.alias}
                  </span>{" "}
                  from saved model connections. Agents using this connection may need a new model
                  connection before they can run.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingKey)}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-white/20 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteConnection(deleteTarget)}
                disabled={Boolean(deletingKey)}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingKey ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                Remove
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

type ChannelConnection = {
  channelKey: string;
  channelLabel: string;
  name: string;
  badge?: string;
};

function ChannelConnectionsPanel({
  section,
  items,
  filtered,
  filter,
  loading,
  error,
  onFilterChange,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  items: PickerItem[];
  filtered: PickerItem[];
  filter: string;
  loading: boolean;
  error: string | null;
  onFilterChange: (value: string) => void;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [name, setName] = useState("default");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChannelConnection | null>(null);
  const recommended = useMemo(() => recommendedChannels(items), [items]);

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    setConnectionsError(null);
    try {
      const data = await apiConfigList(section.key);
      setConnections(channelConnectionsFromEntries(data.entries, section.key, items));
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setLoadingConnections(false);
    }
  }, [items, section.key]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function openConnection(item: PickerItem, nextName = name) {
    const clean = nextName.trim() || "default";
    const key = `${item.key}:${clean}`;
    setBusyKey(key);
    setConnectionsError(null);
    try {
      const result = await apiConfigSelectItem(section.key, item.key, clean);
      onSaved();
      await loadConnections();
      onTarget({
        prefix: result.fields_prefix,
        title: `${item.label || item.key} connection`,
        subtitle: result.created
          ? "New channel created. Add credentials, turn it on, and choose where messages should go."
          : "Review credentials, enabled status, and agent routing for this channel.",
      });
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteConnection(connection: ChannelConnection) {
    const key = `${connection.channelKey}:${connection.name}`;
    setDeletingKey(key);
    setConnectionsError(null);
    try {
      await apiConfigDeleteMapKey(`${section.key}.${connection.channelKey}`, connection.name);
      setDeleteTarget(null);
      onSaved();
      await loadConnections();
    } catch (e) {
      setConnectionsError(errorMessage(e));
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="h-full overflow-auto p-5 zc-scrollbar">
      <div className="mx-auto max-w-6xl space-y-5">
        {(error || connectionsError) && <ErrorBox message={error || connectionsError || ""} />}

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Connected channels</h3>
            <span className="rounded bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400">
              {loadingConnections ? "Loading..." : `${connections.length} connected`}
            </span>
          </div>

          {loadingConnections ? (
            <LoadingInline label="Loading connected channels..." />
          ) : connections.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 bg-white/[0.025] px-4 py-5">
              <h4 className="text-sm font-medium text-neutral-100">No channels connected yet</h4>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-500">
                Start with one of the choices below. After setup, it will appear here for quick
                editing.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
              {connections.map((connection) => {
                const item = items.find((candidate) => candidate.key === connection.channelKey);
                const busy = busyKey === `${connection.channelKey}:${connection.name}`;
                const deleting = deletingKey === `${connection.channelKey}:${connection.name}`;
                return (
                  <div
                    key={`${connection.channelKey}:${connection.name}`}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(150px,1fr)_minmax(120px,180px)_auto] md:items-center"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                        <Network size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-neutral-100">
                          {connection.channelLabel}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                          {connection.channelKey}
                        </span>
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] uppercase tracking-wide text-neutral-600">
                        Connection
                      </span>
                      <span className="block truncate font-mono text-xs text-neutral-400">
                        {connection.name}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2 md:justify-end">
                      {connection.badge && <Badge label={connection.badge} />}
                      <button
                        type="button"
                        onClick={() => {
                          if (item) void openConnection(item, connection.name);
                        }}
                        disabled={!item || busy || deleting}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-cyan-400/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                        Edit setup
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(connection)}
                        disabled={busy || deleting}
                        aria-label={`Remove ${connection.channelLabel} ${connection.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-500 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deleting ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-neutral-100">Add a channel</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Choose the platform you want to connect.
              </p>
            </div>
            <label className="block w-full min-w-0 sm:w-64">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                Connection name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="default"
                className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
              />
            </label>
          </div>
          <div className="mb-2 flex justify-end">
            <span className="text-[10px] uppercase tracking-wide text-neutral-600">
              Good first choices
            </span>
          </div>

          {loading ? (
            <LoadingInline label="Loading channel platforms..." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recommended.map((item) => {
                const clean = name.trim() || "default";
                const busy = busyKey === `${item.key}:${clean}`;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => void openConnection(item)}
                    disabled={busy}
                    className="group flex min-h-[138px] flex-col rounded-md border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-400/35 hover:bg-cyan-400/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                        <Network size={16} />
                      </span>
                      <span className="flex items-center gap-2">
                        {item.badge && <Badge label={item.badge} />}
                        {busy ? (
                          <Loader2 size={13} className="animate-spin text-neutral-500" />
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-3 block text-sm font-semibold text-neutral-100">
                      {item.label || item.key}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">
                      {channelHint(item)}
                    </span>
                    <span className="mt-auto flex items-center gap-1 pt-3 text-xs font-medium text-cyan-300">
                      Configure {item.label || item.key}
                      <ChevronRight size={13} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <details className="rounded-lg border border-white/10 bg-white/[0.025]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-100">
            Show all channel platforms
          </summary>
          <div className="space-y-3 border-t border-white/10 p-4">
            <label className="block max-w-xl">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                Search platforms
              </span>
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => onFilterChange(e.target.value)}
                  placeholder="Search platform name..."
                  className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-2 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
                />
              </div>
            </label>

            {!loading && filtered.length === 0 && (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.035] p-3 text-xs text-neutral-500">
                No channel platforms match this search.
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="divide-y divide-white/10 overflow-hidden rounded-md border border-white/10">
                {filtered.map((item) => {
                  const clean = name.trim() || "default";
                  const busy = busyKey === `${item.key}:${clean}`;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => void openConnection(item)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-neutral-100">
                          {item.label || item.key}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                          channels.{item.key}.{name.trim() || "default"}
                        </span>
                      </span>
                      {item.badge && <Badge label={item.badge} />}
                      {busy ? (
                        <Loader2 size={13} className="animate-spin text-neutral-500" />
                      ) : (
                        <ChevronRight size={13} className="text-neutral-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </details>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-channel-connection-title"
            className="w-full max-w-md rounded-lg border border-red-500/25 bg-[#060b1a] p-5 shadow-2xl shadow-black/50"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300">
                <Trash2 size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  id="delete-channel-connection-title"
                  className="text-sm font-semibold text-neutral-100"
                >
                  Remove channel connection?
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                  This removes{" "}
                  <span className="font-medium text-neutral-100">
                    {deleteTarget.channelLabel} / {deleteTarget.name}
                  </span>{" "}
                  from saved channels. Incoming messages for this connection will stop until it is
                  configured again.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingKey)}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-white/20 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteConnection(deleteTarget)}
                disabled={Boolean(deletingKey)}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingKey ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                Remove
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function OneTierAliasManager({
  section,
  items,
  filtered,
  filter,
  selectedItem,
  newItemName,
  loading,
  creatingItem,
  showCreateItem,
  openingKey,
  error,
  inlineTarget,
  onFilterChange,
  onNewItemNameChange,
  onStartCreate,
  onOpenItem,
  onCreateItem,
  onCloseDrawer,
  onSaved,
}: {
  section: ConfigSectionInfo;
  items: PickerItem[];
  filtered: PickerItem[];
  filter: string;
  selectedItem: PickerItem | null;
  newItemName: string;
  loading: boolean;
  creatingItem: boolean;
  showCreateItem: boolean;
  openingKey: string | null;
  error: string | null;
  inlineTarget: FormTarget | null;
  onFilterChange: (value: string) => void;
  onNewItemNameChange: (value: string) => void;
  onStartCreate: () => void;
  onOpenItem: (item: PickerItem) => void;
  onCreateItem: () => void;
  onCloseDrawer: () => void;
  onSaved: () => void;
}) {
  const noun = entryNoun(section);
  const pluralNoun = entryPluralNoun(section);
  const showFilter = items.length > 4 || filter.trim().length > 0;
  const drawerOpen = Boolean(inlineTarget || showCreateItem || openingKey);
  const summaryKind = summaryKindForSection(section.key);
  const [summaryReloadKey, setSummaryReloadKey] = useState(0);
  const [summaryState, setSummaryState] = useState<{
    loading: boolean;
    error: string | null;
    data: ConfigSummaryRows | null;
  }>({ loading: false, error: null, data: null });

  const handleSaved = useCallback(() => {
    setSummaryReloadKey((n) => n + 1);
    onSaved();
  }, [onSaved]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseDrawer();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen, onCloseDrawer]);

  useEffect(() => {
    if (!summaryKind) {
      setSummaryState({ loading: false, error: null, data: null });
      return;
    }
    let cancelled = false;
    setSummaryState((current) => ({ ...current, loading: true, error: null }));
    void configGetSummaries()
      .then((data) => {
        if (cancelled) return;
        setSummaryState({
          loading: false,
          error: null,
          data: {
            agents: data.agents,
            risk_profiles: data.risk_profiles,
            runtime_profiles: data.runtime_profiles,
          },
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setSummaryState((current) => ({
          ...current,
          loading: false,
          error: errorMessage(e),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [summaryKind, summaryReloadKey, items]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-neutral-100">{section.label}</h2>
            {section.help && (
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-neutral-500">
                {section.help}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {loading || summaryState.loading ? (
              <Loader2 size={13} className="animate-spin text-neutral-500" />
            ) : null}
            <span className="rounded bg-white/[0.05] px-2 py-1 text-[11px] text-neutral-400">
              {items.length} {items.length === 1 ? noun : pluralNoun}
            </span>
            <button
              type="button"
              onClick={onStartCreate}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
            >
              <Plus size={13} />
              {createEntryLabel(section)}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
        {summaryState.error && (
          <div className="mt-3">
            <ErrorBox message={summaryState.error} />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <main className="h-full overflow-auto p-5 zc-scrollbar">
          <div className="mx-auto max-w-6xl space-y-4">
            {showFilter && (
              <label className="block max-w-md">
                <span className="sr-only">Filter {pluralNoun}</span>
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
                  />
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    placeholder={`Filter ${pluralNoun}...`}
                    className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-2 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
                  />
                </div>
              </label>
            )}

            {loading && <LoadingInline label={`Loading ${section.label.toLowerCase()}...`} />}
            {!loading && filtered.length === 0 && (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.035] p-6 text-sm text-neutral-500">
                {filter ? `No ${pluralNoun} match this filter.` : `No ${pluralNoun} yet.`}
              </div>
            )}
            {!loading && filtered.length > 0 && (
              <AliasRows
                section={section}
                items={filtered}
                selectedKey={selectedItem?.key ?? null}
                openingKey={openingKey}
                summaryKind={summaryKind}
                summaries={summaryState.data}
                onOpenItem={onOpenItem}
              />
            )}
          </div>
        </main>
      </div>

      {drawerOpen && (
        <div className="absolute inset-0 z-20 flex bg-[#000010]/70 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label={`Close ${noun} editor`}
            onClick={onCloseDrawer}
            className="hidden min-w-8 flex-1 cursor-default lg:block"
          />
          <div className="h-full w-full max-w-[980px] border-l border-white/10 bg-[#020818] shadow-2xl shadow-black/50">
            {inlineTarget ? (
              <ConfigFieldForm
                target={inlineTarget}
                onBack={onCloseDrawer}
                backLabel="Close"
                onSaved={handleSaved}
              />
            ) : openingKey ? (
              <div className="flex h-full flex-col">
                <DrawerHeader title={`Opening ${noun}`} code={openingKey} onClose={onCloseDrawer} />
                <LoadingInline label={`Opening ${noun}...`} />
              </div>
            ) : (
              <NewAliasDrawer
                section={section}
                newItemName={newItemName}
                creatingItem={creatingItem}
                onNewItemNameChange={onNewItemNameChange}
                onCreateItem={onCreateItem}
                onClose={onCloseDrawer}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type SummaryKind = "agents" | "risk_profiles" | "runtime_profiles";
type ConfigSummaryRows = {
  agents: AgentSummary[];
  risk_profiles: RiskProfileSummary[];
  runtime_profiles: RuntimeProfileSummary[];
};

function AliasRows({
  section,
  items,
  selectedKey,
  openingKey,
  summaryKind,
  summaries,
  onOpenItem,
}: {
  section: ConfigSectionInfo;
  items: PickerItem[];
  selectedKey: string | null;
  openingKey: string | null;
  summaryKind: SummaryKind | null;
  summaries: ConfigSummaryRows | null;
  onOpenItem: (item: PickerItem) => void;
}) {
  const summaryByAlias = useMemo(() => {
    const map = new Map<string, AgentSummary | RiskProfileSummary | RuntimeProfileSummary>();
    if (summaryKind && summaries) {
      for (const summary of summaries[summaryKind]) map.set(summary.alias, summary);
    }
    return map;
  }, [summaries, summaryKind]);

  return (
    <div className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
      {items.map((item) => {
        const selected = selectedKey === item.key;
        const busy = openingKey === item.key;
        const summary = summaryByAlias.get(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onOpenItem(item)}
            className={`grid w-full gap-3 px-4 py-3 text-left transition md:grid-cols-[minmax(170px,0.9fr)_minmax(260px,1.6fr)_auto] md:items-center ${
              selected ? "bg-cyan-400/10" : "hover:bg-white/[0.04] hover:text-neutral-100"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  selected ? "bg-cyan-300" : statusDotClass(summary, item)
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-neutral-100">
                  {item.label || item.key}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                  {section.key}.{item.key}
                </span>
              </span>
              {busy ? <Loader2 size={12} className="animate-spin text-neutral-500" /> : null}
            </div>

            <div className="min-w-0">
              {summaryKind === "agents" && summary ? (
                <AgentSummaryLine summary={summary as AgentSummary} />
              ) : summaryKind === "risk_profiles" && summary ? (
                <RiskProfileSummaryLine summary={summary as RiskProfileSummary} />
              ) : summaryKind === "runtime_profiles" && summary ? (
                <RuntimeProfileSummaryLine summary={summary as RuntimeProfileSummary} />
              ) : (
                <GenericAliasLine item={item} />
              )}
            </div>

            <div className="flex min-w-0 items-center justify-between gap-3 md:justify-end">
              {summaryBadge(summary, item) && (
                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-neutral-400">
                  {summaryBadge(summary, item)}
                </span>
              )}
              <ChevronRight size={14} className="shrink-0 text-neutral-500" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AgentSummaryLine({ summary }: { summary: AgentSummary }) {
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1 text-[11px] text-neutral-400 lg:grid-cols-3">
        <SummaryValue label="Model" value={summary.model_provider} />
        <SummaryValue label="Safety" value={summary.risk_profile} />
        <SummaryValue label="Runtime" value={summary.runtime_profile} />
      </div>
      <SummaryPills
        items={[
          summary.channels.length ? `${summary.channels.length} channels` : "No channels",
          summary.peer_groups.length ? `${summary.peer_groups.length} groups` : "",
          bundleCount(summary) ? `${bundleCount(summary)} bundles` : "",
        ]}
      />
      {summary.missing.length > 0 && (
        <div className="truncate text-[10px] text-amber-300">
          Missing: {summary.missing.join(", ")}
        </div>
      )}
    </div>
  );
}

function RiskProfileSummaryLine({ summary }: { summary: RiskProfileSummary }) {
  const approval = summary.require_approval_for_medium_risk
    ? "medium risk asks"
    : "medium risk not set";
  const sandbox =
    summary.sandbox_enabled === null
      ? "sandbox inherits"
      : summary.sandbox_enabled
        ? `sandbox ${summary.sandbox_backend || "enabled"}`
        : "sandbox off";
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1 text-[11px] text-neutral-400 lg:grid-cols-3">
        <SummaryValue label="Level" value={summary.level} />
        <SummaryValue label="Approval" value={approval} />
        <SummaryValue label="Sandbox" value={sandbox} />
      </div>
      <SummaryPills
        items={[
          `${summary.allowed_commands.length} commands`,
          `${summary.auto_approve.length} auto`,
          `${summary.always_ask.length} ask`,
          usedByLabel(summary.used_by_agents),
        ]}
      />
    </div>
  );
}

function RuntimeProfileSummaryLine({ summary }: { summary: RuntimeProfileSummary }) {
  return (
    <div className="space-y-1.5">
      <div className="grid gap-1 text-[11px] text-neutral-400 lg:grid-cols-3">
        <SummaryValue label="Mode" value={summary.agentic ? "agentic" : "single turn"} />
        <SummaryValue label="Iterations" value={inheritNumber(summary.max_tool_iterations)} />
        <SummaryValue label="Timeout" value={secondsLabel(summary.shell_timeout_secs)} />
      </div>
      <SummaryPills
        items={[
          `${summary.max_actions_per_hour ?? 0} actions/hr`,
          centsLabel(summary.max_cost_per_day_cents),
          summary.parallel_tools ? "parallel tools" : "",
          usedByLabel(summary.used_by_agents),
        ]}
      />
    </div>
  );
}

function GenericAliasLine({ item }: { item: PickerItem }) {
  return item.description ? (
    <p className="text-[11px] leading-relaxed text-neutral-500">{item.description}</p>
  ) : (
    <span className="text-[11px] text-neutral-500">Open details</span>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 truncate">
      <span className="text-neutral-600">{label}: </span>
      <span className="font-mono text-neutral-300">{value || "Not set"}</span>
    </span>
  );
}

function SummaryPills({ items }: { items: string[] }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visible.map((item) => (
        <span
          key={item}
          className="rounded bg-white/[0.045] px-1.5 py-0.5 text-[10px] text-neutral-500"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function summaryKindForSection(sectionKey: string): SummaryKind | null {
  if (sectionKey === "agents") return "agents";
  if (sectionKey === "risk_profiles") return "risk_profiles";
  if (sectionKey === "runtime_profiles") return "runtime_profiles";
  return null;
}

function summaryBadge(
  summary: AgentSummary | RiskProfileSummary | RuntimeProfileSummary | undefined,
  item: PickerItem,
) {
  if (summary && "dispatchable" in summary) {
    return summary.dispatchable ? "ready" : "needs setup";
  }
  return item.badge;
}

function statusDotClass(
  summary: AgentSummary | RiskProfileSummary | RuntimeProfileSummary | undefined,
  item: PickerItem,
) {
  if (summary && "dispatchable" in summary) {
    return summary.dispatchable ? "bg-emerald-400" : "bg-amber-400";
  }
  return item.badge ? "bg-emerald-400" : "bg-white/[0.12]";
}

function bundleCount(summary: AgentSummary) {
  return (
    summary.skill_bundles.length + summary.knowledge_bundles.length + summary.mcp_bundles.length
  );
}

function usedByLabel(agents: string[]) {
  return agents.length ? `used by ${agents.length}` : "unused";
}

function inheritNumber(value: number | null) {
  return value && value > 0 ? String(value) : "inherit";
}

function secondsLabel(value: number | null) {
  return value && value > 0 ? `${value}s` : "inherit";
}

function centsLabel(value: number | null) {
  return value && value > 0 ? `$${(value / 100).toFixed(2)}/day` : "budget inherit";
}

function DrawerHeader({
  title,
  code,
  onClose,
}: {
  title: string;
  code?: string;
  onClose: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-white/10 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-neutral-100">{title}</h2>
            {code && (
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                {code}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-400 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-100"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}

function NewAliasDrawer({
  section,
  newItemName,
  creatingItem,
  onNewItemNameChange,
  onCreateItem,
  onClose,
}: {
  section: ConfigSectionInfo;
  newItemName: string;
  creatingItem: boolean;
  onNewItemNameChange: (value: string) => void;
  onCreateItem: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DrawerHeader title={createEntryLabel(section)} code={section.key} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
        <div className="space-y-4">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              {entryNameLabel(section)}
            </span>
            <input
              type="text"
              value={newItemName}
              autoFocus
              onChange={(e) => onNewItemNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateItem();
              }}
              placeholder={entryNamePlaceholder(section)}
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </label>
          <button
            type="button"
            onClick={onCreateItem}
            disabled={!newItemName.trim() || creatingItem}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingItem ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {createButtonLabel(section)}
          </button>
        </div>
      </div>
    </div>
  );
}

function TypedAliasPanel({
  section,
  item,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo;
  item: PickerItem;
  onTarget: (target: FormTarget) => void;
  onSaved: () => void;
}) {
  const prefix = `${section.key}.${item.key}`;
  const [aliases, setAliases] = useState<string[]>([]);
  const [alias, setAlias] = useState("default");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAliases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiConfigList(prefix);
      const next = aliasesFromEntries(data.entries, prefix);
      setAliases(next);
      setAlias((current) => current || next[0] || "default");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [prefix]);

  useEffect(() => {
    void loadAliases();
  }, [loadAliases]);

  async function openAlias(nextAlias: string) {
    const clean = nextAlias.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiConfigSelectItem(section.key, item.key, clean);
      onSaved();
      onTarget({
        prefix: result.fields_prefix,
        title: `${item.label} / ${clean}`,
        subtitle: result.created ? "Created new alias" : item.description,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-5 zc-scrollbar">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-neutral-100">{item.label}</h2>
            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
              {item.key}
            </span>
          </div>
          {(loading || busy) && <Loader2 size={13} className="animate-spin text-neutral-500" />}
        </div>
        {item.description && (
          <p className="text-xs leading-relaxed text-neutral-500">{item.description}</p>
        )}

        <section className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[minmax(180px,260px)_minmax(180px,1fr)_auto] md:items-end">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              Existing aliases
            </span>
            <select
              value=""
              onChange={(e) => void openAlias(e.target.value)}
              disabled={loading || busy || aliases.length === 0}
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-2 font-mono text-xs text-neutral-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{aliases.length ? "Select alias" : "No aliases"}</option>
              {aliases.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
              Provider alias
            </span>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void openAlias(alias || "default");
              }}
              placeholder="default"
              className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-2 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
            />
          </label>

          <button
            type="button"
            onClick={() => void openAlias(alias || "default")}
            disabled={busy}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-sky-400 px-3 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Open alias
          </button>
        </section>
        {error && <ErrorBox message={error} />}
      </div>
    </div>
  );
}

function ConfigFieldForm({
  target,
  onBack,
  backLabel = "Back",
  onSaved,
}: {
  target: FormTarget;
  onBack?: () => void;
  backLabel?: string;
  onSaved: () => void;
}) {
  const [entries, setEntries] = useState<ConfigListEntry[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [seed, setSeed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"fields" | "setup">(
    target.initialTab === "setup" ? "setup" : "fields",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiConfigList(target.prefix);
      const nextSeed: Record<string, string> = {};
      for (const entry of data.entries) nextSeed[entry.path] = defaultDraft(entry);
      setEntries(data.entries);
      setSeed(nextSeed);
      setDraft(nextSeed);
      setValidationErrors({});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [target.prefix]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyEntries = entries.filter((entry) => draft[entry.path] !== seed[entry.path]);
  const tabs = useMemo(() => groupFields(entries), [entries]);
  const setupTargets = useMemo(() => setupTargetsForPrefix(target.prefix), [target.prefix]);

  useEffect(() => {
    setActiveTab(target.initialTab === "setup" ? "setup" : "fields");
  }, [target.prefix, target.initialTab]);

  async function save() {
    if (dirtyEntries.length === 0) return;
    setSaving(true);
    setError(null);
    setValidationErrors({});
    setSaved(false);
    try {
      const errors: Record<string, string> = {};
      const ops: PatchOp[] = [];
      for (const entry of dirtyEntries) {
        try {
          ops.push({
            op: entry.populated || entry.is_secret ? "replace" : "add",
            path: dottedToPointer(entry.path),
            value: parseConfigDraft(entry, draft[entry.path] ?? "").value,
          });
        } catch (e) {
          errors[entry.path] = configDraftError(e) ?? errorMessage(e);
        }
      }
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }
      await apiConfigPatch(ops);
      setSaved(true);
      await load();
      onSaved();
      window.setTimeout(() => setSaved(false), 1200);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-400 hover:border-cyan-400/50 hover:text-cyan-300"
                >
                  {backLabel}
                </button>
              )}
              <h2 className="truncate text-sm font-semibold text-neutral-100">{target.title}</h2>
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                {target.prefix}
              </span>
            </div>
            {target.subtitle && (
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-neutral-500">
                {target.subtitle}
              </p>
            )}
          </div>
          {activeTab === "fields" && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={dirtyEntries.length === 0 || saving}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : saved ? (
                <Check size={12} />
              ) : (
                <Save size={12} />
              )}
              {saved ? "Saved" : "Save"}
            </button>
          )}
        </div>
        {setupTargets.length > 0 && (
          <div className="mt-3 flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("fields")}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] ${
                activeTab === "fields"
                  ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 text-neutral-400 hover:border-white/15 hover:text-neutral-100"
              }`}
            >
              <Code2 size={12} />
              Fields
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("setup")}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] ${
                activeTab === "setup"
                  ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 text-neutral-400 hover:border-white/15 hover:text-neutral-100"
              }`}
            >
              <Wrench size={12} />
              Setup/Doctor
            </button>
          </div>
        )}
      </header>
      {activeTab === "setup" && setupTargets.length > 0 ? (
        <SetupDoctorTab prefix={target.prefix} title={target.title} onConfigSaved={onSaved} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
          {loading && <LoadingInline label="Loading fields..." />}
          {error && <ErrorBox message={error} />}
          {!loading && !error && entries.length === 0 && (
            <EmptyState
              icon={<Code2 size={28} />}
              title="No fields for this prefix"
              body="The gateway did not report editable config fields under this prefix."
            />
          )}
          {!loading && entries.length > 0 && (
            <div className="mx-auto max-w-4xl space-y-5">
              <ConfigTaskSummary prefix={target.prefix} entries={entries} />
              {tabs.map(({ label, fields }) => (
                <section key={label} className="rounded-lg border border-white/10 bg-white/[0.035]">
                  <h3 className="border-b border-white/10 px-4 py-3 text-sm font-medium text-neutral-100">
                    {label}
                  </h3>
                  <div className="divide-y divide-white/10">
                    {fields.map((entry) => (
                      <FieldRow
                        key={entry.path}
                        entry={entry}
                        value={draft[entry.path] ?? ""}
                        dirty={draft[entry.path] !== seed[entry.path]}
                        error={validationErrors[entry.path]}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            [entry.path]: value,
                          }))
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigTaskSummary({ prefix, entries }: { prefix: string; entries: ConfigListEntry[] }) {
  const tasks = formTasksForPrefix(prefix, entries);
  if (tasks.length === 0) return null;

  return (
    <section className="grid gap-2 md:grid-cols-3">
      {tasks.map((task) => (
        <div
          key={task.label}
          className="rounded-md border border-white/10 bg-white/[0.025] px-3 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-neutral-100">{task.label}</span>
            <TaskBadge state={task.state} />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{task.detail}</p>
        </div>
      ))}
    </section>
  );
}

function FieldRow({
  entry,
  value,
  dirty,
  error,
  onChange,
}: {
  entry: ConfigListEntry;
  value: string;
  dirty: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const label = leafLabel(entry.path);
  return (
    <div className="grid gap-3 px-4 py-3 text-xs lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-neutral-200">{label}</span>
          {dirty && <Badge label="edited" />}
          {entry.is_secret && <Badge label="secret" />}
          {entry.is_env_overridden && <Badge label="env" />}
        </div>
        <div className="mt-1 truncate font-mono text-[10px] text-neutral-500">{entry.path}</div>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-500">
          <span>{entry.kind}</span>
          {entry.type_hint && <span>{entry.type_hint}</span>}
          {entry.category && <span>{entry.category}</span>}
        </div>
      </div>
      <div className="min-w-0">
        <FieldInput entry={entry} value={value} onChange={onChange} />
        {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
      </div>
    </div>
  );
}

function FieldInput({
  entry,
  value,
  onChange,
}: {
  entry: ConfigListEntry;
  value: string;
  onChange: (value: string) => void;
}) {
  if (entry.kind === "bool") {
    return (
      <Switch
        checked={value === "true"}
        onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        label={value === "true" ? "true" : "false"}
      />
    );
  }

  if (entry.kind === "enum" && entry.enum_variants?.length) {
    return (
      <Select
        value={value || "__unset__"}
        onValueChange={(next) => onChange(next === "__unset__" ? "" : next)}
        options={[
          { value: "__unset__", label: "unset" },
          ...entry.enum_variants.map((variant) => ({ value: variant, label: variant })),
        ]}
        className="w-full max-w-xl"
      />
    );
  }

  if (entry.kind === "integer" || entry.kind === "float") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-cyan-400"
      />
    );
  }

  if (entry.kind === "string-array" || entry.kind === "object-array") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100 outline-none focus:border-cyan-400"
      />
    );
  }

  if (entry.is_secret) {
    return (
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={entry.populated ? "Secret is set. Type to replace." : "Enter secret value"}
        className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
      />
    );
  }

  const multiline = value.length > 80 || /prompt|template|description|system/i.test(entry.path);
  return multiline ? (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className="w-full resize-y rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100 outline-none focus:border-cyan-400"
    />
  ) : (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-xl rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-cyan-400"
    />
  );
}

function AdvancedConfigEditor() {
  const [entries, setEntries] = useState<ConfigListEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ConfigListEntry | null>(null);
  const [draft, setDraft] = useState("");
  const [seed, setSeed] = useState("");
  const [templates, setTemplates] = useState<ConfigTemplate[] | null>(null);
  const [reloadStatus, setReloadStatus] = useState<string | null>(null);
  const [driftStatus, setDriftStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapPath, setMapPath] = useState("");
  const [mapKey, setMapKey] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [skillsAvailable, setSkillsAvailable] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiConfigList();
      setEntries(data.entries);
      void apiConfigReloadStatus()
        .then((status) => setReloadStatus(status.status ?? JSON.stringify(status)))
        .catch(() => setReloadStatus(null));
      void apiConfigDrift()
        .then((drift) =>
          setDriftStatus(drift.drifted ? `${drift.drifted.length} drifted paths` : "available"),
        )
        .catch(() => setDriftStatus(null));
      void apiConfigTemplates()
        .then((resp) => setTemplates(resp.templates))
        .catch(() => setTemplates(null));
      void apiSkillBundles()
        .then(() => setSkillsAvailable(true))
        .catch(() => setSkillsAvailable(false));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(entry: ConfigListEntry) {
    setSelected(entry);
    setError(null);
    try {
      const result = await apiConfigProp(entry.path);
      const next = entry.is_secret ? "" : formatRawValue(result.value ?? entry.value ?? "");
      setSeed(next);
      setDraft(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await apiConfigPutProp(selected.path, parseRawConfigDraft(draft));
      setSeed(draft);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function reveal() {
    if (!selected) return;
    setError(null);
    try {
      const result = await apiConfigProp(selected.path, true);
      const next = formatRawValue(result.value ?? "");
      setSeed(next);
      setDraft(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteProp() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await apiConfigDeleteProp(selected.path);
      setSelected(null);
      setDraft("");
      setSeed("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function createMapKey() {
    if (!mapPath.trim() || !mapKey.trim()) return;
    setError(null);
    try {
      const result = await apiConfigCreateMapKey(
        mapPath.trim(),
        mapKey.trim(),
        templateKey || undefined,
      );
      const prefix = result.fields_prefix ?? result.path ?? `${mapPath}.${mapKey}`;
      setFilter(prefix);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteMapKey() {
    if (!mapPath.trim() || !mapKey.trim()) return;
    setError(null);
    try {
      await apiConfigDeleteMapKey(mapPath.trim(), mapKey.trim());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? entries.filter((entry) =>
          [entry.path, entry.category, entry.kind, entry.type_hint].some((v) =>
            String(v ?? "")
              .toLowerCase()
              .includes(q),
          ),
        )
      : entries;
  }, [entries, filter]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10">
        <div className="border-b border-white/10 p-3">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search raw paths..."
            className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
          />
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-neutral-500">
            {reloadStatus && <Badge label={`reload ${reloadStatus}`} />}
            {driftStatus && <Badge label={driftStatus} />}
            {skillsAvailable === true && <Badge label="skills" />}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 zc-scrollbar">
          {loading && <LoadingInline label="Loading raw paths..." />}
          {filtered.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => void open(entry)}
              className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
                selected?.path === entry.path
                  ? "bg-cyan-400/10 text-cyan-100"
                  : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs">{leafLabel(entry.path)}</span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-neutral-500">
                  {entry.path}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <main className="min-h-0 min-w-0 overflow-hidden">
        {!selected ? (
          <div className="h-full overflow-auto p-5 zc-scrollbar">
            <div className="mx-auto max-w-4xl space-y-4">
              <EmptyState
                icon={<Code2 size={28} />}
                title="Select a raw path"
                body="Advanced mode edits one property at a time through /api/config/prop."
              />
              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h3 className="mb-3 text-sm font-medium text-neutral-100">Map key tools</h3>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_160px_auto_auto]">
                  <input
                    value={mapPath}
                    onChange={(e) => setMapPath(e.target.value)}
                    placeholder="map path, e.g. model_providers.openai"
                    className="rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
                  />
                  <input
                    value={mapKey}
                    onChange={(e) => setMapKey(e.target.value)}
                    placeholder="alias"
                    className="rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 outline-none focus:border-cyan-400"
                  />
                  <select
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                    className="rounded-md border border-white/10 bg-[#020818]/90 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-cyan-400"
                  >
                    <option value="">no template</option>
                    {(templates ?? []).map((template, idx) => {
                      const key = template.key ?? template.name ?? String(idx);
                      return (
                        <option key={key} value={key}>
                          {template.label ?? template.name ?? key}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={() => void createMapKey()}
                    className="rounded bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteMapKey()}
                    className="rounded border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-red-500/50 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
                {templates === null && (
                  <p className="mt-2 text-[10px] text-neutral-500">
                    Templates endpoint unavailable on this gateway.
                  </p>
                )}
              </section>
              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h3 className="text-sm font-medium text-neutral-100">Skills</h3>
                <p className="mt-2 text-xs text-neutral-500">
                  {skillsAvailable
                    ? "Skills bundle endpoints are available. Bundle editing can be reached through raw paths and gateway skill APIs."
                    : "Skills bundle endpoints are not exposed by this gateway, so this area is hidden from the main editor."}
                </p>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <header className="flex shrink-0 items-start gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-mono text-sm text-neutral-100">{selected.path}</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {selected.kind} {selected.type_hint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void reveal()}
                disabled={!selected.is_secret}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:border-cyan-400/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Eye size={12} />
                Reveal
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={draft === seed || saving}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-400 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ${selected.path}?`)) void deleteProp();
                }}
                disabled={saving}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5 zc-scrollbar">
              {error && <ErrorBox message={error} />}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="h-[520px] w-full resize-none rounded-md border border-white/10 bg-[#020818]/90 p-3 font-mono text-xs leading-relaxed text-neutral-100 outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <div className="mx-auto mb-3 flex justify-center text-neutral-600">{icon}</div>
        <h2 className="text-sm font-medium text-neutral-200">{title}</h2>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-500">{body}</p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="m-1 mb-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <pre className="whitespace-pre-wrap font-mono">{message}</pre>
    </div>
  );
}

function sectionByRoot(sections: ConfigSectionInfo[], root: string) {
  return (
    sections.find((section) => section.key === root) ??
    sections.find((section) => section.key.startsWith(`${root}.`)) ??
    null
  );
}

function statusState(section: ConfigSectionInfo | null): TaskState {
  if (!section) return "neutral";
  if (section.ready) return "ready";
  if (section.completed) return "needs";
  return "neutral";
}

function LoadingInline({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-2 text-xs text-neutral-500">
      <Loader2 size={13} className="animate-spin" />
      {label}
    </div>
  );
}

function Badge({ label }: { label: string }) {
  const good = ["active", "configured", "created", "ready"].includes(label);
  const warn = label === "needs setup" || label === "env";
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
        good
          ? "bg-emerald-500/10 text-emerald-300"
          : warn
            ? "bg-amber-500/10 text-amber-300"
            : "bg-white/[0.05] text-neutral-500"
      }`}
    >
      {label}
    </span>
  );
}

function SectionStatusBadge({ section }: { section: ConfigSectionInfo }) {
  const label = sectionStatusLabel(section);
  const tone = section.ready
    ? "bg-emerald-500/10 text-emerald-300"
    : section.completed
      ? "bg-amber-500/10 text-amber-300"
      : "bg-white/[0.05] text-neutral-500";
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${tone}`}>{label}</span>;
}

function SectionStateDot({ section }: { section: ConfigSectionInfo }) {
  const color = section.ready
    ? "bg-emerald-400"
    : section.completed
      ? "bg-amber-400"
      : "bg-white/[0.12]";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

interface SectionStats {
  ready: number;
  completed: number;
  needs: number;
  empty: number;
  quickstart: number;
}

function getSectionStats(sections: ConfigSectionInfo[]): SectionStats {
  const ready = sections.filter((section) => section.ready).length;
  const completed = sections.filter((section) => section.completed).length;
  const quickstart = sections.filter((section) => section.is_quickstart).length;
  return {
    ready,
    completed,
    needs: sections.length - ready,
    empty: sections.filter((section) => !section.ready && !section.completed).length,
    quickstart,
  };
}

function groupSections(sections: ConfigSectionInfo[]) {
  const groups = new Map<string, ConfigSectionInfo[]>();
  for (const section of sections) {
    const group = section.group || "Other";
    groups.set(group, [...(groups.get(group) ?? []), section]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
    .map(([group, items]) => ({ group, items }));
}

function filterSections(sections: ConfigSectionInfo[], filter: string) {
  const q = filter.trim().toLowerCase();
  if (!q) return sections;
  return sections.filter((section) =>
    [section.key, section.label, section.group, section.help]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  );
}

function filterSectionsByStatus(sections: ConfigSectionInfo[], statusFilter: StatusFilter) {
  if (statusFilter === "ready") return sections.filter((section) => section.ready);
  if (statusFilter === "needs") return sections.filter((section) => !section.ready);
  return sections;
}

function sectionMatchesCategory(section: ConfigSectionInfo, category: ConfigCategory) {
  return sectionMatchesKeys(section, category.sectionKeys);
}

function sectionMatchesKeys(section: ConfigSectionInfo, keys: string[]) {
  return keys.some((key) => section.key === key || section.key.startsWith(`${key}.`));
}

function orderSectionsForCategory(sections: ConfigSectionInfo[], category: ConfigCategory) {
  return [...sections].sort((a, b) => {
    const aRank = categoryKeyRank(a.key, category.sectionKeys);
    const bRank = categoryKeyRank(b.key, category.sectionKeys);
    return aRank - bRank || a.label.localeCompare(b.label);
  });
}

function categoryKeyRank(sectionKey: string, keys: string[]) {
  const idx = keys.findIndex((key) => sectionKey === key || sectionKey.startsWith(`${key}.`));
  return idx >= 0 ? idx : keys.length;
}

function categorySectionLabel(category: ConfigCategory, section: ConfigSectionInfo) {
  if (category.id === "models-providers" && section.key === "providers.models") {
    return "Providers";
  }
  if (category.id === "agents" && section.key === "agents") return "Agent aliases";
  if (category.id === "agents" && section.key === "peer_groups") return "Peer groups";
  if (category.id === "runtime-safety" && section.key === "risk_profiles") {
    return "Risk profiles";
  }
  if (category.id === "runtime-safety" && section.key === "runtime_profiles") {
    return "Runtime profiles";
  }
  if (category.id === "channels" && section.key === "channels") return "Channel aliases";
  if (category.id === "tools-skills" && section.key === "tools") return "Tools";
  if (category.id === "tools-skills" && section.key === "skills") return "Skills";
  if (category.id === "tools-skills" && section.key === "skill_bundles") {
    return "Skill bundles";
  }
  if (category.id === "tools-skills" && section.key === "mcp") return "MCP servers";
  return section.label;
}

function entryNoun(section: ConfigSectionInfo) {
  if (section.key === "risk_profiles") return "risk profile";
  if (section.key === "agents" || section.key.startsWith("agents.")) return "agent";
  if (section.key === "channels" || section.key.startsWith("channels.")) return "channel alias";
  if (section.key === "providers.models" || section.key.startsWith("providers.models.")) {
    return "provider";
  }
  return section.shape === "typed_family_map" ? "alias" : "entry";
}

function entryPluralNoun(section: ConfigSectionInfo) {
  const noun = entryNoun(section);
  if (noun === "entry") return "entries";
  if (noun === "alias") return "aliases";
  if (noun === "channel alias") return "channel aliases";
  return `${noun}s`;
}

function groupRank(group: string) {
  const idx = GROUP_ORDER.indexOf(group as (typeof GROUP_ORDER)[number]);
  return idx >= 0 ? idx : GROUP_ORDER.length;
}

function iconForGroup(group: string) {
  return GROUP_ICONS[group] ?? Layers3;
}

function sectionStatusLabel(section: ConfigSectionInfo) {
  if (section.ready) return "ready";
  if (section.completed) return "partial";
  return "empty";
}

function groupFields(entries: ConfigListEntry[]) {
  const groups = new Map<string, ConfigListEntry[]>();
  for (const entry of [...entries].sort(fieldSort)) {
    const group = entry.tab || entry.category || "Fields";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }
  return Array.from(groups.entries()).map(([label, fields]) => ({ label, fields }));
}

function fieldSort(a: ConfigListEntry, b: ConfigListEntry) {
  return fieldPriority(a) - fieldPriority(b) || a.path.localeCompare(b.path);
}

function fieldPriority(entry: ConfigListEntry) {
  const leaf = entry.path.split(".").pop() ?? "";
  const order = [
    "enabled",
    "model",
    "api_key",
    "requires_openai_auth",
    "uri",
    "model_provider",
    "risk_profile",
    "runtime_profile",
    "channels",
  ];
  const idx = order.indexOf(leaf);
  return idx >= 0 ? idx : 100;
}

function aliasesFromEntries(entries: ConfigListEntry[], prefix: string) {
  const prefixDot = `${prefix}.`;
  const aliases = new Set<string>();
  for (const entry of entries) {
    const rest = entry.path.startsWith(prefixDot) ? entry.path.slice(prefixDot.length) : "";
    const alias = rest.split(".")[0];
    if (alias) aliases.add(alias);
  }
  return Array.from(aliases).sort();
}

function modelConnectionsFromEntries(
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

function channelConnectionsFromEntries(
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

function recommendedModelProviders(items: PickerItem[]) {
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

function recommendedChannels(items: PickerItem[]) {
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

function modelProviderHint(item: PickerItem) {
  if (item.description) return item.description;
  const name = (item.label || item.key).toLowerCase();
  if (name.includes("openrouter")) return "Good first choice for routing many hosted models.";
  if (name.includes("openai")) return "Use OpenAI-compatible chat, reasoning, and tool models.";
  if (name.includes("anthropic")) return "Connect Claude models with your provider credentials.";
  if (name.includes("gemini") || name.includes("google")) return "Connect Google Gemini models.";
  if (name.includes("ollama")) return "Use local models running on this machine or network.";
  return "Create a reusable connection for agents.";
}

function channelHint(item: PickerItem) {
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

function dottedToPointer(path: string) {
  return `/${path
    .split(".")
    .map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
}

function leafLabel(path: string) {
  const leaf = path.split(".").pop() || path;
  return leaf.replace(/[-_]/g, " ");
}

function createEntryLabel(section: ConfigSectionInfo) {
  return `New ${entryNoun(section)}`;
}

function createButtonLabel(section: ConfigSectionInfo) {
  return `Create ${entryNoun(section)}`;
}

function entryNameLabel(section: ConfigSectionInfo) {
  if (section.key === "channels" || section.key.startsWith("channels.")) return "Channel alias";
  if (section.key === "agents" || section.key.startsWith("agents.")) return "Agent alias";
  if (section.key === "risk_profiles") return "Risk profile name";
  return "Entry name";
}

function entryNamePlaceholder(section: ConfigSectionInfo) {
  if (section.key === "risk_profiles") return "profile name, e.g. dev";
  if (section.key === "agents" || section.key.startsWith("agents.")) return "agent alias, e.g. dev";
  if (section.key === "channels" || section.key.startsWith("channels.")) return "channel alias";
  return "entry name";
}

function pickerSelectionLabel(section: ConfigSectionInfo) {
  if (section.key === "providers.models") return "Provider type";
  return "Selection";
}

function pickerSelectionOption(section: ConfigSectionInfo) {
  if (section.key === "providers.models") return "provider type";
  return entryNoun(section);
}

function choiceCountLabel(section: ConfigSectionInfo, count: number) {
  if (section.key === "providers.models") {
    return `${count} provider ${count === 1 ? "type" : "types"}`;
  }
  return `${count} choices`;
}

function formTasksForPrefix(prefix: string, entries: ConfigListEntry[]) {
  if (prefix.startsWith("providers.models.")) {
    return [
      {
        label: "Credentials",
        detail: configuredDetail(
          entries,
          ["api_key", "token", "credential"],
          "Secret field is set",
        ),
        state: configuredState(entries, ["api_key", "token", "credential"]),
      },
      {
        label: "Model",
        detail: configuredDetail(entries, ["model", "deployment"], "Model value is set"),
        state: configuredState(entries, ["model", "deployment"]),
      },
      {
        label: "Endpoint",
        detail: configuredDetail(
          entries,
          ["base_url", "uri", "endpoint"],
          "Endpoint override is set",
        ),
        state: configuredState(entries, ["base_url", "uri", "endpoint"], "neutral"),
      },
    ];
  }

  if (prefix === "channels" || prefix.startsWith("channels.")) {
    return [
      {
        label: "Enabled",
        detail: configuredDetail(entries, ["enabled"], "Enabled field is set"),
        state: configuredState(entries, ["enabled"], "neutral"),
      },
      {
        label: "Token/webhook",
        detail: configuredDetail(entries, ["token", "secret", "webhook"], "Secret field is set"),
        state: configuredState(entries, ["token", "secret", "webhook"]),
      },
      {
        label: "Agent routing",
        detail: configuredDetail(
          entries,
          ["owning_agent", "agent", "peer_group"],
          "Routing field is set",
        ),
        state: configuredState(entries, ["owning_agent", "agent", "peer_group"], "neutral"),
      },
    ];
  }

  return [];
}

function configuredState(
  entries: ConfigListEntry[],
  leaves: string[],
  fallback: TaskState = "needs",
): TaskState {
  return entries.some((entry) => entryMatchesLeaf(entry, leaves) && entryHasValue(entry))
    ? "ready"
    : fallback;
}

function configuredDetail(entries: ConfigListEntry[], leaves: string[], readyDetail: string) {
  const match = entries.find((entry) => entryMatchesLeaf(entry, leaves));
  if (!match) return "No matching field reported";
  if (entryHasValue(match)) return readyDetail;
  return match.is_secret ? "Secret is not set yet" : "Value is not set yet";
}

function entryMatchesLeaf(entry: ConfigListEntry, leaves: string[]) {
  const leaf = entry.path.split(".").pop() ?? "";
  return leaves.some((name) => leaf === name || leaf.includes(name));
}

function entryHasValue(entry: ConfigListEntry) {
  return Boolean(entry.populated || entry.is_env_overridden);
}

function formatRawValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function errorMessage(e: unknown) {
  if (e instanceof ApiError) return `[${e.envelope.code}] ${e.envelope.message}`;
  return e instanceof Error ? e.message : String(e);
}
