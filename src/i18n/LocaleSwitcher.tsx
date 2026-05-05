"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "default" | "ghost" | "compact";
  className?: string;
};

export default function LocaleSwitcher({ variant = "default", className }: Props) {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function setLocale(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    } catch {
      // silent
    }
    startTransition(() => {
      router.refresh();
    });
  }

  const btnCls = cn(
    "inline-flex items-center gap-1.5 rounded-lg font-medium select-none touch-manipulation transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50",
    variant === "ghost"
      ? "h-9 px-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      : variant === "compact"
        ? "h-8 px-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
        : "h-9 px-3 text-sm text-slate-700 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50",
    className,
  );

  return (
    <div ref={rootRef} className={cn("relative", pending && "opacity-70")}>
      <button
        type="button"
        className={btnCls}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{LOCALE_LABELS[locale]}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 min-w-[140px] rounded-xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg p-1 z-50 animate-scale-in origin-top-right"
        >
          {SUPPORTED_LOCALES.map((lc) => {
            const active = lc === locale;
            return (
              <button
                key={lc}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-100 touch-manipulation",
                  active ? "text-brand-700 bg-brand-50" : "text-slate-700 hover:bg-slate-100",
                )}
                onClick={() => setLocale(lc)}
              >
                <span>{LOCALE_LABELS[lc]}</span>
                {active && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
