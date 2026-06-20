import { describe, expect, it } from "vitest";
import {
  chatReducer,
  fromSessionMessage,
  isVisibleSession,
  normalizeSession,
} from "./chat-reducer";
import type { ChatState } from "./chat-reducer";

describe("chatReducer", () => {
  it("adds a user message and pending assistant placeholder before sending", () => {
    const state: ChatState = { messages: [], sessionId: null };
    const next = chatReducer(state, {
      type: "push-user",
      content: "hello",
      attachments: [{ filename: "a.txt", mime_type: "text/plain", size: 12 }],
    });

    expect(next.messages).toHaveLength(2);
    expect(next.messages[0]).toMatchObject({
      role: "user",
      content: "hello",
      attachments: [{ filename: "a.txt", mime_type: "text/plain", size: 12 }],
      status: "done",
    });
    expect(next.messages[1]).toMatchObject({ role: "assistant", content: "", status: "pending" });
  });

  it("streams chunks into the latest assistant message", () => {
    const state = chatReducer(
      { messages: [], sessionId: null },
      { type: "push-user", content: "hi" },
    );
    const next = chatReducer(state, { type: "frame", frame: { type: "chunk", content: "there" } });

    expect(next.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "there",
      status: "streaming",
    });
  });

  it("tracks approval response status on the matching assistant message", () => {
    const state = chatReducer(
      {
        sessionId: "session-1",
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: "",
            toolCalls: [{ name: "shell", args: { command: "pwd" } }],
            status: "pending",
          },
        ],
      },
      {
        type: "frame",
        frame: {
          type: "approval_request",
          request_id: "approval-1",
          tool: "shell",
          arguments_summary: "pwd",
        },
      },
    );

    const next = chatReducer(state, {
      type: "approval-response",
      requestId: "approval-1",
      decision: "approve",
      status: "sent",
    });

    expect(next.messages[0].approval?.response).toEqual({
      decision: "approve",
      status: "sent",
      error: undefined,
    });
  });
});

describe("session helpers", () => {
  it("uses session message timestamps without keeping legacy prefixes in content", () => {
    expect(
      fromSessionMessage({
        role: "assistant",
        content: "[2026-06-20 15:42:00] hello",
        created_at: "2026-06-20T07:42:00Z",
      }),
    ).toMatchObject({
      role: "assistant",
      content: "hello",
      timestamp: "2026-06-20T07:42:00Z",
    });
  });

  it("normalizes sessions using fallback ids and names", () => {
    expect(
      normalizeSession({
        id: "abcdef123456",
        name: "",
        agent_alias: "agent",
      }),
    ).toMatchObject({
      session_id: "abcdef123456",
      name: "session abcdef12",
      agent_alias: "agent",
    });
  });

  it("hides only sessions that explicitly report zero messages", () => {
    const base = {
      session_id: "session-1",
      name: "session",
    };

    expect(isVisibleSession({ ...base, message_count: 0 })).toBe(false);
    expect(isVisibleSession({ ...base, message_count: 1 })).toBe(true);
    expect(isVisibleSession(base)).toBe(true);
  });

});
