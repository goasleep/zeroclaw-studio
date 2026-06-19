import { useCallback, useEffect, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronRight, Code2, RefreshCw, ShieldCheck } from "lucide-react";
import { apiConfigSections, type ConfigSectionInfo } from "@/api/config";
import { ErrorBox, LoadingInline } from "@/ui/feedback";
import { SegmentedControl } from "@/ui/segmented-control";
import { PanelSearch, PanelSidebar } from "@/ui/panel";
import { AdvancedConfigEditor } from "./advanced/AdvancedConfigEditor";
import { CONFIG_CATEGORIES, configGroupLabel } from "./config-categories";
import { ConfigOverview } from "./overview/ConfigOverview";
import { ConfigCategoryWorkspace } from "./overview/ConfigCategoryWorkspace";
import { SectionExplorer } from "./sections/SectionExplorer";
import { SectionStateDot, SectionStatusBadge } from "./sections/section-status";
import type { ConfigCategoryId, FormTarget, LoadState, PanelMode, StatusFilter } from "./types";
import {
  errorMessage,
  filterSections,
  filterSectionsByStatus,
  getSectionStats,
  groupSections,
  sectionMatchesCategory,
} from "./section-utils";

export type { ConfigCategoryId } from "./types";

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

  function handleSaved() {
    setReloadKey((n) => n + 1);
    void loadSections();
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
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)] overflow-hidden">
      <PanelSidebar>
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
          <PanelSearch value={filter} onChange={setFilter} placeholder={t`Search sections...`} />
          <SegmentedControl<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { key: "all", label: t`All` },
              { key: "needs", label: t`Needs` },
              { key: "ready", label: t`Ready` },
            ]}
          />
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
      </PanelSidebar>

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
            onSaved={handleSaved}
          />
        )}
      </main>
    </div>
  );
}
