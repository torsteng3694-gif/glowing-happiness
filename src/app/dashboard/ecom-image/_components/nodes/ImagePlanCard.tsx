"use client";

/**
 * 节点 05（旧 04）· 单张图规划卡
 *
 *   序号徽章 + 标题（可编辑）
 *   描述（可编辑）
 *   宽高比选择
 *   ★ 垫图（图生图基础）：缩略 + 点击切换启用/禁用
 *   右上 ⋯ 菜单：AI 重写 / 删除
 */

import { Image as ImageIcon, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AspectRatioSelector, InlineEditableText, NodeActionMenu, RegenerateDialog } from "..";
import type { ImagePlanView, PlanActions, SourceImageView } from "./types";

export interface ImagePlanCardProps {
  plan: ImagePlanView;
  /** 项目所有可作垫图的源图（节点 03 已分析的），用于显示/切换 */
  sourceImages: SourceImageView[];
  actions: PlanActions;
  disabled?: boolean;
}

export default function ImagePlanCard({ plan, sourceImages, actions, disabled }: ImagePlanCardProps) {
  // 当前 plan 启用的源图 id 集合（仅取 type=source 的）
  const activeSourceIds = new Set(
    plan.referenceIds.filter((r) => r.type === "source").map((r) => r.id),
  );

  function toggleRef(sourceId: string) {
    const next = activeSourceIds.has(sourceId)
      ? plan.referenceIds.filter((r) => !(r.type === "source" && r.id === sourceId))
      : [...plan.referenceIds, { type: "source" as const, id: sourceId }];
    actions.onPatchPlan(plan.id, { referenceIds: next });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 hover:border-slate-300 transition-colors">
      {/* 顶部：序号 + 标题 + ⋯ */}
      <div className="flex items-start gap-2 mb-2">
        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-100 text-amber-700 text-xs font-bold">
          {plan.idx}
        </span>
        <div className="flex-1 min-w-0">
          <InlineEditableText
            value={plan.title}
            onSave={(next) => actions.onPatchPlan(plan.id, { title: next })}
            placeholder="规划标题"
            displayClassName="text-sm font-medium text-slate-800 block"
            disabled={disabled}
          />
        </div>
        <NodeActionMenu
          items={[
            {
              label: "删除",
              icon: <Trash2 className="w-3.5 h-3.5" />,
              onClick: () => actions.onDeletePlan(plan.id),
              danger: true,
              disabled,
            },
          ]}
        />
      </div>

      {/* 描述 */}
      <div className="mb-3">
        <InlineEditableText
          value={plan.description}
          onSave={(next) => actions.onPatchPlan(plan.id, { description: next })}
          multiline
          placeholder="画面描述"
          displayClassName="text-xs text-slate-600 leading-relaxed block"
          disabled={disabled}
        />
      </div>

      {/* 宽高比 */}
      <div className="mb-2">
        <AspectRatioSelector
          value={plan.aspectRatio}
          onChange={(v) => actions.onPatchPlan(plan.id, { aspectRatio: v })}
          disabled={disabled}
          compact
        />
      </div>

      {/* ★ 垫图（图生图基础）—— 点击切换启用 */}
      {sourceImages.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-1">
            <ImageIcon className="w-3 h-3" />
            垫图（{activeSourceIds.size}/{sourceImages.length}）
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {sourceImages.map((src) => {
              const active = activeSourceIds.has(src.id);
              return (
                <button
                  key={src.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleRef(src.id)}
                  className={cn(
                    "shrink-0 w-10 h-10 rounded border-2 overflow-hidden transition-all relative",
                    active
                      ? "border-amber-500 ring-1 ring-amber-200"
                      : "border-slate-200 opacity-50 hover:opacity-80",
                  )}
                  title={active ? `点击禁用：${src.title ?? "未命名"}` : `点击启用：${src.title ?? "未命名"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src.url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = "0.2";
                    }}
                  />
                  {active && (
                    <div className="absolute inset-0 bg-amber-500/10 flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full bg-amber-500 text-white text-[8px] flex items-center justify-center">✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI 重写按钮 */}
      <div className="flex items-center justify-end">
        <RegenerateDialog
          title="重写这张规划"
          placeholder="例如：换成 45° 视角；突出柜机底部细节…"
          onSubmit={(feedback) => actions.onRewritePlan(plan.id, feedback)}
        >
          <button
            disabled={disabled}
            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium disabled:opacity-50 px-2 py-1 rounded-md hover:bg-amber-50"
          >
            <Sparkles className="w-3 h-3" />
            AI 重写
          </button>
        </RegenerateDialog>
      </div>
    </div>
  );
}
