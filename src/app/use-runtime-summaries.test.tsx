import { render, screen, waitFor } from "@testing-library/react";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { describe, expect, it } from "vitest";
import type { RuntimeSummary } from "@/api/tauri";
import { useRuntimeSummaries } from "./use-runtime-summaries";

const baseSummary: RuntimeSummary = {
  connection_id: "conn-a",
  status: "online",
  healthy: true,
  last_seen_at: "2026-01-01T00:00:00Z",
  running_count: 1,
  approval_count: 0,
  failed_count: 0,
  automation_count: 0,
  sync_error: null,
};

function Probe() {
  const summaries = useRuntimeSummaries();
  return <output>{JSON.stringify(summaries.summaries)}</output>;
}

function setup() {
  mockWindows("main");
  mockIPC(
    (cmd) => {
      if (cmd === "runtime_summaries_list") return [baseSummary];
      throw new Error(`unexpected command: ${cmd}`);
    },
    { shouldMockEvents: true },
  );
}

describe("useRuntimeSummaries", () => {
  it("loads summaries and replaces them from backend events", async () => {
    setup();
    render(<Probe />);
    await waitFor(() => expect(screen.getByText(/"running_count":1/)).toBeTruthy());

    await emit("zeroclaw://runtime-summaries-updated", {
      summaries: [{ ...baseSummary, running_count: 0, approval_count: 2 }],
    });

    await waitFor(() => expect(screen.getByText(/"approval_count":2/)).toBeTruthy());
    expect(screen.queryByText(/"running_count":1/)).toBeNull();
  });
});
