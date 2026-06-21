// Notifications integration. Approval requests when window is hidden,
// completion when long-running turns finish.

import { useEffect } from "react";
import { msg } from "@lingui/core/macro";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { ApprovalsUpdatedEvent } from "@/api/tauri";
import { loadPreferences } from "@/workspace/preferences/preferences";
import { i18n } from "@/i18n/i18n";

let permissionState: "unknown" | "granted" | "denied" = "unknown";
const notifiedApprovals = new Set<string>();

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
      void notify(
        i18n._(msg`ZeroClaw approval needed`),
        i18n._(msg`${detail.tool} is waiting for approval.`),
      );
    }
    const unlistenApprovals = listen<ApprovalsUpdatedEvent>(
      "zeroclaw://approvals-updated",
      (event) => {
        const detail = event.payload;
        if (document.visibilityState === "visible") return;
        const approval = detail.approvals.find((item) => {
          const key = `${item.connection_id}:${item.request_id}`;
          return !notifiedApprovals.has(key);
        });
        if (!approval) return;
        notifiedApprovals.add(`${approval.connection_id}:${approval.request_id}`);
        void notify(
          i18n._(msg`ZeroClaw approval needed`),
          i18n._(msg`${approval.tool ?? "A task"} is waiting for approval.`),
        );
      },
    );
    function onDone(e: Event) {
      if (document.visibilityState === "visible") return;
      const detail = (e as CustomEvent<{ agent: string }>).detail;
      void notify(i18n._(msg`ZeroClaw turn finished`), i18n._(msg`${detail.agent} responded.`));
    }
    window.addEventListener("zeroclaw://approval-request", onApproval);
    window.addEventListener("zeroclaw://chat-done", onDone);
    return () => {
      window.removeEventListener("zeroclaw://approval-request", onApproval);
      window.removeEventListener("zeroclaw://chat-done", onDone);
      void unlistenApprovals.then((dispose) => dispose());
    };
  }, []);
}
