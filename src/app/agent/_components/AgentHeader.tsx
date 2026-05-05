"use client";

import { Bell, Moon, Search } from "lucide-react";
import { usePathname } from "next/navigation";

const TITLE_MAP: Record<string, string> = {
  "/agent/dashboard": "仪表盘",
  "/agent/finance": "财务",
  "/agent/finance/revenue": "收益记录",
  "/agent/finance/withdrawals": "提现记录",
  "/agent/finance/invoices": "发票记录",
  "/agent/customers": "客户管理",
  "/agent/operations": "运营管理",
  "/agent/network": "推广链接",
  "/agent/settings": "系统设置",
};

function segmentFromPath(path: string | null) {
  if (!path) return "页面";
  if (path.startsWith("/agent/finance/revenue")) return "收益记录";
  if (path.startsWith("/agent/finance/withdrawals")) return "提现记录";
  if (path.startsWith("/agent/finance/invoices")) return "发票记录";
  return TITLE_MAP[path] || "页面";
}

export function AgentHeader({ email, name }: { email: string; name: string | null }) {
  const path = usePathname();
  const segment = segmentFromPath(path);

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="text-sm text-slate-600">
        <span className="text-slate-400">代理商中心</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-slate-900 font-medium">{segment}</span>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <button
          type="button"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hidden sm:inline-flex"
          title="通知"
        >
          <Bell className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hidden sm:inline-flex"
          title="深色模式（即将支持）"
        >
          <Moon className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hidden sm:inline-flex"
          title="搜索"
        >
          <Search className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 text-white text-xs font-bold flex items-center justify-center">
            {(name || email).slice(0, 1).toUpperCase()}
          </div>
          <span className="text-sm text-slate-700 max-w-[120px] truncate hidden sm:inline">
            {name || email.split("@")[0]}
          </span>
          <form action="/api/auth/logout" method="post" className="hidden sm:block">
            <input type="hidden" name="next" value="/agent/login" />
            <button
              type="submit"
              className="text-xs text-slate-500 hover:text-slate-800 ml-1"
            >
              退出
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
