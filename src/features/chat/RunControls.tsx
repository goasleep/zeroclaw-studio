import { CircleStop, FolderOpen, Plus, RotateCcw, Wrench } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { ModelOverrideSelect, type ConfiguredModelChoice } from "./ModelOverrideSelect";

export function RunControls({
  selectedModelProvider,
  selectedModelChoice,
  modelChoices,
  onModelChange,
  agentAlias,
  onOpenAgentConfig,
  onOpenAgentWorkspace,
  onNewRun,
  onAbort,
  onClear,
}: {
  selectedModelProvider: string;
  selectedModelChoice?: ConfiguredModelChoice;
  modelChoices: ConfiguredModelChoice[];
  onModelChange: (value: string) => void;
  agentAlias: string;
  onOpenAgentConfig: () => void;
  onOpenAgentWorkspace: () => void;
  onNewRun: () => void;
  onAbort: () => void;
  onClear: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <ModelOverrideSelect
        value={selectedModelProvider}
        choices={modelChoices}
        onChange={onModelChange}
      />
      <button
        type="button"
        onClick={onOpenAgentConfig}
        disabled={!agentAlias}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-500 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        title={t`Open agent config`}
        aria-label={t`Open agent config`}
      >
        <Wrench size={12} />
      </button>
      <button
        type="button"
        onClick={onOpenAgentWorkspace}
        disabled={!agentAlias}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-500 hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        title={t`Open agent workspace`}
        aria-label={t`Open agent workspace`}
      >
        <FolderOpen size={12} />
      </button>
      <button
        type="button"
        onClick={onNewRun}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-white/[0.05] hover:text-cyan-300"
        title={selectedModelChoice ? t`New run with ${selectedModelChoice.value}` : t`New run`}
      >
        <Plus size={13} />
      </button>
      <button
        type="button"
        onClick={onAbort}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-white/[0.05] hover:text-red-300"
        title={t`Stop current run`}
      >
        <CircleStop size={13} />
      </button>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-white/[0.05] hover:text-cyan-300"
        title={t`Clear local view`}
      >
        <RotateCcw size={13} />
      </button>
    </div>
  );
}
