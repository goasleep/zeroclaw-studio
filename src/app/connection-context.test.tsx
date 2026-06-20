import { render, screen, waitFor } from "@testing-library/react";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { describe, expect, it, vi } from "vitest";
import { ConnectionProvider, useConnections } from "./connection-context";
import type { Connection } from "@/api/tauri";

const activeConnection: Connection = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ZeroClaw Studio Test Gateway",
  transport: "local",
  url: "http://127.0.0.1:42618",
  ssh: null,
  auth: { mode: "pairing", token: null },
  lifecycle: "managed",
  runtime_source: "bundled_inner",
  binary_path: null,
};

function Probe() {
  const { active, activation, connections, health, loading } = useConnections();
  return (
    <output>
      {JSON.stringify({
        active: active?.name ?? null,
        activation: activation?.type ?? null,
        connections: connections.length,
        health: health?.healthy ?? null,
        loading,
      })}
    </output>
  );
}

function renderProvider() {
  return render(
    <ConnectionProvider>
      <Probe />
    </ConnectionProvider>,
  );
}

describe("ConnectionProvider", () => {
  it("loads the active connection through mocked Tauri IPC", async () => {
    mockWindows("main");
    mockIPC(
      (cmd) => {
        if (cmd === "list_connections") return [activeConnection];
        if (cmd === "get_active_connection") return activeConnection;
        throw new Error(`unexpected command: ${cmd}`);
      },
      { shouldMockEvents: true },
    );

    renderProvider();

    await waitFor(() => {
      expect(screen.getByText(/ZeroClaw Studio Test Gateway/)).toBeTruthy();
      expect(screen.getByText(/"loading":false/)).toBeTruthy();
    });
  });

  it("does not stay loading when initial IPC refresh rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockWindows("main");
    mockIPC(
      (cmd) => {
        if (cmd === "list_connections" || cmd === "get_active_connection") {
          throw new Error("missing Tauri runtime");
        }
        throw new Error(`unexpected command: ${cmd}`);
      },
      { shouldMockEvents: true },
    );

    renderProvider();

    await waitFor(() => {
      expect(screen.getByText(/"connections":0/)).toBeTruthy();
      expect(screen.getByText(/"loading":false/)).toBeTruthy();
    });
    warn.mockRestore();
  });

  it("tracks backend activation and health events", async () => {
    mockWindows("main");
    mockIPC(
      (cmd) => {
        if (cmd === "list_connections") return [activeConnection];
        if (cmd === "get_active_connection") return activeConnection;
        throw new Error(`unexpected command: ${cmd}`);
      },
      { shouldMockEvents: true },
    );

    renderProvider();
    await waitFor(() => expect(screen.getByText(/"loading":false/)).toBeTruthy());

    await emit("zeroclaw://health", {
      connection_id: activeConnection.id,
      healthy: true,
      url: activeConnection.url,
    });
    await emit("zeroclaw://activation", { type: "ready" });

    await waitFor(() => {
      expect(screen.getByText(/"activation":"ready"/)).toBeTruthy();
      expect(screen.getByText(/"health":true/)).toBeTruthy();
    });
  });
});
