import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createElement, type ReactNode } from "react";
import { messages as enMessages } from "@/locales/en/messages.mjs";
import { DEFAULT_LOCALE, type SupportedLocale } from "./locales";

type CatalogModule = typeof import("@/locales/en/messages.mjs");

const catalogLoaders: Record<SupportedLocale, () => Promise<CatalogModule>> = {
  en: () => Promise.resolve({ messages: enMessages }),
  "zh-CN": () => import("@/locales/zh-CN/messages.mjs"),
};

i18n.load(DEFAULT_LOCALE, enMessages);
i18n.activate(DEFAULT_LOCALE);

export async function setAppLocale(locale: SupportedLocale): Promise<void> {
  if (!i18n.messages[locale]) {
    const catalog = await catalogLoaders[locale]();
    i18n.load(locale, catalog.messages);
  }
  i18n.activate(locale);
  document.documentElement.lang = locale;
}

export function AppI18nProvider({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, { i18n }, children);
}

export { i18n };
