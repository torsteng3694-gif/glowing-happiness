"use client";

/**
 * 单张"出图类型"卡（节点 01 用）
 *
 *   - 顶部：优先级 chip + 场景 chip + 评级徽章
 *   - 标题 + 描述
 *   - AI 推荐理由（黄色感叹号说明条）
 *   - 平台 chips
 *   - 一句话价值定位
 *   - 右上：勾选框
 */

import { Check, Info, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { NodeActionMenu } from "..";
import type { ImageTypeView } from "@/lib/ecom-image/snapshot";

export interface ImageTypeCardProps {
  type: ImageTypeView;
  onToggle: (selected: boolean) => void;
  onDelete?: () => void;
  disabled?: boolean;
}

const RATING_LABEL: Record<string, { label: string; cls: string }> = {
  win: { label: "赢", cls: "bg-rose-500 text-white" },
  mid: { label: "中", cls: "bg-slate-400 text-white" },
  low: { label: "低", cls: "bg-slate-200 text-slate-500" },
};

export default function ImageTypeCard({ type, onToggle, onDelete, disabled }: ImageTypeCardProps) {
  const rating = type.rating ? RATING_LABEL[type.rating] : null;

  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 bg-white transition-all",
        type.selected
          ? "border-brand-300 shadow-sm ring-1 ring-brand-200"
          : "border-slate-200 hover:border-slate-300",
        disabled && "opacity-60",
      )}
    >
      {/* 右上：勾选框 + 操作菜单 */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {onDelete && (
          <NodeActionMenu
            items={[
              { label: "删除此类型", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: onDelete, danger: true },
            ]}
          />
        )}
        <button
          onClick={() => !disabled && onToggle(!type.selected)}
          disabled={disabled}
          className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
            type.selected
              ? "bg-brand-500 border-brand-500 text-white"
              : "bg-white border-slate-300 hover:border-brand-300",
          )}
          aria-pressed={type.selected}
          aria-label={type.selected ? "取消选择" : "选择"}
        >
          {type.selected && <Check className="w-3 h-3" />}
        </button>
      </div>

      {/* 顶部 chips */}
      <div className="flex items-center flex-wrap gap-1.5 mb-2 pr-16">
        {type.priorityTags.map((t) => (
          <Badge key={t} color="rose">
            {t}
          </Badge>
        ))}
        {type.sceneTags.map((t) => (
          <Badge key={t} color="violet">
            {t}
          </Badge>
        ))}
      </div>

      {/* 标题 */}
      <h3 className="font-semibold text-slate-900 mb-1.5 pr-12">{type.name}</h3>

      {/* 描述 */}
      {type.description && (
        <p className="text-xs text-slate-600 leading-relaxed mb-3 line-clamp-3">
          {type.description}
        </p>
      )}

      {/* AI 推荐理由 */}
      {type.reasoning && (
        <div className="text-xs text-amber-700 bg-amber-50/80 border border-amber-100 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5 mb-3">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="leading-relaxed">{type.reasoning}</span>
        </div>
      )}

      {/* 底部行 */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-wrap gap-1 min-w-0">
          {type.platforms.slice(0, 3).map((p) => (
            <Badge key={p} color="green" className="text-[10px] py-0">
              {p}
            </Badge>
          ))}
          {type.platforms.length > 3 && (
            <Badge color="slate" className="text-[10px] py-0">
              +{type.platforms.length - 3}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {type.valueChip && (
            <span className="text-[10px] text-slate-500">{type.valueChip}</span>
          )}
          {rating && (
            <span
              className={cn(
                "inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold",
                rating.cls,
              )}
            >
              {rating.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
