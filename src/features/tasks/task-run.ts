import type { TaskStatus } from "@/api/tauri";
import type { ChatMessage } from "@/features/chat/chat-types";

export type TaskRunStatus = Exclude<TaskStatus, "archived">;

export type TaskTimelineItemKind =
  | "user_message"
  | "assistant_message"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "approval_request"
  | "approval_decision"
  | "error"
  | "done";

export interface TaskTimelineItem {
  id: string;
  kind: TaskTimelineItemKind;
  label: string;
  detail?: string;
  timestamp?: string | null;
}

export function deriveTaskRunStatus(messages: ChatMessage[]): TaskRunStatus {
  if (messages.length === 0) return "draft";
  if (messages.some((message) => message.approval && !message.approval.response)) {
    return "needs_approval";
  }

  const last = messages[messages.length - 1];
  if (last.status === "error" || last.status === "aborted") return "failed";
  if (last.status === "pending" || last.status === "streaming") return "running";
  if (
    last.role === "assistant" &&
    last.toolCalls.some((toolCall) => toolCall.result === undefined)
  ) {
    return "running";
  }
  if (last.status === "done") return "done";
  return "running";
}

export function deriveTaskTimelineItems(messages: ChatMessage[]): TaskTimelineItem[] {
  const items: TaskTimelineItem[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      items.push({
        id: `${message.id}:user`,
        kind: "user_message",
        label: "User request",
        detail: message.content,
        timestamp: message.timestamp,
      });
      continue;
    }

    if (message.thinking) {
      items.push({
        id: `${message.id}:thinking`,
        kind: "thinking",
        label: "Agent thinking",
        detail: message.thinking,
        timestamp: message.timestamp,
      });
    }

    message.toolCalls.forEach((toolCall, index) => {
      items.push({
        id: `${message.id}:tool:${index}`,
        kind: "tool_call",
        label: `Tool call: ${toolCall.name}`,
        detail: formatTimelineDetail(toolCall.args),
        timestamp: message.timestamp,
      });
      if (toolCall.result !== undefined) {
        items.push({
          id: `${message.id}:tool-result:${index}`,
          kind: "tool_result",
          label: `Tool result: ${toolCall.name}`,
          detail: formatTimelineDetail(toolCall.result),
          timestamp: message.timestamp,
        });
      }
    });

    if (message.approval) {
      items.push({
        id: `${message.id}:approval`,
        kind: "approval_request",
        label: `Approval requested: ${message.approval.tool}`,
        detail: message.approval.arguments_summary,
        timestamp: message.timestamp,
      });
      if (message.approval.response) {
        items.push({
          id: `${message.id}:approval-decision`,
          kind: "approval_decision",
          label: `Approval ${message.approval.response.decision}`,
          detail:
            message.approval.response.status === "error"
              ? message.approval.response.error
              : message.approval.response.status,
          timestamp: message.timestamp,
        });
      }
    }

    if (message.error || message.status === "error" || message.status === "aborted") {
      items.push({
        id: `${message.id}:error`,
        kind: "error",
        label: message.status === "aborted" ? "Run aborted" : "Run error",
        detail: message.error,
        timestamp: message.timestamp,
      });
      continue;
    }

    if (message.content) {
      items.push({
        id: `${message.id}:assistant`,
        kind: "assistant_message",
        label: "Agent response",
        detail: message.content,
        timestamp: message.timestamp,
      });
    }

    if (message.status === "done") {
      items.push({
        id: `${message.id}:done`,
        kind: "done",
        label: "Run completed",
        timestamp: message.timestamp,
      });
    }
  }

  return items;
}

function formatTimelineDetail(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
