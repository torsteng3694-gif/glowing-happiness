"use client";

/**
 * 节点 04 · 单分类组卡（一个 ImageType + 它的 plans）
 *
 *   - 顶部：分类名 + 优先级 + 元 chips + 张数
 *   - 分类策略文案（statement / 思路 / 配色 / 光线 / 构图）
 *   - 图片规划网格（3 列）
 *   - 底部：AI 添加 / 手动添加 按钮
 */

import { Plus, Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import ImagePlanCard from "./ImagePlanCard";
import type { ImagePlanView, ImageTypeView, PlanActions, SourceImageView } from "./types";

export interface PlanGroupCardProps {
  imageType: ImageTypeView;
  plans: ImagePlanView[];
  /** 项目的可用源图，用于每个 plan 的垫图选择器 */
  sourceImages: SourceImageView[];
  actions: PlanActions;
  disabled?: boolean;
}

export default function PlanGroupCard({ imageType, plans, sourceImages, actions, disabled }: PlanGroupCardProps) {
  const strategy = imageType.strategy as
    | { summary?: string; thinking?: string; colorPlan?: string; lighting?: string; composition?: string }
    | null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* 头部 */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="font-semibold text-slate-900 text-base">{imageType.name}</h3>
          <div className="flex items-center gap-1.5">
            {imageType.priorityTags.map((t) => (
              <Badge key={t} color="rose">
                {t}
              </Badge>
            ))}
            {imageType.rating === "win" && (
              <Badge color="rose" className="!bg-rose-500 !text-white">
                高优先级
              </Badge>
            )}
          </div>
        </div>
        {imageType.description && (
          <p className="text-xs text-slate-600 leading-relaxed mb-2">{imageType.description}</p>
        )}
        <div className="flex items-center flex-wrap gap-1.5">
          {imageType.valueChip && (
            <Badge color="amber" className="!text-[10px]">
              🎯 {imageType.valueChip}
            </Badge>
          )}
          {imageType.platforms.slice(0, 4).map((p) => (
            <Badge key={p} color="green" className="!text-[10px]">
              {p}
            </Badge>
          ))}
          {imageType.platforms.length > 4 && (
            <Badge color="slate" className="!text-[10px]">
              +{imageType.platforms.length - 4}
            </Badge>
          )}
          {imageType.sceneTags.map((t) => (
            <Badge key={t} color="violet" className="!text-[10px]">
              {t}
            </Badge>
          ))}
          <Badge color="brand" className="!text-[10px] ml-auto">
            📷 {plans.length} 张
          </Badge>
        </div>
      </div>

      {/* 策略文案 */}
      {strategy && (strategy.summary || strategy.thinking) && (
        <div className="px-5 py-3 bg-amber-50/30 border-b border-slate-100">
          <div className="text-xs font-medium text-slate-500 mb-1.5">📄 方案文案</div>
          {strategy.summary && (
            <p className="text-sm text-slate-700 mb-2 leading-relaxed">{strategy.summary}</p>
          )}
          <div className="space-y-1 text-xs text-slate-600">
            {strategy.thinking && (
              <div>
                <span className="text-amber-600 font-medium">展示思路：</span>
                {strategy.thinking}
              </div>
            )}
            {strategy.colorPlan && (
              <div>
                <span className="text-amber-600 font-medium">配色方案：</span>
                {strategy.colorPlan}
              </div>
            )}
            {strategy.lighting && (
              <div>
                <span className="text-amber-600 font-medium">光线建议：</span>
                {strategy.lighting}
              </div>
            )}
            {strategy.composition && (
              <div>
                <span className="text-amber-600 font-medium">构图风格：</span>
                {strategy.composition}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 图片规划网格 */}
      <div className="p-4">
        <div className="text-xs font-medium text-slate-500 mb-2">
          📷 图片规划 <span className="text-brand-600">{plans.length} 张</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {plans.map((p) => (
            <ImagePlanCard
              key={p.id}
              plan={p}
              sourceImages={sourceImages}
              actions={actions}
              disabled={disabled}
            />
          ))}
        </div>

        {/* 底部加图按钮 */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
            onClick={() => actions.onAddPlan(imageType.id, "ai_added")}
            disabled={disabled}
          >
            AI 添加图片规划
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => actions.onAddPlan(imageType.id, "manual")}
            disabled={disabled}
          >
            手动添加
          </Button>
        </div>
      </div>
    </div>
  );
}
