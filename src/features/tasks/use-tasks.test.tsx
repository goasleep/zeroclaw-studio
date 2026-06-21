import { render, screen, waitFor } from "@testing-library/react";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { describe, expect, it } from "vitest";
import { createDraftTask, type StudioTask } from "./task-model";
import { useTasks } from "./use-tasks";

const baseTask: StudioTask = {
  ...createDraftTask({ connectionId: "conn-a", title: "Work", mode: "chat" }),
  id: "task-1",
  session_id: "session-1",
  status: "running",
};

function Probe({ connectionId = "conn-a" }: { connectionId?: string }) {
  const tasks = useTasks({ connectionId });
  return <output>{JSON.stringify(tasks.tasks)}</output>;
}

function setup() {
  mockWindows("main");
  mockIPC(
    (cmd) => {
      if (cmd === "task_list") return [baseTask];
      throw new Error(`unexpected command: ${cmd}`);
    },
    { shouldMockEvents: true },
  );
}

describe("useTasks", () => {
  it("merges backend task updates for the active connection", async () => {
    setup();
    render(<Probe />);
    await waitFor(() => expect(screen.getByText(/"status":"running"/)).toBeTruthy());

    await emit("zeroclaw://tasks-updated", {
      connection_id: "conn-a",
      tasks: [{ ...baseTask, status: "done", last_activity_at: "2026-01-02T00:00:00Z" }],
    });

    await waitFor(() => expect(screen.getByText(/"status":"done"/)).toBeTruthy());
  });

  it("ignores backend task updates for other connections", async () => {
    setup();
    render(<Probe />);
    await waitFor(() => expect(screen.getByText(/"status":"running"/)).toBeTruthy());

    await emit("zeroclaw://tasks-updated", {
      connection_id: "conn-b",
      tasks: [{ ...baseTask, status: "done" }],
    });

    await waitFor(() => expect(screen.getByText(/"status":"running"/)).toBeTruthy());
    expect(screen.queryByText(/"status":"done"/)).toBeNull();
  });
});
