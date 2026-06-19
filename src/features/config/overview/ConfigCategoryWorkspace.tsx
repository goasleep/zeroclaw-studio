import { useLingui } from "@lingui/react/macro";
import {
  Boxes,
  ChevronRight,
  Code2,
  Layers3,
  Network,
  RefreshCw,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ConfigSectionInfo } from "@/api/config";
import { Badge, EmptyState, ErrorBox, LoadingInline } from "@/ui/feedback";
import type { ConfigCategory, FormTarget, LoadState, PanelMode, TaskState } from "../types";
import { AdvancedConfigEditor } from "../advanced/AdvancedConfigEditor";
import { SectionExplorer } from "../sections/SectionExplorer";
import { SectionStateDot, SectionStatusBadge, TaskBadge } from "../sections/section-status";
import { setupTargetsForPrefix } from "../setup-targets";
import {
  categorySectionLabel,
  getSectionStats,
  orderSectionsForCategory,
  sectionByRoot,
  statusState,
} from "../section-utils";
import {
  configCategoryDescription,
  configCategoryEmptyBody,
  configCategoryEmptyTitle,
  configCategoryLabel,
} from "../config-categories";

export function ConfigCategoryWorkspace({
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

function IconNode({ icon: Icon, size }: { icon: LucideIcon; size: number }) {
  return <Icon size={size} />;
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
