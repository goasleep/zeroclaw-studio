import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioTask } from "@/features/tasks/task-model";
import { WorkSidebar } from "./WorkSidebar";

const root = "/Users/fengpeng/Project/opensource/firecracker";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (message, part, index) =>
          message + part + (index < values.length ? String(values[index]) : ""),
        "",
      ),
  }),
}));

vi.mock("@/app/connection-context", () => ({
  useConnections: vi.fn(() => ({
    active: { name: "Local runtime" },
    activation: null,
    health: { healthy: true },
  })),
}));

vi.mock("@/app/workspace-context", () => ({
  useWorkspace: vi.fn(() => ({
    root,
    recentRoots: [],
    selectedFiles: [],
  })),
}));

describe("WorkSidebar task collapse", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows five workspace chats by default and expands the rest", () => {
    const { container } = renderSidebar();

    expect(screen.getByText("Session 1")).toBeTruthy();
    expect(screen.getByText("Session 5")).toBeTruthy();
    expect(screen.queryByText("Hidden migration plan")).toBeNull();
    expect(screen.queryByRole("searchbox", { name: "Search chats" })).toBeNull();

    fireEvent.click(buttonWithText(container, "Show more"));

    expect(screen.getByText("Hidden migration plan")).toBeTruthy();
    expect(searchbox(container)).toBeTruthy();
  });

  it("searches after expanding hidden workspace chats", () => {
    const { container } = renderSidebar();

    fireEvent.click(buttonWithText(container, "Show more"));
    fireEvent.change(searchbox(container), {
      target: { value: "migration" },
    });

    expect(screen.getByText("Hidden migration plan")).toBeTruthy();
    expect(screen.queryByText("Session 1")).toBeNull();
  });

  it("opens project actions and starts a new project session", () => {
    const onPickRoot = vi.fn();
    const onNewProjectSession = vi.fn();
    const { container } = renderSidebar({ onPickRoot, onNewProjectSession });

    fireEvent.click(labelledButton(container, "Project actions"));
    fireEvent.click(buttonWithText(container, "Open project..."));
    fireEvent.click(labelledButton(container, "New project session"));

    expect(onPickRoot).toHaveBeenCalledTimes(1);
    expect(onNewProjectSession).toHaveBeenCalledTimes(1);
  });

  it("toggles the current workspace instead of opening it", () => {
    const onProject = vi.fn();
    const { container } = renderSidebar({ onProject });

    fireEvent.click(buttonWithText(container, "firecracker"));

    expect(screen.queryByText("Session 1")).toBeNull();
    expect(onProject).not.toHaveBeenCalled();

    fireEvent.click(buttonWithText(container, "firecracker"));

    expect(screen.getByText("Session 1")).toBeTruthy();
  });
});

function renderSidebar({
  onProject = vi.fn(),
  onPickRoot = vi.fn(),
  onNewProjectSession = vi.fn(),
}: {
  onProject?: (path: string) => void;
  onPickRoot?: () => void;
  onNewProjectSession?: () => void;
} = {}) {
  return render(
    <WorkSidebar
      page="compose"
      tasks={tasks}
      activeTaskId={null}
      approvalCount={0}
      automationCount={0}
      onPage={vi.fn()}
      onTask={vi.fn()}
      onRenameTask={vi.fn()}
      onDeleteTask={vi.fn()}
      createControl={<button type="button">Create</button>}
      onProject={onProject}
      onPickRoot={onPickRoot}
      onNewProjectSession={onNewProjectSession}
    />,
  );
}

function buttonWithText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}

function labelledButton(container: HTMLElement, label: string) {
  const button = container.querySelector(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

function searchbox(container: HTMLElement) {
  const input = container.querySelector('input[type="search"]');
  if (!input) throw new Error("searchbox not found");
  return input;
}

const tasks: StudioTask[] = [
  task("task-1", "Session 1", "2026-01-06T00:00:00Z"),
  task("task-2", "Session 2", "2026-01-05T00:00:00Z"),
  task("task-3", "Session 3", "2026-01-04T00:00:00Z"),
  task("task-4", "Session 4", "2026-01-03T00:00:00Z"),
  task("task-5", "Session 5", "2026-01-02T00:00:00Z"),
  task("task-6", "Hidden migration plan", "2026-01-01T00:00:00Z"),
];

function task(id: string, title: string, lastActivity: string): StudioTask {
  return {
    id,
    connection_id: "conn-a",
    title,
    goal: null,
    session_id: `session-${id}`,
    cron_job_id: null,
    workspace_root: root,
    agent_alias: null,
    mode: "chat",
    status: "done",
    tags: [],
    pinned_result: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: lastActivity,
    last_activity_at: lastActivity,
    archived_at: null,
  };
}
