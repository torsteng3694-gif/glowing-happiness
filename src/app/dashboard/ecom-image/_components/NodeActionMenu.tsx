"use client";

/**
 * 卡片右上角 ⋯ 下拉菜单
 *
 * 用法：
 *   <NodeActionMenu items={[
 *     { label: "AI 重写", icon: <Sparkles/>, onClick: openRegen, danger: false },
 *     { label: "编辑", icon: <Pencil/>, onClick: enterEdit },
 *     { label: "删除", icon: <Trash2/>, onClick: del, danger: true },
 *   ]} />
 */

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NodeActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface NodeActionMenuProps {
  items: NodeActionMenuItem[];
  /** 触发器额外 className */
  triggerClassName?: string;
  /** 触发器尺寸（默认 sm） */
  size?: "sm" | "md";
}

export default function NodeActionMenu({ items, triggerClassName, size = "sm" }: NodeActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors",
          size === "sm" && "p-1",
          size === "md" && "p-1.5",
          triggerClassName,
        )}
      >
        <MoreHorizontal className={cn(size === "sm" ? "w-4 h-4" : "w-5 h-5")} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 min-w-[160px] rounded-lg border border-slate-200 bg-white shadow-md py-1 animate-fade-in">
          {items.map((item, i) => (
            <button
              key={i}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                "w-full px-3 py-1.5 text-sm flex items-center gap-2 transition-colors",
                item.danger
                  ? "text-rose-600 hover:bg-rose-50"
                  : "text-slate-700 hover:bg-slate-50",
                item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
              )}
            >
              {item.icon && <span className="shrink-0 text-current">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
