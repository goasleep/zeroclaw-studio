// Clipboard helpers — read text on demand. Active polling deliberately
// omitted (privacy + battery); the user pulls clipboard text into chat
// via a dedicated button.

import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function readClipboardText(): Promise<string> {
  try {
    return (await readText()) ?? "";
  } catch {
    return "";
  }
}

export async function writeClipboardText(text: string): Promise<void> {
  try {
    await writeText(text);
  } catch {
    /* no-op */
  }
}
