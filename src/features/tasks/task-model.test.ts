import { describe, expect, it } from "vitest";
import {
  createDraftTask,
  sessionToBackfillSession,
  taskStatusLabel,
  visibleTasks,
} from "./task-model";
import { deriveTaskRunStatus, deriveTaskTimelineItems } from "./task-run";
import type { ChatMessage } from "@/features/chat/chat-types";

describe("task model", () => {
  it("creates Studio-owned draft metadata", () => {
    const task = createDraftTask({
      connectionId: "conn",
      title: "  Ship report  ",
      goal: "  summarize  ",
      workspaceRoot: "/repo",
      agentAlias: "default",
      mode: "chat",
    });

    expect(task.title).toBe("Ship report");
    expect(task.goal).toBe("summarize");
    expect(task.connection_id).toBe("conn");
    expect(task.workspace_root).toBe("/repo");
    expect(task.status).toBe("draft");
    expect(task.session_id).toBeNull();
  });

  it("hides archived tasks by default", () => {
    const active = createDraftTask({ connectionId: "conn", title: "Active", mode: "chat" });
    const archived = { ...active, id: "archived", status: "archived" as const };
    expect(visibleTasks([active, archived]).map((task) => task.id)).toEqual([active.id]);
  });

  it("maps sessions to backfill payloads", () => {
    expect(
      sessionToBackfillSession({
        session_id: "s1",
        name: "Session",
        agent_alias: "agent",
        message_count: 2,
      }),
    ).toMatchObject({
      session_id: "s1",
      name: "Session",
      agent_alias: "agent",
      message_count: 2,
    });
  });

  it("labels statuses", () => {
    expect(taskStatusLabel("needs_approval")).toBe("Needs approval");
  });

  it("derives run status from chat messages", () => {
    expect(deriveTaskRunStatus([])).toBe("draft");
    expect(deriveTaskRunStatus([assistant({ status: "pending" })])).toBe("running");
    expect(
      deriveTaskRunStatus([
        assistant({
          approval: {
            request_id: "approval-1",
            tool: "shell",
            arguments_summary: "pnpm test",
          },
        }),
      ]),
    ).toBe("needs_approval");
    expect(deriveTaskRunStatus([assistant({ status: "error", error: "boom" })])).toBe("failed");
    expect(deriveTaskRunStatus([assistant({ status: "done", content: "Finished" })])).toBe("done");
  });

  it("maps messages into task timeline items", () => {
    const items = deriveTaskTimelineItems([
      user({ id: "u1", content: "Ship it" }),
      assistant({
        id: "a1",
        content: "Done",
        thinking: "Checking",
        toolCalls: [{ name: "shell", args: { cmd: "pnpm test" }, result: "ok" }],
        approval: {
          request_id: "approval-1",
          tool: "shell",
          arguments_summary: "pnpm test",
          response: { decision: "approve", status: "sent" },
        },
      }),
    ]);

    expect(items.map((item) => item.kind)).toEqual([
      "user_message",
      "thinking",
      "tool_call",
      "tool_result",
      "approval_request",
      "approval_decision",
      "assistant_message",
      "done",
    ]);
  });
});

function user(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "user",
    role: "user",
    content: "",
    toolCalls: [],
    status: "done",
    ...overrides,
  };
}

function assistant(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "assistant",
    role: "assistant",
    content: "",
    toolCalls: [],
    status: "done",
    ...overrides,
  };
}
