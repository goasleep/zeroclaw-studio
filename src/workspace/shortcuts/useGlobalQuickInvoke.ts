// Global shortcut registration + window-focus integration.
//
// Default binding: Cmd/Ctrl+Shift+Space → bring window to front and ping
// the chat composer (the composer subscribes to a window event).

import { useEffect } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

const DEFAULT_SHORTCUT = "CmdOrCtrl+Shift+Space";

/** Mount once in <App>. Tears down on unmount. */
export function useGlobalQuickInvoke() {
  useEffect(() => {
    let registered = false;
    void register(DEFAULT_SHORTCUT, async (event) => {
      // Tauri 2.5+ delivers `pressed | released` — only act on `Pressed`.
      if (event.state !== "Pressed") return;
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
      window.dispatchEvent(new CustomEvent("zeroclaw://quick-invoke"));
    })
      .then(() => {
        registered = true;
      })
      .catch((err) => {
        // Common case: shortcut already registered by another app.
        console.warn("global shortcut register failed:", err);
      });
    return () => {
      if (registered) void unregister(DEFAULT_SHORTCUT).catch(() => undefined);
    };
  }, []);
}
