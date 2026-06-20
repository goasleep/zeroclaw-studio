import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { CheckCircle2, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { ChoiceMode, StepId } from "./types";

export function Shell({ surface, children }: { surface: "chat" | "config"; children: ReactNode }) {
  const heightClass = surface === "config" ? "h-full" : "min-h-0 flex-1";
  return (
    <div className={`${heightClass} flex min-w-0 flex-col overflow-hidden bg-[#020818]/90`}>
      {children}
    </div>
  );
}

export function StepButton({
  id,
  active,
  done,
  detail,
  optional,
  onClick,
}: {
  id: StepId;
  active: boolean;
  done: boolean;
  detail: string;
  optional: boolean;
  onClick: () => void;
}) {
  const label = stepLabel(id);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 text-left ${
        active
          ? "border-cyan-400/50 bg-cyan-400/10"
          : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
          done
            ? "border-green-400/50 bg-green-400/10 text-green-300"
            : "border-white/15 text-neutral-500"
        }`}
      >
        {done ? <CheckCircle2 size={12} /> : ""}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-xs font-medium text-neutral-100">
          {label}
          {optional && <span className="text-[10px] font-normal text-neutral-600">optional</span>}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-neutral-500">{detail}</span>
      </span>
      <ChevronRight size={13} className="text-neutral-600" />
    </button>
  );
}

function stepLabel(id: StepId) {
  switch (id) {
    case "provider":
      return "Provider";
    case "risk":
      return "Risk";
    case "runtime":
      return "Runtime";
    case "memory":
      return "Memory";
    case "channels":
      return "Channels";
    case "agent":
      return "Agent";
    case "peer_groups":
      return "Peer groups";
  }
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function DraftCard({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="space-y-3 rounded-md border border-white/10 p-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-neutral-500 hover:border-red-400/30 hover:text-red-300"
          aria-label="Remove"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-neutral-400">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[10px] text-neutral-600">{help}</span>}
    </label>
  );
}

export function Select({
  value,
  onChange,
  children,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <span className="relative block">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
      />
    </span>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-white/10 bg-[#020818]/90 px-3 py-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
    />
  );
}

export function ModeRow({
  mode,
  existingDisabled,
  freshDisabled,
  onMode,
}: {
  mode: ChoiceMode;
  existingDisabled: boolean;
  freshDisabled: boolean;
  onMode: (mode: ChoiceMode) => void;
}) {
  const { t } = useLingui();
  return (
    <Field label={t`Mode`}>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onMode("existing")}
          disabled={existingDisabled}
          className={`rounded-md border px-3 py-2 text-xs ${
            mode === "existing"
              ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
              : "border-white/10 text-neutral-400 hover:border-white/20"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {t`Use existing`}
        </button>
        <button
          type="button"
          onClick={() => onMode("fresh")}
          disabled={freshDisabled}
          className={`rounded-md border px-3 py-2 text-xs ${
            mode === "fresh"
              ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
              : "border-white/10 text-neutral-400 hover:border-white/20"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {t`Create new`}
        </button>
      </div>
    </Field>
  );
}

export function ChoiceRow({
  mode,
  value,
  existing,
  fresh,
  onMode,
  onValue,
}: {
  mode: ChoiceMode;
  value: string;
  existing: string[];
  fresh: Array<{ key: string; label: string; description: string }>;
  onMode: (mode: ChoiceMode) => void;
  onValue: (value: string) => void;
}) {
  const { t } = useLingui();
  const options = mode === "existing" ? existing.map((v) => ({ key: v, label: v })) : fresh;
  return (
    <div className="space-y-3">
      <ModeRow
        mode={mode}
        existingDisabled={existing.length === 0}
        freshDisabled={fresh.length === 0}
        onMode={(nextMode) => {
          onMode(nextMode);
          const nextOptions =
            nextMode === "existing" ? existing.map((v) => ({ key: v, label: v })) : fresh;
          onValue(nextOptions[0]?.key ?? "");
        }}
      />
      <Field label={mode === "existing" ? t`Existing` : t`Preset`}>
        <Select value={value} onChange={onValue} disabled={options.length === 0}>
          {options.length === 0 && <option value="">{t`No options`}</option>}
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      {mode === "fresh" &&
        fresh
          .filter((option) => option.key === value && option.description)
          .map((option) => (
            <p key={option.key} className="text-xs leading-relaxed text-neutral-500">
              {option.description}
            </p>
          ))}
    </div>
  );
}
