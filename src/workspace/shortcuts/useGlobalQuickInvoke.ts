// Global shortcut registration + window-focus integration.
//
// Default binding: Cmd/Ctrl+Shift+Space → bring window to front and ping
// the chat composer (the composer subscribes to a window event).

import { useEffect } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DEFAULT_PREFERENCES, loadPreferences } from "@/workspace/preferences/preferences";

/** Mount once in <App>. Tears down on unmount. */
export function useGlobalQuickInvoke() {
  useEffect(() => {
    let registeredShortcut: string | null = null;
    let disposed = false;

    async function activate(event: { state: string }) {
      // Tauri 2.5+ delivers `pressed | released` — only act on `Pressed`.
      if (event.state !== "Pressed") return;
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
      window.dispatchEvent(new CustomEvent("zeroclaw://quick-invoke"));
    }

    async function registerShortcut(shortcut: string) {
      const next = shortcut.trim() || DEFAULT_PREFERENCES.shortcut;
      if (registeredShortcut === next) return;
      if (registeredShortcut) {
        await unregister(registeredShortcut).catch(() => undefined);
        registeredShortcut = null;
      }
      if (disposed) return;
      await register(next, activate)
        .then(() => {
          registeredShortcut = next;
        })
        .catch((err) => {
          // Common case: shortcut already registered by another app.
          console.warn("global shortcut register failed:", err);
        });
    }

    function onPreferencesChanged(e: Event) {
      const detail = (e as CustomEvent<{ key: string; value: unknown }>).detail;
      if (detail.key === "shortcut" && typeof detail.value === "string") {
        void registerShortcut(detail.value);
      }
    }

    window.addEventListener("zeroclaw://preferences-changed", onPreferencesChanged);
    void loadPreferences()
      .then((prefs) => registerShortcut(prefs.shortcut))
      .catch(() => registerShortcut(DEFAULT_PREFERENCES.shortcut));

    return () => {
      disposed = true;
      window.removeEventListener("zeroclaw://preferences-changed", onPreferencesChanged);
      if (registeredShortcut) {
        void unregister(registeredShortcut).catch(() => undefined);
      }
    };
  }, []);
}
