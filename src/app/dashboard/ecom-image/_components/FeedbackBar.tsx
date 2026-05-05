"use client";

/**
 * 节点底部"有其他想法？"反馈输入条
 *
 *   [ 输入您的反馈让 AI 重新分析… ]   [ Retry ↻ ]
 *
 * 行为：用户写完文字点 Retry → 调用 onRetry(feedback)，由父组件触发 reject API
 */

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

export interface FeedbackBarProps {
  /** 占位文案，默认"输入您的反馈让 AI 重新生成…" */
  placeholder?: string;
  /** Retry 主标签，默认 "Retry" */
  retryLabel?: string;
  /** 是否可用（节点 running 时禁用） */
  disabled?: boolean;
  onRetry: (feedback: string) => void | Promise<void>;
}

export default function FeedbackBar({
  placeholder = "输入您的反馈让 AI 重新生成…",
  retryLabel = "Retry",
  disabled,
  onRetry,
}: FeedbackBarProps) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRetry() {
    if (!feedback.trim() || busy || disabled) return;
    setBusy(true);
    try {
      await onRetry(feedback.trim());
      setFeedback("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-slate-500">有其他想法？</div>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleRetry();
            }
          }}
          placeholder={placeholder}
          disabled={disabled || busy}
          className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <Button
          variant="outline"
          onClick={handleRetry}
          loading={busy}
          disabled={disabled || !feedback.trim()}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          className="shrink-0"
        >
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
