import { load } from "@tauri-apps/plugin-store";
import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@/i18n/locales";
import { DEFAULT_THEME, isSupportedTheme, type AppTheme } from "./theme";

const STORE_PATH = "app-preferences.json";

export interface AppPreferences {
  shortcut: string;
  notifications: boolean;
  tray: boolean;
  language: SupportedLocale;
  theme: AppTheme;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  shortcut: "CmdOrCtrl+Shift+Space",
  notifications: true,
  tray: true,
  language: DEFAULT_LOCALE,
  theme: DEFAULT_THEME,
};

type PreferenceKey = keyof AppPreferences;

async function preferenceStore() {
  return load(STORE_PATH, {
    defaults: {
      "app.preferences.shortcut": DEFAULT_PREFERENCES.shortcut,
      "app.preferences.notifications": DEFAULT_PREFERENCES.notifications,
      "app.preferences.tray": DEFAULT_PREFERENCES.tray,
      "app.preferences.language": DEFAULT_PREFERENCES.language,
      "app.preferences.theme": DEFAULT_PREFERENCES.theme,
    },
    autoSave: 100,
  });
}

export async function loadPreferences(): Promise<AppPreferences> {
  const store = await preferenceStore();
  const language = await store.get<unknown>("app.preferences.language");
  const theme = await store.get<unknown>("app.preferences.theme");
  return {
    shortcut: (await store.get<string>("app.preferences.shortcut")) ?? DEFAULT_PREFERENCES.shortcut,
    notifications:
      (await store.get<boolean>("app.preferences.notifications")) ??
      DEFAULT_PREFERENCES.notifications,
    tray: (await store.get<boolean>("app.preferences.tray")) ?? DEFAULT_PREFERENCES.tray,
    language: isSupportedLocale(language) ? language : DEFAULT_PREFERENCES.language,
    theme: isSupportedTheme(theme) ? theme : DEFAULT_PREFERENCES.theme,
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
