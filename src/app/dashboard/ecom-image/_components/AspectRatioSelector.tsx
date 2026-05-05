"use client";

/**
 * 宽高比选择器
 *
 *   预设按钮：1:1 / 3:4 / 4:3 / 16:9 / 9:16
 *   + 自定义按钮 → 弹出输入框（如 "1080:720"）
 *
 * 值是自由字符串，对外不限制枚举。
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const ASPECT_RATIO_PRESETS = ["1:1", "3:4", "4:3", "16:9", "9:16"] as const;

export interface AspectRatioSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** 紧凑模式（小一号） */
  compact?: boolean;
}

export default function AspectRatioSelector({
  value,
  onChange,
  disabled,
  compact,
}: AspectRatioSelectorProps) {
  const [customMode, setCustomMode] = useState(false);
  const [custom, setCustom] = useState("");

  const isPreset = ASPECT_RATIO_PRESETS.includes(value as (typeof ASPECT_RATIO_PRESETS)[number]);

  const buttonBase = cn(
    "shrink-0 rounded-md border font-medium transition-colors whitespace-nowrap",
    compact ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-sm",
    disabled && "opacity-50 cursor-not-allowed",
  );

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto -mx-0.5 px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ASPECT_RATIO_PRESETS.map((preset) => (
        <button
          key={preset}
          disabled={disabled}
          onClick={() => onChange(preset)}
          className={cn(
            buttonBase,
            value === preset
              ? "bg-brand-50 border-brand-300 text-brand-700"
              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
          )}
        >
          {preset}
        </button>
      ))}

      {/* 非预设值：显示当前自定义值 */}
      {!isPreset && (
        <button
          onClick={() => onChange(value)}
          className={cn(
            buttonBase,
            "bg-amber-50 border-amber-300 text-amber-700",
          )}
        >
          {value}
        </button>
      )}

      {!customMode ? (
        <button
          disabled={disabled}
          onClick={() => setCustomMode(true)}
          className={cn(buttonBase, "bg-white border-dashed border-slate-300 text-slate-500 hover:border-slate-400")}
          title="自定义比例"
        >
          <Plus className={cn(compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
        </button>
      ) : (
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.includes(":")) {
                onChange(custom);
                setCustom("");
                setCustomMode(false);
              } else if (e.key === "Escape") {
                setCustom("");
                setCustomMode(false);
              }
            }}
            placeholder="1080:720"
            className={cn(
              "rounded-md border border-amber-300 bg-amber-50 px-2 outline-none focus:ring-2 focus:ring-amber-200",
              compact ? "h-7 w-24 text-xs" : "h-8 w-28 text-sm",
            )}
          />
          <button
            onClick={() => {
              setCustom("");
              setCustomMode(false);
            }}
            className="text-slate-400 hover:text-slate-600 text-xs"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}
