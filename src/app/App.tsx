import { Cable } from "lucide-react";

/**
 * Placeholder shell — Phase 0.
 *
 * The real workspace shell (resizable panes, file tree, connection picker)
 * lands in Phase 3. For now we just render a recognisable welcome card so
 * `pnpm tauri dev` opens to something coherent.
 */
export function App() {
  return (
    <main className="flex h-full items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-10 text-center shadow-2xl">
        <div className="rounded-xl bg-orange-500/10 p-3 text-orange-400">
          <Cable size={28} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          ZeroClaw Workspace
        </h1>
        <p className="text-sm text-neutral-400">
          Phase 0 scaffold — the connection picker and workspace shell arrive
          in the next phases.
        </p>
        <p className="text-xs text-neutral-500">
          Connect to a local or remote ZeroClaw gateway from one place.
        </p>
      </div>
    </main>
  );
}
