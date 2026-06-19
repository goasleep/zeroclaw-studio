import * as SwitchPrimitive from "@radix-ui/react-switch";

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-11 rounded-full border border-white/10 bg-[#020818]/90 transition data-[state=checked]:border-emerald-500/40 data-[state=checked]:bg-emerald-500/20"
      >
        <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-neutral-500 transition data-[state=checked]:translate-x-5 data-[state=checked]:bg-emerald-300" />
      </SwitchPrimitive.Root>
      {label && <span className="font-mono text-xs text-neutral-300">{label}</span>}
    </div>
  );
}
