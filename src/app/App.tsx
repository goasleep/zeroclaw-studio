import { useState } from "react";
import { ConnectionProvider, useConnections } from "@/app/connection-context";
import { ConnectionPicker } from "@/app/ConnectionPicker";
import { WelcomeScreen } from "@/app/WelcomeScreen";
import { AddConnectionDialog } from "@/app/AddConnectionDialog";
import { WorkspaceProvider } from "@/app/workspace-context";
import { WorkspaceShell } from "@/app/WorkspaceShell";

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
          <WorkspaceShell />
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

export function App() {
  return (
    <ConnectionProvider>
      <WorkspaceProvider>
        <Shell />
      </WorkspaceProvider>
    </ConnectionProvider>
  );
}
