"use client";

/**
 * 点击就地变 textarea 的可编辑文本
 *
 *   显示态：纯文本 + 悬停时右侧出现"编辑"小图标
 *   编辑态：textarea + 保存/取消 按钮（或失焦自动保存，可配）
 *
 * 用法：
 *   <InlineEditableText value={item.title} onSave={(v) => api.update(id, { title: v })} />
 */

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InlineEditableTextProps {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  /** "input" 单行 / "textarea" 多行 */
  multiline?: boolean;
  /** 占位文案 */
  placeholder?: string;
  /** 显示态 className */
  displayClassName?: string;
  /** 编辑态 className */
  editClassName?: string;
  /** 失焦自动保存（默认 false：必须点保存） */
  saveOnBlur?: boolean;
  /** 禁用编辑 */
  disabled?: boolean;
}

export default function InlineEditableText({
  value,
  onSave,
  multiline = false,
  placeholder,
  displayClassName,
  editClassName,
  saveOnBlur = false,
  disabled,
}: InlineEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleSave() {
    if (busy) return;
    if (draft === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    const SharedProps = {
      ref: inputRef as never,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: saveOnBlur ? handleSave : undefined,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") handleCancel();
        else if (e.key === "Enter" && !multiline && !e.shiftKey) {
          e.preventDefault();
          handleSave();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          handleSave();
        }
      },
      placeholder,
      disabled: busy,
      className: cn(
        "w-full px-2.5 py-1.5 rounded-md border border-amber-400 text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-400/40",
        multiline && "resize-y min-h-[80px]",
        editClassName,
      ),
    };

    return (
      <div className="flex items-start gap-1.5 w-full">
        <div className="flex-1 min-w-0">
          {multiline ? <textarea {...SharedProps} /> : <input type="text" {...SharedProps} />}
        </div>
        {!saveOnBlur && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleSave}
              disabled={busy}
              className="p-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
              title="保存 (Enter)"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCancel}
              disabled={busy}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-60"
              title="取消 (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-1 w-full rounded-md px-1 -mx-1 transition-colors",
        !disabled && "hover:bg-slate-50 cursor-text",
        displayClassName,
      )}
      onClick={() => !disabled && setEditing(true)}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      <span className={cn("flex-1 min-w-0", !value && "text-slate-400 italic")}>
        {value || placeholder || "（点击编辑）"}
      </span>
      {!disabled && (
        <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 mt-1 shrink-0 transition-opacity" />
      )}
    </div>
  );
}
