import type { Metadata } from "next";
import "./globals.css";
import { getT } from "@/i18n/server";
import { HTML_LANG } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t("meta.site.title"),
    description: t("meta.site.desc"),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getT();
  return (
    <html lang={HTML_LANG[locale]}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
