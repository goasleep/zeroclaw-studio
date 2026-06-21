import { render, screen, waitFor } from "@testing-library/react";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { describe, expect, it } from "vitest";
import type { PendingApproval } from "@/api/tauri";
import { useApprovals } from "./use-approvals";

const approvalA: PendingApproval = {
  connection_id: "conn-a",
  request_id: "approval-a",
  session_id: "session-a",
  task_id: "task-a",
  task_title: "Task A",
  tool: "shell",
  arguments_summary: "echo hi",
  workspace_root: "/tmp/a",
  agent_alias: "default",
  created_at: "2026-01-02T00:00:00Z",
};

const approvalB: PendingApproval = {
  ...approvalA,
  connection_id: "conn-b",
  request_id: "approval-b",
  session_id: "session-b",
  created_at: "2026-01-01T00:00:00Z",
};

function Probe({ connectionId = null }: { connectionId?: string | null }) {
  const approvals = useApprovals(connectionId);
  return (
    <>
      <output>{JSON.stringify(approvals.approvals)}</output>
      <button type="button" onClick={() => void approvals.respond(approvalA, "approve")}>
        respond
      </button>
    </>
  );
}

function setup() {
  const calls: unknown[] = [];
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "approval_list") return [approvalA, approvalB];
      if (cmd === "approval_respond") return null;
      throw new Error(`unexpected command: ${cmd}`);
    },
    { shouldMockEvents: true },
  );
  return calls;
}

describe("useApprovals", () => {
  it("merges all-runtimes approval updates by connection", async () => {
    setup();
    render(<Probe />);
    await waitFor(() => expect(screen.getByText(/approval-a/)).toBeTruthy());

    await emit("zeroclaw://approvals-updated", {
      connection_id: "conn-a",
      approvals: [],
    });

    await waitFor(() => expect(screen.queryByText(/approval-a/)).toBeNull());
    expect(screen.getByText(/approval-b/)).toBeTruthy();
  });

  it("ignores approval updates for other connections when scoped", async () => {
    setup();
    render(<Probe connectionId="conn-a" />);
    await waitFor(() => expect(screen.getByText(/approval-a/)).toBeTruthy());

    await emit("zeroclaw://approvals-updated", {
      connection_id: "conn-b",
      approvals: [],
    });

    await waitFor(() => expect(screen.getByText(/approval-a/)).toBeTruthy());
  });

  it("sends approval responses through Tauri", async () => {
    const calls = setup();
    render(<Probe />);
    await waitFor(() => expect(screen.getByText(/approval-a/)).toBeTruthy());

    screen.getByRole("button", { name: "respond" }).click();

    await waitFor(() =>
      expect(calls).toContainEqual({
        cmd: "approval_respond",
        args: {
          connectionId: "conn-a",
          sessionId: "session-a",
          requestId: "approval-a",
          decision: "approve",
        },
      }),
    );
  });
});
