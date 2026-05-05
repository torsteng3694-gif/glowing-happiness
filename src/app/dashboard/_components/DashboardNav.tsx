"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, MessageSquare, Image as ImageIcon, Video, Mic2,
  Store, Key, Wallet, Users, ShieldCheck, MessageCircleQuestion, ListChecks,
  FolderHeart, Sparkles, Wand2, AudioLines, Film, Building2, ImagePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages/zh";

const items: { href: string; labelKey?: MessageKey; label?: string; icon: typeof LayoutDashboard }[] = [
  { href: "/dashboard",             labelKey: "dashnav.overview",    icon: LayoutDashboard },
  { href: "/dashboard/chat",        labelKey: "dashnav.chat",        icon: MessageSquare },
  { href: "/dashboard/chat-multi",  labelKey: "dashnav.chat_multi",  icon: Sparkles },
  { href: "/dashboard/image",       labelKey: "dashnav.image",       icon: ImageIcon },
  { href: "/dashboard/video",         labelKey: "dashnav.video",         icon: Video },
  { href: "/dashboard/explain-comic", labelKey: "dashnav.explain_comic", icon: Wand2 },
  { href: "/dashboard/comic-multiframe", label: "AI 漫剧 S2.0",         icon: Film },
  { href: "/dashboard/comic-v3",       label: "AI 漫剧 S3.0 ✨",        icon: Sparkles },
  { href: "/dashboard/comic-auto",     label: "自动漫画智能体",          icon: Wand2 },
  { href: "/dashboard/ecom-image",     label: "电商一键出图 ✨",         icon: ImagePlus },
  { href: "/dashboard/voices",        labelKey: "dashnav.audio",         icon: Mic2 },
  { href: "/dashboard/voices",        labelKey: "dashnav.voices",        icon: AudioLines },
  { href: "/dashboard/tasks",         labelKey: "dashnav.tasks",         icon: ListChecks },
  { href: "/dashboard/gallery",     labelKey: "dashnav.gallery",     icon: FolderHeart },
  { href: "/dashboard/models",      labelKey: "dashnav.models",      icon: Store },
  { href: "/dashboard/keys",        labelKey: "dashnav.keys",        icon: Key },
  { href: "/dashboard/billing",     labelKey: "dashnav.billing",     icon: Wallet },
  { href: "/dashboard/referrals",   labelKey: "dashnav.referrals",   icon: Users },
  { href: "/dashboard/feedback",    labelKey: "dashnav.feedback",    icon: MessageCircleQuestion },
];

export default function DashboardNav({ role }: { role: string }) {
  const path = usePathname();
  const t = useT();
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {items.map((it) => {
        const active = path === it.href || (it.href !== "/dashboard" && path.startsWith(it.href));
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition",
              active
                ? "text-brand-700 bg-gradient-to-r from-brand-50 to-purple-50"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all",
                active
                  ? "bg-gradient-to-b from-indigo-500 via-purple-500 to-pink-500 opacity-100"
                  : "opacity-0 group-hover:opacity-30 bg-slate-400",
              )}
            />
            <Icon
              className={cn(
                "w-4 h-4 transition-transform",
                active ? "text-brand-600" : "text-slate-500 group-hover:text-slate-700",
                "group-hover:scale-110",
              )}
            />
            <span className="flex-1">{it.labelKey ? t(it.labelKey) : it.label}</span>
            {active && (
              <span className="relative flex h-1.5 w-1.5 text-brand-500">
                <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
              </span>
            )}
          </Link>
        );
      })}
      {(role === "agent" || role === "admin") && (
        <>
          <div className="mt-4 mb-2 px-3 flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
            <span>代理</span>
            <span className="flex-1 flow-line" />
          </div>
          <Link
            href="/agent/dashboard"
            className={cn(
              "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition",
              path.startsWith("/agent")
                ? "text-sky-800 bg-gradient-to-r from-sky-50 to-indigo-50"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all",
                path.startsWith("/agent")
                  ? "bg-gradient-to-b from-sky-500 to-indigo-600"
                  : "opacity-0 group-hover:opacity-30 bg-slate-400",
              )}
            />
            <Building2
              className={cn(
                "w-4 h-4 transition-transform",
                path.startsWith("/agent") ? "text-sky-600" : "text-slate-500 group-hover:text-slate-700",
                "group-hover:scale-110",
              )}
            />
            代理中心
          </Link>
        </>
      )}
      {role === "admin" && (
        <>
          <div className="mt-4 mb-2 px-3 flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
            <span>{t("dash.admin_group")}</span>
            <span className="flex-1 flow-line" />
          </div>
          <Link
            href="/admin"
            className={cn(
              "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition",
              path.startsWith("/admin")
                ? "text-amber-700 bg-gradient-to-r from-amber-50 to-rose-50"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all",
                path.startsWith("/admin")
                  ? "bg-gradient-to-b from-amber-500 to-rose-500"
                  : "opacity-0 group-hover:opacity-30 bg-slate-400",
              )}
            />
            <ShieldCheck className={cn("w-4 h-4", path.startsWith("/admin") ? "text-amber-600" : "text-slate-500 group-hover:text-slate-700", "group-hover:scale-110 transition-transform")} />
            {t("dash.admin_console")}
          </Link>
        </>
      )}
    </nav>
  );
}
