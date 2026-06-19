import { Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useConnections } from "@/app/connection-context";
import { useWorkspace } from "@/app/workspace-context";
import { ConfigPanel, type ConfigCategoryId } from "@/features/config/ConfigPanel";
import { CronPanel } from "@/features/cron/CronPanel";
import { DevicesPanel } from "@/features/devices/DevicesPanel";
import { DoctorPanel } from "@/features/doctor/DoctorPanel";
import { IntegrationsPanel } from "@/features/integrations/IntegrationsPanel";
import { LogsPanel } from "@/features/logs/LogsPanel";
import { MemoryPanel } from "@/features/memory/MemoryPanel";
import { SetupCenterPanel } from "@/features/setup/SetupCenterPanel";
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
  const effectiveSection = normalizeSettingsSection(section);

  function selectSection(next: SettingsSection) {
    onConfigFocusSection(null);
    onSection(normalizeSettingsSection(next));
  }

  function openConfigTarget(targetSection: string) {
    onConfigFocusSection(targetSection);
    onSection(settingsSectionForConfigTarget(targetSection));
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-[280px_minmax(420px,1fr)] overflow-hidden bg-[#020818]/90">
      <SettingsNav
        section={effectiveSection}
        onSection={selectSection}
        onBackToChat={onBackToChat}
      />
      <main className="flex min-w-0 flex-col overflow-hidden border-l border-white/10">
        <div className="min-h-0 flex-1 overflow-hidden">
          {effectiveSection === "app" && <AppSettings />}
          {effectiveSection === "setup-center" && <SetupCenterPanel />}
          {effectiveSection === "gateway-overview" && (
            <ConfigPanel
              focusSection={configFocusSection}
              onNavigate={(target) =>
                selectSection(normalizeSettingsSection(target as SettingsSection))
              }
            />
          )}
          {isConfigCategorySection(effectiveSection) && (
            <ConfigPanel
              categoryId={effectiveSection}
              focusSection={configFocusSection}
              onNavigate={(target) =>
                selectSection(normalizeSettingsSection(target as SettingsSection))
              }
            />
          )}
          {effectiveSection === "memory" && <MemoryPanel />}
          {effectiveSection === "cron" && <CronPanel />}
          {effectiveSection === "integrations" && (
            <IntegrationsPanel onConfigure={(targetSection) => openConfigTarget(targetSection)} />
          )}
          {effectiveSection === "logs" && <LogsPanel />}
          {effectiveSection === "doctor" && <DoctorPanel />}
          {effectiveSection === "devices" && <DevicesPanel />}
        </div>
      </main>
    </section>
  );
}

function normalizeSettingsSection(section: SettingsSection): SettingsSection {
  if (section === "gateway-config") return "gateway-overview";
  if (section === "tools") return "tools-skills";
  return section;
}

function isConfigCategorySection(section: SettingsSection): section is ConfigCategoryId {
  return (
    section === "models-providers" ||
    section === "agents" ||
    section === "runtime-safety" ||
    section === "channels" ||
    section === "tools-skills"
  );
}

function settingsSectionForConfigTarget(targetSection: string): SettingsSection {
  if (targetSection === "providers.models" || targetSection.startsWith("providers.models.")) {
    return "models-providers";
  }
  if (targetSection === "agents" || targetSection.startsWith("agents.")) return "agents";
  if (targetSection === "peer_groups" || targetSection.startsWith("peer_groups.")) {
    return "agents";
  }
  if (targetSection === "risk_profiles" || targetSection.startsWith("risk_profiles.")) {
    return "runtime-safety";
  }
  if (targetSection === "runtime_profiles" || targetSection.startsWith("runtime_profiles.")) {
    return "runtime-safety";
  }
  if (targetSection === "channels" || targetSection.startsWith("channels.")) return "channels";
  if (
    targetSection === "tools" ||
    targetSection.startsWith("tools.") ||
    targetSection === "skills" ||
    targetSection.startsWith("skills.") ||
    targetSection === "skill_bundles" ||
    targetSection.startsWith("skill_bundles.") ||
    targetSection === "mcp" ||
    targetSection.startsWith("mcp.")
  ) {
    return "tools-skills";
  }
  return "gateway-overview";
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
  const groups: Array<"App" | "Gateway" | "Capabilities" | "Operations"> = [
    "App",
    "Gateway",
    "Capabilities",
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

      <div className="min-h-0 flex-1 overflow-y-auto p-3 zc-scrollbar">
        {groups.map((group) => (
          <section key={group} className="mb-5">
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">{group}</h2>
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
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
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
    <div className="h-full overflow-auto p-5 text-sm zc-scrollbar">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-100">Connection</h2>
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
          <h2 className="mb-3 text-sm font-medium text-neutral-100">Workspace</h2>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <InfoItem label="Folder" value={root ?? "No folder open"} wide />
            <InfoItem label="Chat attachments" value={String(selectedFiles.length)} />
            <InfoItem label="Saved runtimes" value={String(connections.length)} />
            <InfoItem label="Activation" value={activation ? activation.type : "idle"} />
          </dl>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h2 className="mb-2 text-sm font-medium text-neutral-100">Local Preferences</h2>
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
                onChange={(e) => void updatePreference("notifications", e.target.checked)}
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
      <dt className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="truncate rounded border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-neutral-300">
        {value}
      </dd>
    </div>
  );
}
