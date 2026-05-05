"use client";

/**
 * 节点 03 · 单张商品图分析卡
 *
 *   - 顶部：原图 + 右上 ✓ / loading
 *   - 标题（可编辑）+ 详细描述（可编辑）
 *   - 底部：AI 重新分析（带反馈 popover）+ 不分析这张
 */

import { Check, EyeOff, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { InlineEditableText, RegenerateDialog } from "..";
import type { SourceImageActions, SourceImageView } from "./types";

export interface SourceImageCardProps {
  image: SourceImageView;
  actions: SourceImageActions;
  disabled?: boolean;
}

export default function SourceImageCard({ image, actions, disabled }: SourceImageCardProps) {
  const isExcluded = image.analyzeStatus === "excluded";
  const isRunning = image.analyzeStatus === "running";
  const isFailed = image.analyzeStatus === "failed";
  const isDone = image.analyzeStatus === "done";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white overflow-hidden transition-all",
        isExcluded && "opacity-50 border-slate-200",
        !isExcluded && "border-slate-200",
      )}
    >
      {/* 图片预览 */}
      <div className="relative aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.title ?? image.filename ?? "商品图"}
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
        {/* 状态徽标 */}
        <div className="absolute top-2 right-2">
          {isDone && (
            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          {isRunning && (
            <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            </div>
          )}
          {isExcluded && (
            <div className="w-6 h-6 rounded-full bg-slate-400 flex items-center justify-center">
              <EyeOff className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* 字段 */}
      <div className="p-3 space-y-3 min-w-0">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">标题</div>
          <InlineEditableText
            value={image.title ?? ""}
            onSave={(next) => actions.onPatch(image.id, { title: next })}
            placeholder="（点击补充标题）"
            displayClassName="text-sm font-medium text-slate-800 leading-snug break-words"
            disabled={disabled || isRunning || isExcluded}
          />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">详细描述</div>
          <InlineEditableText
            value={image.description ?? ""}
            onSave={(next) => actions.onPatch(image.id, { description: next })}
            multiline
            placeholder="（点击补充描述）"
            displayClassName="text-xs text-slate-600 leading-relaxed break-words whitespace-pre-wrap max-h-40 overflow-y-auto"
            disabled={disabled || isRunning || isExcluded}
          />
        </div>
      </div>

      {/* 操作行 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50/50">
        <RegenerateDialog
          title="重新分析这张"
          placeholder="例如：重点写颜色和接口；忽略背景；用更专业的语气…"
          onSubmit={(feedback) => actions.onReanalyze(image.id, feedback)}
        >
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
            disabled={disabled || isRunning || isExcluded}
            className="!whitespace-nowrap"
          >
            AI 重新分析
          </Button>
        </RegenerateDialog>
        <button
          onClick={() => actions.onToggleExclude(image.id, !isExcluded)}
          disabled={disabled || isRunning}
          className="shrink-0 whitespace-nowrap text-xs text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
        >
          {isExcluded ? "恢复分析" : "不分析这张"}
        </button>
      </div>

      {isFailed && image.analyzeError && (
        <div className="px-3 py-1.5 bg-rose-50 text-xs text-rose-700 border-t border-rose-100">
          {image.analyzeError}
        </div>
      )}
    </div>
  );
}
