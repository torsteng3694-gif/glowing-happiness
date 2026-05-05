import Link from "next/link";
import { ExternalLink } from "lucide-react";
import AgentCenterNav from "@/components/agent-center/AgentCenterNav";

/**
 * 管理后台内嵌「代理商中心」：左侧分组导航 + 右侧内容（对齐常见代理后台结构）。
 */
export default function AdminAgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">代理商中心</h1>
          <p className="text-sm text-slate-500 mt-1">
            预览代理端界面；当前登录账号即数据主体（佣金、下级与您账号绑定）。
          </p>
        </div>
        <Link
          href="/agent/dashboard"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-sky-600 hover:text-sky-800"
        >
          <ExternalLink className="w-4 h-4" />
          独立代理后台（新窗口）
        </Link>
      </div>

      <div className="flex gap-6 items-start">
        <AgentCenterNav variant="light" mode="admin" />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

