import { CheckCircle2, FolderOpen, Home, Link2, WifiOff } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useEffect, useState } from "react";
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
import { Switch } from "@/ui/switch";
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
    <div className="h-full overflow-auto px-5 py-4 text-sm zc-scrollbar">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-base font-semibold text-neutral-100">
            <Trans>App</Trans>
          </h1>
          <p className="max-w-2xl text-xs leading-5 text-neutral-500">
            <Trans>
              Local app state, workspace context, and preferences for this desktop client.
            </Trans>
          </p>
        </header>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-neutral-100">
                  <Trans>Connection</Trans>
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  <Trans>Current runtime selected in the title bar.</Trans>
                </p>
              </div>
              <StatusBadge online={Boolean(online)} />
            </div>

            {active ? (
              <div className="space-y-4">
                <div>
                  <p className="text-base font-medium text-neutral-100">{active.name}</p>
                  <p className="mt-1 break-all font-mono text-xs text-neutral-500">
                    {active.url || t`pending tunnel`}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <SummaryItem label={t`Transport`} value={active.transport} />
                  <SummaryItem label={t`Lifecycle`} value={active.lifecycle} />
                </dl>
              </div>
            ) : (
              <EmptyState icon={<WifiOff size={18} />} label={t`No active connection.`} />
            )}
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-neutral-100">
                  <Trans>Workspace</Trans>
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  <Trans>Files and runtime activity visible to the app.</Trans>
                </p>
              </div>
              <FolderOpen size={18} className="mt-0.5 text-cyan-200/80" />
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                  <Trans>Folder</Trans>
                </p>
                <p className="mt-1 break-all font-mono text-xs text-neutral-300">
                  {root ?? t`No folder open`}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <SummaryItem label={t`Attachments`} value={String(selectedFiles.length)} />
                <SummaryItem label={t`Runtimes`} value={String(connections.length)} />
                <SummaryItem label={t`Activation`} value={activation ? activation.type : t`idle`} />
              </dl>
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-medium text-neutral-100">
              <Trans>Preferences</Trans>
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              <Trans>Stored locally on this device.</Trans>
            </p>
          </div>

          <div className="divide-y divide-white/10">
            <PreferenceRow
              label={t`Language`}
              description={t`Change the app interface language.`}
              control={
                <Select
                  value={preferences.language}
                  options={[
                    { value: "en", label: "English" },
                    { value: "zh-CN", label: "中文" },
                  ]}
                  onValueChange={(value) =>
                    void updatePreference("language", value as AppPreferences["language"])
                  }
                  className="w-full sm:w-56"
                />
              }
            />

            <PreferenceRow
              label={t`Global shortcut`}
              description={t`Quickly bring ZeroClaw Workspace to the front.`}
              control={
                <input
                  value={preferences.shortcut}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      shortcut: e.target.value,
                    }))
                  }
                  onBlur={(e) => void updatePreference("shortcut", e.target.value)}
                  className="w-full rounded border border-white/10 bg-[#020818]/90 px-2 py-1.5 font-mono text-xs text-neutral-200 outline-none transition focus:border-cyan-400/60 sm:w-72"
                />
              }
            />

            <PreferenceRow
              label={t`Notifications`}
              description={t`Notify on hidden-window approvals and completed turns.`}
              control={
                <Switch
                  checked={preferences.notifications}
                  onCheckedChange={(checked) => void updatePreference("notifications", checked)}
                />
              }
            />

            <PreferenceRow
              label={t`Tray / menu bar`}
              description={t`Keep the desktop menu bar integration enabled.`}
              control={
                <Switch
                  checked={preferences.tray}
                  onCheckedChange={(checked) => void updatePreference("tray", checked)}
                />
              }
            />

            <PreferenceRow
              label={t`Deep link scheme`}
              description={t`Used by zeroclaw:// links from the operating system.`}
              control={<ReadOnlyBadge icon={<Link2 size={13} />} value={t`Registered`} />}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
        online
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
          : "border-amber-400/20 bg-amber-400/10 text-amber-200"
      }`}
    >
      {online ? <CheckCircle2 size={13} /> : <WifiOff size={13} />}
      {online ? <Trans>Online</Trans> : <Trans>Offline</Trans>}
    </span>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-[#020818]/60 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 truncate font-mono text-neutral-200">{value}</dd>
    </div>
  );
}

function PreferenceRow({
  label,
  description,
  control,
}: {
  label: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(180px,1fr)_minmax(220px,auto)] sm:items-center">
      <div className="min-w-0">
        <div className="text-sm text-neutral-200">{label}</div>
        <div className="mt-1 text-xs leading-5 text-neutral-500">{description}</div>
      </div>
      <div className="flex min-w-0 justify-start sm:justify-end">{control}</div>
    </div>
  );
}

function ReadOnlyBadge({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-[#020818]/70 px-2 py-1.5 font-mono text-xs text-neutral-300">
      <span className="text-cyan-200/80">{icon}</span>
      {value}
    </span>
  );
}

function EmptyState({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 rounded border border-dashed border-white/10 bg-[#020818]/50 text-xs text-neutral-500">
      {icon}
      {label}
    </div>
  );
}
