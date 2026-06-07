// Deep-link handler: zeroclaw://agent/<alias>, zeroclaw://file/<abs-path>
// route into the workspace's existing UI state.

import { useEffect } from "react";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";

export function useDeepLinks() {
  useEffect(() => {
    const unlisten = onOpenUrl((urls) => {
      for (const raw of urls) {
        try {
          const u = new URL(raw);
          if (u.protocol !== "zeroclaw:") continue;
          // host = command (e.g. "agent"), pathname segments = args.
          window.dispatchEvent(
            new CustomEvent("zeroclaw://deep-link", { detail: u }),
          );
        } catch {
          /* ignore malformed urls */
        }
      }
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);
}
