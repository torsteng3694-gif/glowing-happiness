"use client";

/**
 * 顶部用户初始消息气泡
 *
 *   - 右上：商品图缩略 chip + N 张图片缩略
 *   - 中部：长文本（默认折叠 3 行 + "展开全部" / "复制"）
 */

import { useState } from "react";
import { ChevronDown, Copy, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UserBubbleProps {
  text: string;
  imageUrls: string[];
}

export default function UserBubble({ text, imageUrls }: UserBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="ml-auto max-w-[680px] rounded-2xl bg-amber-50/60 border border-amber-200/50 shadow-sm p-4">
      {/* 顶部商品图缩略 */}
      {imageUrls.length > 0 && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <ImageIcon className="w-3.5 h-3.5" />
            商品图 {imageUrls.length}
          </span>
          <div className="flex items-center gap-1.5">
            {imageUrls.slice(0, 6).map((url, i) => (
              <div
                key={i}
                className="w-9 h-9 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`product-${i + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // 占位
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ))}
            {imageUrls.length > 6 && (
              <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-500 flex items-center justify-center">
                +{imageUrls.length - 6}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 文本 */}
      <div
        className={cn(
          "text-sm text-slate-700 whitespace-pre-wrap leading-relaxed",
          !expanded && "line-clamp-6",
        )}
      >
        {text}
      </div>

      {/* 操作行 */}
      <div className="flex items-center justify-between gap-3 mt-2">
        {text.length > 180 ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-0.5 text-xs text-amber-700 hover:text-amber-900 font-medium"
          >
            {expanded ? "收起" : "展开全部"}
            <ChevronDown
              className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")}
            />
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <Copy className="w-3.5 h-3.5" />
          {copied ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}
