"use client";

/**
 * 已确认 / 已跳过节点的折叠卡
 *
 * 视觉：左侧绿色 ✓（或灰色 ✗）+ 紧凑卡片（标题 + 元信息 chips + 缩略产物）
 * 行为：点击整张卡可展开（onExpand）；阶段 0 暂不实现展开，预留 prop。
 */

import { type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SummaryCardProps {
  /** 节点序号 */
  nodeIndex: number;
  /** 节点状态：confirmed / skipped */
  variant: "confirmed" | "skipped";
  /** 顶部状态标题（如"已选择出图类型"） */
  statusTitle: string;
  /** 卡片内主标题（如"出图类型方案"） */
  cardTitle: string;
  /** 元信息 chips：[{ icon, label }, ...] */
  metaChips?: Array<{ icon?: ReactNode; label: string }>;
  /** 缩略产物（横向小卡 / 文本） */
  thumbnails?: ReactNode;
  /** 点击展开重看（阶段 0 可不传） */
  onExpand?: () => void;
  /** 是否是节点流的最后一个（true 时不画下方延伸虚线） */
  isLast?: boolean;
}

export default function SummaryCard({
  nodeIndex,
  variant,
  statusTitle,
  cardTitle,
  metaChips,
  thumbnails,
  onExpand,
  isLast,
}: SummaryCardProps) {
  const isSkipped = variant === "skipped";

  return (
    <section className="relative pl-12 animate-fade-in">
      {/* 左侧节点轴线 + 状态圆 */}
      <div className="absolute left-3 top-1.5">
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center border-2 bg-white",
            isSkipped ? "border-slate-300" : "border-emerald-500",
          )}
        >
          {isSkipped ? (
            <X className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          )}
        </div>
      </div>
      {!isLast && (
        <div className="absolute left-[1.4rem] top-9 bottom-0 w-px bg-emerald-200/60" aria-hidden />
      )}

      <div className="mb-1.5 text-sm font-medium text-slate-700">{statusTitle}</div>

      <button
        type="button"
        onClick={onExpand}
        disabled={!onExpand}
        className={cn(
          "w-full text-left rounded-xl border bg-white px-4 py-3 transition-colors",
          isSkipped
            ? "border-slate-200 hover:border-slate-300"
            : "border-emerald-200/70 hover:border-emerald-300",
          onExpand ? "cursor-pointer" : "cursor-default",
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded font-medium",
                isSkipped ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700",
              )}
            >
              {isSkipped ? "✗ 已跳过" : "✓ 已确认"}
            </span>
            <span className="font-medium text-slate-800 truncate">{cardTitle}</span>
          </div>
          {onExpand && <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
        </div>

        {metaChips && metaChips.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 mb-2">
            {metaChips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {c.icon}
                {c.label}
              </span>
            ))}
          </div>
        )}

        {thumbnails && <div className="flex items-stretch gap-2 overflow-x-auto pb-0.5">{thumbnails}</div>}
      </button>
    </section>
  );
}
