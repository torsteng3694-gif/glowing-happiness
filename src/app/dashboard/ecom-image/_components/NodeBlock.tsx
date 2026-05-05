"use client";

/**
 * 节点通用外壳
 *
 * 三态视觉：
 *   - running          → 显示 NodeProgressBar（loading + 4 段进度）
 *   - awaiting_review  → 显示 children（节点产物）+ FeedbackBar + 主操作按钮
 *   - confirmed/skipped → 由 SummaryCard 展示，不渲染 NodeBlock
 *
 * 视觉规范：
 *   - 左侧节点状态图标 + 节点轴线（绿/黄/红）
 *   - 右侧主体卡片
 *   - 头部：标题 + 副标题 + 回退按钮
 */

import { type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeStatus } from "@/lib/ecom-image/nodes";

export interface NodeBlockProps {
  status: NodeStatus;
  title: string;
  /** 副标题（如："已为您规划出图类型，请勾选需要的类型"） */
  subtitle?: string;
  /** 节点序号（0-6） */
  nodeIndex: number;
  /** 节点产物主体内容 */
  children: ReactNode;
  /** 是否允许回退到上一节点（节点 0 = 不允许） */
  canRollback?: boolean;
  /** 点击回退回调 */
  onRollback?: () => void;
  /** 底部固定操作区（FeedbackBar + 主按钮等），由调用方组装 */
  footer?: ReactNode;
  /** 错误态附加信息 */
  errorMessage?: string | null;
  /** 是否是节点流的最后一个（true 时不画下方延伸虚线） */
  isLast?: boolean;
}

const STATUS_ICON_MAP: Record<NodeStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pending: { icon: Loader2, color: "text-slate-400", label: "待启动" },
  running: { icon: Loader2, color: "text-amber-500 animate-spin", label: "进行中" },
  awaiting_review: { icon: AlertCircle, color: "text-amber-500", label: "待确认" },
  confirmed: { icon: CheckCircle2, color: "text-emerald-500", label: "已确认" },
  rejected: { icon: RotateCcw, color: "text-rose-500", label: "已驳回" },
  skipped: { icon: XCircle, color: "text-slate-400", label: "已跳过" },
  failed: { icon: XCircle, color: "text-rose-500", label: "失败" },
};

export default function NodeBlock({
  status,
  title,
  subtitle,
  nodeIndex,
  children,
  canRollback = true,
  onRollback,
  footer,
  errorMessage,
  isLast,
}: NodeBlockProps) {
  const statusInfo = STATUS_ICON_MAP[status];
  const StatusIcon = statusInfo.icon;

  return (
    <section className="relative pl-12 animate-fade-in">
      {/* 左侧节点轴线 + 状态圆 */}
      <div className="absolute left-3 top-1.5">
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center bg-white border-2",
            status === "confirmed" && "border-emerald-500",
            status === "skipped" && "border-slate-300",
            (status === "running" || status === "awaiting_review") && "border-amber-400",
            status === "failed" || status === "rejected" ? "border-rose-400" : "",
            status === "pending" && "border-slate-200",
          )}
        >
          <StatusIcon className={cn("w-3.5 h-3.5", statusInfo.color)} />
        </div>
      </div>
      {!isLast && <div className="absolute left-[1.4rem] top-9 bottom-0 w-px bg-slate-200" aria-hidden />}

      {/* 主体卡 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* 头部 */}
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
              <span className="font-mono">{String(nodeIndex + 1).padStart(2, "0")}</span>
              <span className="text-slate-300">·</span>
              <span>{statusInfo.label}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && (
              <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{subtitle}</p>
            )}
          </div>
          {canRollback && onRollback && (
            <button
              onClick={onRollback}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              回退
            </button>
          )}
        </header>

        {/* 错误提示条 */}
        {errorMessage && (
          <div className="px-5 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 主体内容 */}
        <div className="p-5">{children}</div>

        {/* 底部操作区（feedback + 主按钮等） */}
        {footer && <footer className="border-t border-slate-100 p-5 bg-slate-50/50">{footer}</footer>}
      </div>
    </section>
  );
}
