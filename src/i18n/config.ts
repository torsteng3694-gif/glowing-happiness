export const SUPPORTED_LOCALES = ["zh", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh";
export const LOCALE_COOKIE = "ai_hub_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  zh: "中文",
  en: "English",
};

export const HTML_LANG: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}
