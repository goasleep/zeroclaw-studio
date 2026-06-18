// Welcome screen shown when there are no connections yet.
//
// Three top-level choices, matching plan Phase 1:
//   1. Connect to remote zeroclaw
//   2. Connect to local zeroclaw (auto-detect)
//   3. Set up a new local zeroclaw (only path that triggers installer)

import { Cable, Cloud, HardDrive, Sparkles } from "lucide-react";

interface Props {
  onChoose: (path: "remote" | "local-attach" | "local-install") => void;
}

const cards = [
  {
    id: "remote" as const,
    icon: Cloud,
    title: "Connect to a remote zeroclaw",
    body: "Manage a homelab, cloud VM, or Raspberry Pi. Works with direct URL, SSH tunnel, or Tailscale. No local install required.",
    cta: "Add remote",
  },
  {
    id: "local-attach" as const,
    icon: HardDrive,
    title: "Connect to local zeroclaw",
    body: "Use a zeroclaw binary that's already installed and (optionally) running on this machine. Auto-detected from PATH.",
    cta: "Detect local",
  },
  {
    id: "local-install" as const,
    icon: Sparkles,
    title: "Set up a new local zeroclaw",
    body: "Install the upstream zeroclaw binary on this machine and let the workspace manage it for you.",
    cta: "Install locally",
  },
];

export function WelcomeScreen({ onChoose }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-8 py-12 text-slate-100">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="zc-glow-border rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">
          <Cable size={28} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to ZeroClaw Workspace</h1>
        <p className="max-w-lg text-sm text-slate-400">
          Pick how you want to reach a ZeroClaw gateway. You can have any number of connections —
          local, remote, or both. Local install is optional.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {cards.map(({ id, icon: Icon, title, body, cta }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChoose(id)}
            className="zc-panel group flex flex-col gap-3 rounded-2xl p-5 text-left transition hover:border-cyan-400/50 hover:bg-white/[0.07]"
          >
            <div className="rounded-lg bg-white/[0.08] p-2 text-cyan-300 group-hover:bg-cyan-400/10">
              <Icon size={20} />
            </div>
            <h2 className="text-base font-medium text-slate-100">{title}</h2>
            <p className="text-xs leading-relaxed text-slate-400">{body}</p>
            <span className="mt-auto text-xs font-medium uppercase tracking-wide text-cyan-300 opacity-0 group-hover:opacity-100">
              {cta} →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
