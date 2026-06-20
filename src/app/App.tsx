import { useEffect, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { listen } from "@tauri-apps/api/event";
import { ConnectionProvider, useConnections } from "@/app/connection-context";
import { ConnectionPicker } from "@/app/ConnectionPicker";
import { WelcomeScreen } from "@/app/WelcomeScreen";
import { AddConnectionDialog } from "@/app/AddConnectionDialog";
import { WorkspaceProvider } from "@/app/workspace-context";
import { WorkspaceShell } from "@/app/WorkspaceShell";
import {
  APP_COMMAND_EVENT,
  APP_COMMANDS,
  appCommandFromEvent,
  appCommandFromPayload,
} from "@/app/commands/commands";
import { useGlobalQuickInvoke } from "@/workspace/shortcuts/useGlobalQuickInvoke";
import { useNotifications } from "@/workspace/notifications/useNotifications";
import { useDeepLinks } from "@/workspace/protocol/useDeepLinks";
import { setAppLocale } from "@/i18n/i18n";
import { loadPreferences, type AppPreferences } from "@/workspace/preferences/preferences";
import { applyAppTheme } from "@/workspace/preferences/theme";

type AddPath = "remote" | "local-attach" | "local-install" | null;

function Shell() {
  const { connections, active, loading, retry } = useConnections();
  const [addPath, setAddPath] = useState<AddPath>(null);

  // Native quick-interaction capabilities (Phase 5).
  useGlobalQuickInvoke();
  useNotifications();
  useDeepLinks();

  useEffect(() => {
    let disposed = false;

    function applyPreferenceSideEffects(preferences: AppPreferences) {
      applyAppTheme(preferences.theme);
      void setAppLocale(preferences.language);
    }

    function onPreferencesChanged(e: Event) {
      const detail = (
        e as CustomEvent<{
          key: keyof AppPreferences;
          value: AppPreferences[keyof AppPreferences];
        }>
      ).detail;
      if (!detail) return;
      if (detail.key === "theme") {
        applyAppTheme(detail.value as AppPreferences["theme"]);
      }
      if (detail.key === "language") {
        void setAppLocale(detail.value as AppPreferences["language"]);
      }
    }

    void loadPreferences()
      .then((preferences) => {
        if (!disposed) applyPreferenceSideEffects(preferences);
      })
      .catch(() => undefined);
    window.addEventListener("zeroclaw://preferences-changed", onPreferencesChanged);
    return () => {
      disposed = true;
      window.removeEventListener("zeroclaw://preferences-changed", onPreferencesChanged);
    };
  }, []);

  // React to zeroclaw:// deep-link commands — for now, just log; future
  // phases route to specific agents/files.
  useEffect(() => {
    function onDeepLink(e: Event) {
      const url = (e as CustomEvent<URL>).detail;
      console.info("deep-link", url.host, url.pathname);
    }
    window.addEventListener("zeroclaw://deep-link", onDeepLink);
    return () => window.removeEventListener("zeroclaw://deep-link", onDeepLink);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenCommand: (() => void) | undefined;

    function retryActiveConnection() {
      void retry();
    }

    function runCommand(command: unknown) {
      if (appCommandFromPayload(command) === APP_COMMANDS.workspaceRetryConnection.id) {
        retryActiveConnection();
      }
    }

    function onCommand(e: Event) {
      runCommand(appCommandFromEvent(e));
    }

    function onTrayAction(e: Event) {
      const action = (e as CustomEvent<string>).detail;
      if (action === "retry-active-connection") retryActiveConnection();
    }
    void listen(APP_COMMAND_EVENT, (event) => {
      runCommand(event.payload);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenCommand = unlisten;
      }
    });
    window.addEventListener(APP_COMMAND_EVENT, onCommand);
    window.addEventListener("zeroclaw://tray-action", onTrayAction);
    return () => {
      disposed = true;
      unlistenCommand?.();
      window.removeEventListener(APP_COMMAND_EVENT, onCommand);
      window.removeEventListener("zeroclaw://tray-action", onTrayAction);
    };
  }, [retry]);

  if (loading) {
    return (
      <div className="zc-deep-space-bg flex h-full items-center justify-center text-sm text-slate-400">
        <Trans>Loading…</Trans>
      </div>
    );
  }

  return (
    <div className="zc-deep-space-bg flex h-full flex-col text-slate-100">
      <ConnectionPicker onAdd={() => setAddPath("remote")} />

      <main className="flex-1 overflow-hidden">
        {connections.length === 0 ? (
          <WelcomeScreen onChoose={setAddPath} />
        ) : active ? (
          <WorkspaceShell />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            <Trans>Select a connection above, or add one.</Trans>
          </div>
        )}
      </main>

      {addPath && <AddConnectionDialog initialPath={addPath} onClose={() => setAddPath(null)} />}
    </div>
  );
}

export function App() {
  return (
    <ConnectionProvider>
      <WorkspaceProvider>
        <Shell />
      </WorkspaceProvider>
    </ConnectionProvider>
  );
}
