import type { SettingsSection } from "@/app/workspace-shell/types";

export const APP_COMMAND_EVENT = "zeroclaw://command";

export const APP_COMMANDS = {
  workspaceFocusChat: {
    id: "workspace.focusChat",
    label: "Focus Chat",
    menu: "Workspace",
    accelerator: "CmdOrCtrl+1",
  },
  workspaceFocusCode: {
    id: "workspace.focusCode",
    label: "Focus Code",
    menu: "Workspace",
    accelerator: "CmdOrCtrl+2",
  },
  workspaceOpenProject: {
    id: "workspace.openProject",
    label: "Open Project...",
    menu: "Workspace",
    accelerator: "CmdOrCtrl+O",
  },
  workspaceNewChat: {
    id: "workspace.newChat",
    label: "New Chat",
    menu: "Workspace",
    accelerator: "CmdOrCtrl+N",
  },
  workspaceRefreshChats: {
    id: "workspace.refreshChats",
    label: "Refresh Chats",
    menu: "Workspace",
    accelerator: "CmdOrCtrl+R",
  },
  workspaceRetryConnection: {
    id: "workspace.retryConnection",
    label: "Retry Active Connection",
    menu: "Workspace",
    accelerator: "CmdOrCtrl+Shift+R",
  },
  settingsOpen: {
    id: "settings.open",
    label: "Open Settings",
    menu: "Settings",
    accelerator: "CmdOrCtrl+,",
    section: "app",
  },
  settingsOpenSetupCenter: {
    id: "settings.openSetupCenter",
    label: "Setup Center",
    menu: "Settings",
    section: "setup-center",
  },
  settingsOpenGatewayOverview: {
    id: "settings.openGatewayOverview",
    label: "Gateway Overview",
    menu: "Settings",
    section: "gateway-overview",
  },
  settingsOpenModelsProviders: {
    id: "settings.openModelsProviders",
    label: "Models & Providers",
    menu: "Settings",
    section: "models-providers",
  },
  settingsOpenAgents: {
    id: "settings.openAgents",
    label: "Agents",
    menu: "Settings",
    section: "agents",
  },
  settingsOpenRuntimeSafety: {
    id: "settings.openRuntimeSafety",
    label: "Runtime & Safety",
    menu: "Settings",
    section: "runtime-safety",
  },
  settingsOpenToolsSkills: {
    id: "settings.openToolsSkills",
    label: "Tools & Skills",
    menu: "Settings",
    section: "tools-skills",
  },
  diagnosticsOpenLogs: {
    id: "diagnostics.openLogs",
    label: "Logs",
    menu: "Diagnostics",
    section: "logs",
  },
  diagnosticsOpenDoctor: {
    id: "diagnostics.openDoctor",
    label: "Doctor",
    menu: "Diagnostics",
    section: "doctor",
  },
  diagnosticsOpenDevices: {
    id: "diagnostics.openDevices",
    label: "Devices",
    menu: "Diagnostics",
    section: "devices",
  },
} as const;

type AppCommand = (typeof APP_COMMANDS)[keyof typeof APP_COMMANDS];

export type AppCommandId = AppCommand["id"];
export type AppCommandSource = "menu" | "tray" | "shortcut" | "ui" | "legacy";

export interface AppCommandEventDetail {
  command: AppCommandId;
  source?: AppCommandSource;
}

export const SETTINGS_COMMAND_SECTIONS: Partial<Record<AppCommandId, SettingsSection>> =
  Object.fromEntries(
    Object.values(APP_COMMANDS)
      .filter(
        (command): command is AppCommand & { section: SettingsSection } => "section" in command,
      )
      .map((command) => [command.id, command.section]),
  );

const COMMAND_IDS = new Set<string>(Object.values(APP_COMMANDS).map((command) => command.id));

export function isAppCommandId(value: unknown): value is AppCommandId {
  return typeof value === "string" && COMMAND_IDS.has(value);
}

export function appCommandFromEvent(event: Event): AppCommandId | null {
  const detail = (event as CustomEvent<AppCommandEventDetail | AppCommandId>).detail;
  if (isAppCommandId(detail)) return detail;
  if (detail && typeof detail === "object" && isAppCommandId(detail.command)) {
    return detail.command;
  }
  return null;
}

export function dispatchAppCommand(command: AppCommandId, source: AppCommandSource = "ui") {
  window.dispatchEvent(
    new CustomEvent<AppCommandEventDetail>(APP_COMMAND_EVENT, {
      detail: { command, source },
    }),
  );
}
