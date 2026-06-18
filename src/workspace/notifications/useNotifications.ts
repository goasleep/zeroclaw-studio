// Notifications integration. Approval requests when window is hidden,
// completion when long-running turns finish.

import { useEffect } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { loadPreferences } from "@/workspace/preferences/preferences";

let permissionState: "unknown" | "granted" | "denied" = "unknown";

export async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionState === "granted") return true;
  if (permissionState === "denied") return false;
  let granted = await isPermissionGranted();
  if (!granted) {
    const res = await requestPermission();
    granted = res === "granted";
  }
  permissionState = granted ? "granted" : "denied";
  return granted;
}

export async function notify(title: string, body: string) {
  const prefs = await loadPreferences().catch(() => null);
  if (prefs && !prefs.notifications) return;
  if (!(await ensureNotificationPermission())) return;
  sendNotification({ title, body });
}

/** Mount in <App>. Wires window-visibility-aware notifications based on
 * approval-request and chat-done events. Phase 6 expands this with
 * connection-down banners etc. */
export function useNotifications() {
  useEffect(() => {
    function onApproval(e: Event) {
      const detail = (e as CustomEvent<{ tool: string }>).detail;
      if (document.visibilityState === "visible") return;
      void notify("ZeroClaw approval needed", `${detail.tool} is waiting for approval.`);
    }
    function onDone(e: Event) {
      if (document.visibilityState === "visible") return;
      const detail = (e as CustomEvent<{ agent: string }>).detail;
      void notify("ZeroClaw turn finished", `${detail.agent} responded.`);
    }
    window.addEventListener("zeroclaw://approval-request", onApproval);
    window.addEventListener("zeroclaw://chat-done", onDone);
    return () => {
      window.removeEventListener("zeroclaw://approval-request", onApproval);
      window.removeEventListener("zeroclaw://chat-done", onDone);
    };
  }, []);
}
