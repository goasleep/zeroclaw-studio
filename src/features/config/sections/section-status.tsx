import { useLingui } from "@lingui/react/macro";
import type { ConfigSectionInfo } from "@/api/config";
import type { TaskState } from "../types";
import { sectionStatusLabel } from "../section-utils";

export function TaskBadge({ state }: { state: TaskState }) {
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

export function SectionStatusBadge({ section }: { section: ConfigSectionInfo }) {
  const label = sectionStatusLabel(section);
  const tone = section.ready
    ? "bg-emerald-500/10 text-emerald-300"
    : section.completed
      ? "bg-amber-500/10 text-amber-300"
      : "bg-white/[0.05] text-neutral-500";
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${tone}`}>{label}</span>;
}

export function SectionStateDot({ section }: { section: ConfigSectionInfo }) {
  const color = section.ready
    ? "bg-emerald-400"
    : section.completed
      ? "bg-amber-400"
      : "bg-white/[0.12]";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}
