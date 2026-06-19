import type { ReactNode } from "react";
import { Search } from "lucide-react";

export function PanelSidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#020818]/95">
      {children}
    </aside>
  );
}

export function PanelSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search
        size={13}
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/10 bg-[#020818]/90 py-1.5 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400"
      />
    </div>
  );
}
