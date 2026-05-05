import "server-only";
import { cookies, headers } from "next/headers";
import { messages, type MessageKey } from "./messages";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  type Locale,
} from "./config";

function pickFromAcceptLanguage(al: string | null): Locale | null {
  if (!al) return null;
  const lowered = al.toLowerCase();
  if (lowered.startsWith("zh")) return "zh";
  if (lowered.startsWith("en")) return "en";
  const tokens = lowered.split(",").map((t) => t.trim().split(";")[0]);
  for (const tok of tokens) {
    if (tok.startsWith("zh")) return "zh";
    if (tok.startsWith("en")) return "en";
  }
  return null;
}

/** Server-side: read locale from cookie → Accept-Language → default. */
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const fromCookie = c.get(LOCALE_COOKIE)?.value;
  if (fromCookie && (SUPPORTED_LOCALES as readonly string[]).includes(fromCookie)) {
    return fromCookie as Locale;
  }
  const h = await headers();
  const fromHeader = pickFromAcceptLanguage(h.get("accept-language"));
  if (fromHeader) return fromHeader;
  return DEFAULT_LOCALE;
}

export function translator(locale: Locale) {
  const primary = messages[locale];
  const fallback = messages[DEFAULT_LOCALE];
  return function t(
    key: MessageKey,
    params?: Record<string, string | number>,
  ): string {
    let s = primary[key] ?? fallback[key] ?? String(key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return s;
  };
}

/** Server-side helper for server components. */
export async function getT() {
  const locale = await getLocale();
  const t = translator(locale);
  return { locale, t };
}
