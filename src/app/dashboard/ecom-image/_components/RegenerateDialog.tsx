"use client";

/**
 * AI 重写带反馈的对话框（中央 modal 形式）
 *
 *   trigger：任意按钮（"AI 重写"、"重新分析"等）
 *   modal 内容：textarea + 提交/取消，居中遮罩，避免在窄卡片里溢出
 *
 * 用法：
 *   <RegenerateDialog
 *     title="重写这张分析"
 *     placeholder="重点写颜色、材质..."
 *     onSubmit={(feedback) => api.reanalyzeImage(id, feedback)}
 *   >
 *     <Button>AI 重新分析</Button>
 *   </RegenerateDialog>
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RegenerateDialogProps {
  /** modal 标题 */
  title?: string;
  placeholder?: string;
  submitLabel?: string;
  /** 是否允许空反馈直接提交（默认 false） */
  allowEmpty?: boolean;
  /** 提交回调；返回 Promise 时显示 loading */
  onSubmit: (feedback: string) => void | Promise<void>;
  /** trigger 元素（按钮 / icon 等） */
  children: React.ReactNode;
  /** trigger 容器额外 className */
  triggerClassName?: string;
}

export default function RegenerateDialog({
  title = "AI 重写",
  placeholder = "可以描述具体想要的方向，例如：风格更简洁、颜色更暖、突出科技感…",
  submitLabel = "重新生成",
  allowEmpty = false,
  onSubmit,
  children,
  triggerClassName,
}: RegenerateDialogProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Esc 关闭 + 锁定 body 滚动
  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy]);

  async function handleSubmit() {
    if (busy) return;
    if (!allowEmpty && !feedback.trim()) return;
    setBusy(true);
    try {
      await onSubmit(feedback.trim());
      setFeedback("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={cn("inline-block", triggerClassName)} onClick={() => setOpen(true)}>
        {children}
      </div>
      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
            onMouseDown={(e) => {
              // 点击遮罩关闭（仅当点击在最外层 div 本体时）
              if (e.target === e.currentTarget && !busy) setOpen(false);
            }}
          >
            {/* 遮罩 */}
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" aria-hidden />
            {/* 内容 */}
            <div
              className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="regen-dialog-title"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div
                  id="regen-dialog-title"
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-800"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  {title}
                </div>
                <button
                  onClick={() => !busy && setOpen(false)}
                  disabled={busy}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                  aria-label="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <textarea
                  autoFocus
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  rows={4}
                  placeholder={placeholder}
                  disabled={busy}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 placeholder:text-slate-400 resize-none disabled:bg-slate-50"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-400">⌘/Ctrl + Enter 提交</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => !busy && setOpen(false)}
                      disabled={busy}
                      className="px-3 h-9 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={busy || (!allowEmpty && !feedback.trim())}
                      className="px-4 h-9 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {busy ? "生成中…" : submitLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
