import { useState } from "react";
import { ConnectionProvider, useConnections } from "@/app/connection-context";
import { ConnectionPicker } from "@/app/ConnectionPicker";
import { WelcomeScreen } from "@/app/WelcomeScreen";
import { AddConnectionDialog } from "@/app/AddConnectionDialog";

type AddPath = "remote" | "local-attach" | "local-install" | null;

function Shell() {
  const { connections, active, loading } = useConnections();
  const [addPath, setAddPath] = useState<AddPath>(null);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-100">
      <ConnectionPicker onAdd={() => setAddPath("remote")} />

      <main className="flex-1 overflow-hidden">
        {connections.length === 0 ? (
          <WelcomeScreen onChoose={setAddPath} />
        ) : active ? (
          <PlaceholderActiveView />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            Select a connection above, or add one.
          </div>
        )}
      </main>

      {addPath && (
        <AddConnectionDialog
          initialPath={addPath}
          onClose={() => setAddPath(null)}
        />
      )}
    </div>
  );
}

/** Phase 1 ends here — Phase 3 replaces this with the real workspace shell. */
function PlaceholderActiveView() {
  const { active } = useConnections();
  if (!active) return null;
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-8 text-sm">
      <h2 className="text-xl font-semibold">{active.name}</h2>
      <dl className="grid max-w-md grid-cols-[120px_1fr] gap-y-1.5 text-xs">
        <dt className="text-neutral-500">Transport</dt>
        <dd className="font-mono">{active.transport}</dd>
        <dt className="text-neutral-500">Lifecycle</dt>
        <dd className="font-mono">{active.lifecycle}</dd>
        <dt className="text-neutral-500">URL</dt>
        <dd className="break-all font-mono">{active.url || "(pending)"}</dd>
        <dt className="text-neutral-500">Auth</dt>
        <dd className="font-mono">
          {active.auth.token ? "token set" : "no token"}
        </dd>
        {active.binary_path && (
          <>
            <dt className="text-neutral-500">Binary</dt>
            <dd className="break-all font-mono">{active.binary_path}</dd>
          </>
        )}
      </dl>
      <p className="mt-4 text-neutral-500">
        Phase 3 replaces this view with the real workspace shell (file tree,
        chat, inspector).
      </p>
    </div>
  );
}

export function App() {
  return (
    <ConnectionProvider>
      <Shell />
    </ConnectionProvider>
  );
}
