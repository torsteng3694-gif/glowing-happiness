"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  LayoutDashboard,
  Wallet,
  Users,
  Megaphone,
  Network,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string };

const SECTIONS: { key: string; title: string; icon: typeof Home; items: Item[] }[] = [
  {
    key: "home",
    title: "首页",
    icon: Home,
    items: [{ href: "/agent/dashboard", label: "仪表盘" }],
  },
  {
    key: "finance",
    title: "财务管理",
    icon: Wallet,
    items: [{ href: "/agent/finance", label: "财务概览" }],
  },
  {
    key: "customers",
    title: "客户管理",
    icon: Users,
    items: [{ href: "/agent/customers", label: "客户列表" }],
  },
  {
    key: "ops",
    title: "运营管理",
    icon: Megaphone,
    items: [{ href: "/agent/operations", label: "运营数据" }],
  },
  {
    key: "net",
    title: "网络设置",
    icon: Network,
    items: [{ href: "/agent/network", label: "推广链接" }],
  },
];

export default function AgentNav() {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const s of SECTIONS) {
      o[s.key] = s.items.some((it) => path === it.href || path.startsWith(it.href + "/"));
    }
    if (!Object.values(o).some(Boolean)) o.home = true;
    return o;
  });

  const toggle = (key: string) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
      {SECTIONS.map((sec) => {
        const Icon = sec.icon;
        const expanded = open[sec.key] ?? false;
        const childActive = sec.items.some((it) => path === it.href);
        return (
          <div key={sec.key} className="rounded-lg">
            <button
              type="button"
              onClick={() => toggle(sec.key)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left",
                childActive || expanded
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
              )}
            >
              <Icon className="w-4 h-4 shrink-0 opacity-90" />
              <span className="flex-1">{sec.title}</span>
              <ChevronDown
                className={cn("w-4 h-4 shrink-0 transition-transform opacity-70", expanded && "rotate-180")}
              />
            </button>
            {expanded && (
              <div className="mt-0.5 ml-2 pl-4 border-l border-slate-700 space-y-0.5 py-1">
                {sec.items.map((it) => {
                  const active = path === it.href;
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition",
                        active
                          ? "bg-sky-600/30 text-sky-100 font-medium"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/80",
                      )}
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 opacity-70" />
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
