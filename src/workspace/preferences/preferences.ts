import { load } from "@tauri-apps/plugin-store";

const STORE_PATH = "app-preferences.json";

export interface AppPreferences {
  shortcut: string;
  notifications: boolean;
  tray: boolean;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  shortcut: "CmdOrCtrl+Shift+Space",
  notifications: true,
  tray: true,
};

type PreferenceKey = keyof AppPreferences;

async function preferenceStore() {
  return load(STORE_PATH, {
    defaults: {
      "app.preferences.shortcut": DEFAULT_PREFERENCES.shortcut,
      "app.preferences.notifications": DEFAULT_PREFERENCES.notifications,
      "app.preferences.tray": DEFAULT_PREFERENCES.tray,
    },
    autoSave: 100,
  });
}

export async function loadPreferences(): Promise<AppPreferences> {
  const store = await preferenceStore();
  return {
    shortcut: (await store.get<string>("app.preferences.shortcut")) ?? DEFAULT_PREFERENCES.shortcut,
    notifications:
      (await store.get<boolean>("app.preferences.notifications")) ??
      DEFAULT_PREFERENCES.notifications,
    tray: (await store.get<boolean>("app.preferences.tray")) ?? DEFAULT_PREFERENCES.tray,
  };
}

export async function savePreference<K extends PreferenceKey>(
  key: K,
  value: AppPreferences[K],
): Promise<void> {
  const store = await preferenceStore();
  await store.set(`app.preferences.${key}`, value);
  await store.save();
  window.dispatchEvent(
    new CustomEvent("zeroclaw://preferences-changed", {
      detail: { key, value },
    }),
  );
}
