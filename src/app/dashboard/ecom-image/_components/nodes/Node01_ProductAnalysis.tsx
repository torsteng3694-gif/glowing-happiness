"use client";

/**
 * 节点 01 · 商品智能分析
 *
 * 产物：商品分析报告（Markdown 长文）+ 出图类型卡片网格（10 张）
 * 用户操作：勾选/取消、删除卡、AI 添加自定义类型（阶段 0 仅勾选）
 */

import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { FeedbackBar, NodeBlock } from "..";
import ImageTypeCard from "./ImageTypeCard";
import type { ImageTypeActions, NodeComponentProps } from "./types";

interface Node01Props extends NodeComponentProps {
  imageTypeActions: ImageTypeActions;
}

export default function Node01_ProductAnalysis({ node, snapshot, actions, imageTypeActions, busy, isLast }: Node01Props) {
  const isRunning = node.status === "running" || node.status === "pending";
  const [autoSelectBusy, setAutoSelectBusy] = useState(false);

  const types = snapshot.imageTypes;
  const selectedCount = types.filter((t) => t.selected).length;
  const totalCount = types.length;

  const reportMd =
    (node.output as { reportMd?: string } | null)?.reportMd ?? "（暂无分析报告）";

  // "智能推荐"：把"必选"和"高转化"的勾上
  async function handleAutoSelect() {
    setAutoSelectBusy(true);
    try {
      for (const t of types) {
        const shouldPick = t.priorityTags.some((tag) => ["必选", "高转化"].includes(tag));
        if (shouldPick !== t.selected) {
          await imageTypeActions.onToggleSelected(t.id, shouldPick);
        }
      }
    } finally {
      setAutoSelectBusy(false);
    }
  }

  return (
    <NodeBlock
      status={node.status}
      title={node.meta.title}
      subtitle={node.meta.doneSubtitle}
      nodeIndex={node.index}
      onRollback={actions.onRollback}
      canRollback={node.index > 0}
      errorMessage={node.errorMessage}
      isLast={isLast}
      footer={
        node.status === "awaiting_review" || node.status === "rejected" ? (
          <div className="flex flex-col gap-3">
            <FeedbackBar
              placeholder="想让 AI 重新分析，例如：'风格改为极简' 或 '突出科技感'…"
              onRetry={actions.onReject}
              disabled={busy}
            />
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                onClick={handleAutoSelect}
                loading={autoSelectBusy}
                disabled={busy}
              >
                智能推荐勾选
              </Button>
              <Button
                variant="primary"
                onClick={actions.onConfirm}
                disabled={busy || selectedCount === 0}
              >
                {node.meta.confirmCtaLabel} →
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {isRunning ? null : (
        <div className="flex flex-col gap-5">
          {/* 商品分析报告 */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <div className="text-xs font-medium text-slate-500 mb-2">商品分析报告</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed prose-sm max-w-none">
              {reportMd}
            </div>
          </div>

          {/* 出图类型网格 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-slate-700">
                选择需要生成的图片类型
              </div>
              <div className="text-xs text-slate-500">
                已选 <span className="font-semibold text-brand-600">{selectedCount}</span> / {totalCount}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {types.map((t) => (
                <ImageTypeCard
                  key={t.id}
                  type={t}
                  onToggle={(s) => imageTypeActions.onToggleSelected(t.id, s)}
                  onDelete={t.origin === "user_custom" ? () => imageTypeActions.onDelete(t.id) : undefined}
                  disabled={busy}
                />
              ))}
              {/* 添加自定义类型占位（阶段 0 不实现） */}
              <button
                disabled
                className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-slate-400 hover:bg-slate-50 transition-colors flex flex-col items-center justify-center gap-1 opacity-60 cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs">添加自定义类型（即将上线）</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </NodeBlock>
  );
}
