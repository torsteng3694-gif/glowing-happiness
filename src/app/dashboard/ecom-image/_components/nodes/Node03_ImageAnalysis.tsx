"use client";

/**
 * 节点 03 · 图片内容分析
 *
 * 渲染 source images 网格；每张图独立 AI 重生 + 编辑。
 * 顶部"+ 追加图片"阶段 0 为占位（不实现实际上传）。
 */

import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { FeedbackBar, NodeBlock } from "..";
import SourceImageCard from "./SourceImageCard";
import type { NodeComponentProps, SourceImageActions } from "./types";

interface Node03Props extends NodeComponentProps {
  sourceImageActions: SourceImageActions;
}

export default function Node03_ImageAnalysis({
  node,
  snapshot,
  actions,
  sourceImageActions,
  busy,
  isLast,
}: Node03Props) {
  const images = snapshot.sourceImages;
  const analyzing = images.filter((i) => i.analyzeStatus === "running").length;
  const done = images.filter((i) => i.analyzeStatus === "done").length;
  const total = images.length;

  return (
    <NodeBlock
      status={node.status}
      title={node.meta.title}
      subtitle={
        analyzing > 0
          ? `正在并发分析 ${total} 张图片 (${done}/${total})`
          : `每张图已独立解析，可微调标题与描述`
      }
      nodeIndex={node.index}
      onRollback={actions.onRollback}
      canRollback={node.index > 0}
      errorMessage={node.errorMessage}
      isLast={isLast}
      footer={
        node.status === "awaiting_review" || node.status === "rejected" ? (
          <div className="flex flex-col gap-3">
            <FeedbackBar
              placeholder="想让 AI 整体重新解析所有图片？写一句意见…"
              onRetry={actions.onReject}
              disabled={busy}
            />
            <div className="flex items-center justify-end">
              <Button variant="primary" onClick={actions.onConfirm} disabled={busy}>
                {node.meta.confirmCtaLabel} →
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {images.map((img) => (
          <SourceImageCard key={img.id} image={img} actions={sourceImageActions} disabled={busy} />
        ))}
        {/* 追加图片占位 */}
        <button
          disabled
          className="rounded-xl border-2 border-dashed border-slate-200 aspect-square flex flex-col items-center justify-center gap-1 text-slate-400 hover:bg-slate-50 transition-colors opacity-60 cursor-not-allowed"
        >
          <Plus className="w-6 h-6" />
          <span className="text-xs">追加图片（即将上线）</span>
        </button>
      </div>
    </NodeBlock>
  );
}
