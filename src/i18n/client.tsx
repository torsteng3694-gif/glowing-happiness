"use client";
import * as React from "react";
import { messages, type MessageKey } from "./messages";
import { DEFAULT_LOCALE, type Locale } from "./config";

const LocaleContext = React.createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return React.useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return React.useMemo(() => {
    const primary = messages[locale];
    const fallback = messages[DEFAULT_LOCALE];
    return function t(key: MessageKey, params?: Record<string, string | number>) {
      let s = primary[key] ?? fallback[key] ?? String(key);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return s;
    };
  }, [locale]);
}
