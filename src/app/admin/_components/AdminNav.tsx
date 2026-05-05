"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Boxes, Receipt, MessageCircleQuestion, ListChecks, Settings, Cloud,
  BadgeDollarSign, KeyRound, Key, Wand2, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "概览", icon: LayoutDashboard },
  /** 代理商中心（嵌在管理后台里，不跳转出去） */
  { href: "/admin/agent", label: "代理商中心", icon: Building2 },
  { href: "/admin/users", label: "用户", icon: Users },
  { href: "/admin/models", label: "模型 & 渠道", icon: Boxes },
  { href: "/admin/upstreams", label: "上游账号", icon: Cloud },
  { href: "/admin/upstream-keys", label: "上游密钥池", icon: Key },
  { href: "/admin/pricing", label: "定价策略", icon: BadgeDollarSign },
  { href: "/admin/apikeys", label: "API Keys", icon: KeyRound },
  { href: "/admin/tasks", label: "任务管理", icon: ListChecks },
  { href: "/admin/transactions", label: "交易", icon: Receipt },
  { href: "/admin/feedback", label: "反馈处理", icon: MessageCircleQuestion },
  { href: "/admin/comic-pipeline", label: "解说漫剧管线", icon: Wand2 },
  { href: "/admin/settings", label: "平台设置", icon: Settings },
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {items.map((it) => {
        const active = path === it.href || (it.href !== "/admin" && path.startsWith(it.href));
        const Icon = it.icon;
        return (
          <Link key={it.href} href={it.href} className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition",
            active ? "bg-amber-50 text-amber-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}>
            <Icon className="w-4 h-4" /> {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
