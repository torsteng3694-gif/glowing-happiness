"use client";

/**
 * 4 段子阶段进度条 + fancy loading 文案
 *
 * 每个节点的子阶段标签来自 NODE_META.runStages（4 个）。
 * currentStage 字符串匹配其中一个；走到该段时它高亮，前面的都置 done。
 */

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NodeProgressBarProps {
  /** 4 段标签，例如 ["调度","识别","构建","完成"] */
  stages: [string, string, string, string];
  /** 当前正在的子阶段标签（必须是 stages 中之一）；null 表示未启动 */
  currentStage?: string | null;
  /** loading 文案，例："正在唤醒 AI 创作引擎…" */
  text?: string;
}

export default function NodeProgressBar({ stages, currentStage, text }: NodeProgressBarProps) {
  const currentIdx = currentStage ? stages.indexOf(currentStage) : -1;

  return (
    <div className="flex flex-col items-stretch py-6">
      {/* 顶部 loading 文案 */}
      <div className="flex items-center justify-center gap-2 text-sm text-amber-600 mb-5">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{text ?? "AI 正在思考…"}</span>
      </div>

      {/* 4 段进度 */}
      <div className="relative flex items-center justify-between max-w-2xl mx-auto w-full px-4">
        {/* 背景轴线 */}
        <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200" aria-hidden />
        {/* 已完成轴线 */}
        {currentIdx > 0 && (
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-500 transition-[width] duration-500"
            style={{ width: `calc(${(currentIdx / (stages.length - 1)) * 100}% - ${currentIdx === stages.length - 1 ? "1rem" : "0px"})` }}
            aria-hidden
          />
        )}

        {stages.map((label, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={label} className="relative flex flex-col items-center gap-2 z-10">
              <div
                className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 bg-white transition-colors",
                  isDone && "border-emerald-500 bg-emerald-500",
                  isCurrent && "border-amber-500 ring-4 ring-amber-200/50",
                  !isDone && !isCurrent && "border-slate-300",
                )}
              />
              <span
                className={cn(
                  "text-xs font-medium",
                  isDone && "text-emerald-600",
                  isCurrent && "text-amber-600",
                  !isDone && !isCurrent && "text-slate-400",
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
