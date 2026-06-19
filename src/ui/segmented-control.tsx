import type { ReactNode } from "react";

export interface SegmentedControlOption<T extends string> {
  key: T;
  label: ReactNode;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-white/[0.025] p-1">
      {options.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`rounded px-2 py-1 text-[10px] font-medium transition ${
            value === item.key
              ? "bg-cyan-400/15 text-cyan-100"
              : "text-neutral-500 hover:text-neutral-200"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
