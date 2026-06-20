import { Home } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { useConnections } from "@/app/connection-context";
import { useWorkspace } from "@/app/workspace-context";
import { AgentWorkspacePanel } from "@/features/agent-workspace/AgentWorkspacePanel";
import { ConfigDraftProvider, ConfigDraftStatusBar } from "@/features/config/config-drafts";
import { ConfigPanel, type ConfigCategoryId } from "@/features/config/ConfigPanel";
import { CronPanel } from "@/features/cron/CronPanel";
import { DevicesPanel } from "@/features/devices/DevicesPanel";
import { DoctorPanel } from "@/features/doctor/DoctorPanel";
import { IntegrationsPanel } from "@/features/integrations/IntegrationsPanel";
import { LogsPanel } from "@/features/logs/LogsPanel";
import { MemoryPanel } from "@/features/memory/MemoryPanel";
import { SetupCenterPanel } from "@/features/setup/SetupCenterPanel";
import { setAppLocale } from "@/i18n/i18n";
import { Select } from "@/ui/select";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreference,
  type AppPreferences,
} from "@/workspace/preferences/preferences";
import { SETTINGS_SECTIONS, type SettingsGroup } from "./settings-sections";
import { settingsSectionForConfigTarget } from "./settings-routing";
import type { SettingsSection } from "./types";

const SETTINGS_GROUPS: SettingsGroup[] = ["App", "Gateway", "Capabilities", "Operations"];

interface SettingsPageProps {
  section: SettingsSection;
  configFocusSection: string | null;
  onSection: (section: SettingsSection) => void;
  onBackToChat: () => void;
  onConfigFocusSection: (section: string | null) => void;
  agentWorkspaceFocusAlias?: string | null;
}

export function SettingsPage({
  section,
  configFocusSection,
  onSection,
  onBackToChat,
  onConfigFocusSection,
  agentWorkspaceFocusAlias = null,
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
        <ConfigDraftProvider>
          <ConfigDraftStatusBar />
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
            {effectiveSection === "agent-workspace" && (
              <AgentWorkspacePanel focusAlias={agentWorkspaceFocusAlias} />
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
        </ConfigDraftProvider>
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

function SettingsNav({
  section,
  onSection,
  onBackToChat,
}: {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onBackToChat: () => void;
}) {
  const { t } = useLingui();

  function groupLabel(group: SettingsGroup) {
    switch (group) {
      case "App":
        return t`App`;
      case "Gateway":
        return t`Gateway`;
      case "Capabilities":
        return t`Capabilities`;
      case "Operations":
        return t`Operations`;
    }
  }

  return (
    <aside className="flex min-h-0 flex-col bg-[#020818]/90">
      <header className="shrink-0 border-b border-white/10 p-3">
        <button
          type="button"
          onClick={onBackToChat}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-400 transition hover:bg-white/[0.05] hover:text-neutral-100"
        >
          <Home size={14} />
          <span className="min-w-0 flex-1 truncate">
            <Trans>Back to app</Trans>
          </span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 zc-scrollbar">
        {SETTINGS_GROUPS.map((group) => (
          <section key={group} className="mb-5">
            <h2 className="mb-2 text-[10px] uppercase tracking-wide text-neutral-500">
              {groupLabel(group)}
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
                    <span className="min-w-0 flex-1 truncate">{t(label)}</span>
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
  const { t } = useLingui();
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
    if (key === "language") {
      await setAppLocale(value as AppPreferences["language"]);
    }
  }

  return (
    <div className="h-full overflow-auto p-5 text-sm zc-scrollbar">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-100">
            <Trans>Connection</Trans>
          </h2>
          {active ? (
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <InfoItem label={t`Name`} value={active.name} />
              <InfoItem label={t`Status`} value={online ? t`Online` : t`Offline`} />
              <InfoItem label={t`Transport`} value={active.transport} />
              <InfoItem label={t`Lifecycle`} value={active.lifecycle} />
              <InfoItem label={t`URL`} value={active.url || t`pending tunnel`} wide />
            </dl>
          ) : (
            <p className="text-xs text-neutral-500">
              <Trans>No active connection.</Trans>
            </p>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-100">
            <Trans>Workspace</Trans>
          </h2>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <InfoItem label={t`Folder`} value={root ?? t`No folder open`} wide />
            <InfoItem label={t`Chat attachments`} value={String(selectedFiles.length)} />
            <InfoItem label={t`Saved runtimes`} value={String(connections.length)} />
            <InfoItem label={t`Activation`} value={activation ? activation.type : t`idle`} />
          </dl>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <h2 className="mb-2 text-sm font-medium text-neutral-100">
            <Trans>Local Preferences</Trans>
          </h2>
          <div className="space-y-3 text-xs">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                <Trans>Language</Trans>
              </span>
              <Select
                value={preferences.language}
                options={[
                  { value: "en", label: "English" },
                  { value: "zh-CN", label: "中文" },
                ]}
                onValueChange={(value) =>
                  void updatePreference("language", value as AppPreferences["language"])
                }
                className="w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-neutral-500">
                <Trans>Global shortcut</Trans>
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
                <span className="block text-neutral-300">
                  <Trans>Notifications</Trans>
                </span>
                <span className="text-[10px] text-neutral-500">
                  <Trans>Notify on hidden-window approvals and completed turns.</Trans>
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
                <span className="block text-neutral-300">
                  <Trans>Tray / menu bar</Trans>
                </span>
                <span className="text-[10px] text-neutral-500">
                  <Trans>Tray is available in this build; preference is stored locally.</Trans>
                </span>
              </span>
              <input
                type="checkbox"
                checked={preferences.tray}
                onChange={(e) => void updatePreference("tray", e.target.checked)}
              />
            </label>
            <InfoItem label={t`Deep link scheme`} value={t`zeroclaw:// registered`} />
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
