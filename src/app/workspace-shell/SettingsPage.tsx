import { Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useConnections } from "@/app/connection-context";
import { useWorkspace } from "@/app/workspace-context";
import { ConfigPanel } from "@/features/config/ConfigPanel";
import { CronPanel } from "@/features/cron/CronPanel";
import { DevicesPanel } from "@/features/devices/DevicesPanel";
import { DoctorPanel } from "@/features/doctor/DoctorPanel";
import { IntegrationsPanel } from "@/features/integrations/IntegrationsPanel";
import { LogsPanel } from "@/features/logs/LogsPanel";
import { MemoryPanel } from "@/features/memory/MemoryPanel";
import { SetupCenterPanel } from "@/features/setup/SetupCenterPanel";
import { ToolsPanel } from "@/features/tools/ToolsPanel";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreference,
  type AppPreferences,
} from "@/workspace/preferences/preferences";
import { SETTINGS_SECTIONS } from "./settings-sections";
import type { SettingsSection } from "./types";

interface SettingsPageProps {
  section: SettingsSection;
  configFocusSection: string | null;
  onSection: (section: SettingsSection) => void;
  onBackToChat: () => void;
  onConfigFocusSection: (section: string | null) => void;
}

export function SettingsPage({
  section,
  configFocusSection,
  onSection,
  onBackToChat,
  onConfigFocusSection,
}: SettingsPageProps) {
  const current = SETTINGS_SECTIONS.find((s) => s.id === section);

  return (
    <section className="grid h-full min-h-0 grid-cols-[280px_minmax(420px,1fr)] overflow-hidden bg-[#020818]/90">
      <SettingsNav
        section={section}
        onSection={onSection}
        onBackToChat={onBackToChat}
      />
      <main className="flex min-w-0 flex-col overflow-hidden border-l border-white/10">
        <header className="flex h-16 shrink-0 flex-col justify-center border-b border-white/10 px-8">
          <h1 className="truncate text-lg font-semibold text-neutral-100">
            {current?.label ?? "Settings"}
          </h1>
          <p className="truncate text-xs text-neutral-500">
            {current?.group ?? "Settings"}
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          {section === "app" && <AppSettings />}
          {section === "setup-center" && <SetupCenterPanel />}
          {section === "gateway-config" && (
            <ConfigPanel focusSection={configFocusSection} />
          )}
          {section === "memory" && <MemoryPanel />}
          {section === "cron" && <CronPanel />}
          {section === "tools" && <ToolsPanel />}
          {section === "integrations" && (
            <IntegrationsPanel
              onConfigure={(targetSection) => {
                onConfigFocusSection(targetSection);
                onSection("gateway-config");
              }}
            />
          )}
          {section === "logs" && <LogsPanel />}
          {section === "doctor" && <DoctorPanel />}
          {section === "devices" && <DevicesPanel />}
        </div>
      </main>
    </section>
  );
}

function SettingsNav({
  section,
  onSection,
  onBackToChat,
}: {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onBackToChat: () => void;
}) {
  const groups: Array<"App" | "Gateway" | "Operations"> = [
    "App",
    "Gateway",
    "Operations",
  ];

  return (
    <aside className="flex min-h-0 flex-col bg-[#020818]/90">
      <header className="shrink-0 border-b border-white/10 p-3">
        <button
          type="button"
          onClick={onBackToChat}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-400 transition hover:bg-white/[0.05] hover:text-neutral-100"
        >
          <Home size={14} />
          <span className="min-w-0 flex-1 truncate">Back to app</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {groups.map((group) => (
          <section key={group} className="mb-5">
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
              {group}
            </h2>
            <div className="space-y-1">
              {SETTINGS_SECTIONS.filter((s) => s.group === group).map(
                ({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSection(id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                      section === id
                        ? "bg-cyan-400/10 text-cyan-100"
                        : "text-neutral-300 hover:bg-white/[0.05] hover:text-neutral-100"
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                  </button>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function AppSettings() {
  const { active, connections, health, activation } = useConnections();
  const { root, selectedFiles } = useWorkspace();
  const [preferences, setPreferences] =
    useState<AppPreferences>(DEFAULT_PREFERENCES);
  const online = active && health?.connection_id === active.id && health.healthy;

  useEffect(() => {
    void loadPreferences()
      .then(setPreferences)
      .catch(() => setPreferences(DEFAULT_PREFERENCES));
  }, []);

  async function updatePreference<K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K],
  ) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    await savePreference(key, value);
  }

  return (
    <div className="h-full overflow-auto p-5 text-sm">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-100">
            Connection
          </h2>
          {active ? (
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <InfoItem label="Name" value={active.name} />
              <InfoItem label="Status" value={online ? "Online" : "Offline"} />
              <InfoItem label="Transport" value={active.transport} />
              <InfoItem label="Lifecycle" value={active.lifecycle} />
              <InfoItem label="URL" value={active.url || "pending tunnel"} wide />
            </dl>
          ) : (
            <p className="text-xs text-neutral-500">No active connection.</p>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-100">
            Workspace
          </h2>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <InfoItem label="Folder" value={root ?? "No folder open"} wide />
            <InfoItem label="Chat attachments" value={String(selectedFiles.length)} />
            <InfoItem label="Saved runtimes" value={String(connections.length)} />
            <InfoItem
              label="Activation"
              value={activation ? activation.type : "idle"}
            />
          </dl>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h2 className="mb-2 text-sm font-medium text-neutral-100">
            Local Preferences
          </h2>
          <div className="space-y-3 text-xs">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                Global shortcut
              </span>
              <input
                value={preferences.shortcut}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    shortcut: e.target.value,
                  }))
                }
                onBlur={(e) => void updatePreference("shortcut", e.target.value)}
                className="w-full rounded border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-neutral-200"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded border border-white/10 bg-[#020818]/90 px-2 py-1.5">
              <span>
                <span className="block text-neutral-300">Notifications</span>
                <span className="text-[10px] text-neutral-500">
                  Notify on hidden-window approvals and completed turns.
                </span>
              </span>
              <input
                type="checkbox"
                checked={preferences.notifications}
                onChange={(e) =>
                  void updatePreference("notifications", e.target.checked)
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded border border-white/10 bg-[#020818]/90 px-2 py-1.5">
              <span>
                <span className="block text-neutral-300">Tray / menu bar</span>
                <span className="text-[10px] text-neutral-500">
                  Tray is available in this build; preference is stored locally.
                </span>
              </span>
              <input
                type="checkbox"
                checked={preferences.tray}
                onChange={(e) => void updatePreference("tray", e.target.checked)}
              />
            </label>
            <InfoItem label="Deep link scheme" value="zeroclaw:// registered" />
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="truncate rounded border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-neutral-300">
        {value}
      </dd>
    </div>
  );
}
