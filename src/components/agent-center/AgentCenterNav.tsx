"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ChevronDown,
  Wallet,
  Users,
  Megaphone,
  Settings,
  Network,
  Receipt,
  Banknote,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type AgentCenterMode = "admin" | "agent";

const href = (mode: AgentCenterMode, path: string) =>
  mode === "admin" ? `/admin/agent${path}` : `/agent${path}`;

export default function AgentCenterNav({
  variant = "light",
  mode,
}: {
  variant?: "light" | "dark";
  mode: AgentCenterMode;
}) {
  const path = usePathname();
  const [financeOpen, setFinanceOpen] = useState(true);

  const isDark = variant === "dark";
  const section = isDark ? "text-slate-500 text-xs uppercase tracking-wide px-3 mb-1" : "text-slate-400 text-xs uppercase tracking-wide px-3 mb-1";
  const item = (active: boolean) =>
    cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition",
      active
        ? isDark
          ? "bg-slate-800 text-white"
          : "bg-sky-50 text-sky-800"
        : isDark
          ? "text-slate-300 hover:bg-slate-800/80 hover:text-white"
          : "text-slate-600 hover:bg-slate-50",
    );

  const active = (p: string) => path === p || path.startsWith(p + "/");

  const dash = mode === "admin" ? "/admin/agent" : "/agent/dashboard";

  return (
    <nav className={cn("w-52 shrink-0 flex flex-col gap-1", isDark && "text-slate-200")}>
      <div className={section}>首页</div>
      <Link href={dash} className={item(path === dash)}>
        <LayoutDashboard className="w-4 h-4 shrink-0 opacity-80" />
        仪表盘
      </Link>

      <button
        type="button"
        onClick={() => setFinanceOpen((v) => !v)}
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium w-full text-left transition",
          active(mode === "admin" ? "/admin/agent/finance" : "/agent/finance")
            ? isDark
              ? "bg-slate-800 text-white"
              : "bg-sky-50 text-sky-800"
            : isDark
              ? "text-slate-300 hover:bg-slate-800/60"
              : "text-slate-600 hover:bg-slate-50",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <Wallet className="w-4 h-4 shrink-0 opacity-80" />
          财务管理
        </span>
        <ChevronDown className={cn("w-4 h-4 transition", financeOpen && "rotate-180")} />
      </button>
      {financeOpen && (
        <div className={cn("ml-2 pl-3 border-l space-y-0.5 py-1", isDark ? "border-slate-700" : "border-slate-200")}>
          <Link href={href(mode, "/finance/revenue")} className={item(active(href(mode, "/finance/revenue")))}>
            <Receipt className="w-3.5 h-3.5 shrink-0 opacity-70" />
            收益记录
          </Link>
          <Link href={href(mode, "/finance/withdrawals")} className={item(active(href(mode, "/finance/withdrawals")))}>
            <Banknote className="w-3.5 h-3.5 shrink-0 opacity-70" />
            提现记录
          </Link>
          <Link href={href(mode, "/finance/invoices")} className={item(active(href(mode, "/finance/invoices")))}>
            <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
            发票记录
          </Link>
        </div>
      )}

      <div className={cn(section, "mt-3")}>业务</div>
      <Link href={href(mode, "/customers")} className={item(active(href(mode, "/customers")))}>
        <Users className="w-4 h-4 shrink-0 opacity-80" />
        客户管理
      </Link>
      <Link href={href(mode, "/operations")} className={item(active(href(mode, "/operations")))}>
        <Megaphone className="w-4 h-4 shrink-0 opacity-80" />
        运营管理
      </Link>
      <Link href={href(mode, "/network")} className={item(active(href(mode, "/network")))}>
        <Network className="w-4 h-4 shrink-0 opacity-80" />
        推广链接
      </Link>

      <div className={cn(section, "mt-3")}>系统</div>
      <Link href={href(mode, "/settings")} className={item(active(href(mode, "/settings")))}>
        <Settings className="w-4 h-4 shrink-0 opacity-80" />
        系统设置
      </Link>
    </nav>
  );
}
