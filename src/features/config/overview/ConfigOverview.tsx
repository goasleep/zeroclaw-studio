import { useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import {
  ChevronRight,
  Code2,
  Layers3,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ConfigSectionInfo } from "@/api/config";
import { Badge, ErrorBox, LoadingInline } from "@/ui/feedback";
import type { ConfigCategoryId, LoadState } from "../types";
import {
  CONFIG_CATEGORIES,
  OVERVIEW_CARDS,
  configCategoryDescription,
  configCategoryLabel,
  configGroupLabel,
  type LinguiI18n,
} from "../config-categories";
import { SectionStateDot } from "../sections/section-status";
import {
  getSectionStats,
  groupRank,
  groupSections,
  iconForGroup,
  sectionMatchesCategory,
  sectionMatchesKeys,
  type SectionStats,
} from "../section-utils";

export function ConfigOverview({
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
