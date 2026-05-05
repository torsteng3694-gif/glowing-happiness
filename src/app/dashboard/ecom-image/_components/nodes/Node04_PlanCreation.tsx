"use client";

/**
 * 节点 04 · 出图方案规划
 *
 *   多个 PlanGroupCard 纵向排列，按 imageType 分组渲染。
 *   只展示已 selected 的 imageType。
 */

import { Button } from "@/components/ui";
import { FeedbackBar, NodeBlock } from "..";
import PlanGroupCard from "./PlanGroupCard";
import type { NodeComponentProps, PlanActions } from "./types";

interface Node04Props extends NodeComponentProps {
  planActions: PlanActions;
}

export default function Node04_PlanCreation({ node, snapshot, actions, planActions, busy, isLast }: Node04Props) {
  const selectedTypes = snapshot.imageTypes.filter((t) => t.selected);
  const totalPlans = snapshot.imagePlans.length;

  return (
    <NodeBlock
      status={node.status}
      title={node.meta.title}
      subtitle={`共 ${selectedTypes.length} 个分类，${totalPlans} 张图片`}
      nodeIndex={node.index}
      onRollback={actions.onRollback}
      canRollback={node.index > 0}
      errorMessage={node.errorMessage}
      isLast={isLast}
      footer={
        node.status === "awaiting_review" || node.status === "rejected" ? (
          <div className="flex flex-col gap-3">
            <FeedbackBar
              placeholder="对整体方案有意见？例如：'减少海报数量' 或 '主图风格改为偏酷感'…"
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
      <div className="flex flex-col gap-4">
        {selectedTypes.map((t) => {
          const plans = snapshot.imagePlans.filter((p) => p.imageTypeId === t.id);
          return (
            <PlanGroupCard
              key={t.id}
              imageType={t}
              plans={plans}
              sourceImages={snapshot.sourceImages.filter((s) => s.analyzeStatus === "done")}
              actions={planActions}
              disabled={busy}
            />
          );
        })}
        {selectedTypes.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-12 border-2 border-dashed border-slate-200 rounded-xl">
            没有勾选任何出图类型，请回退到上一节点选择
          </div>
        )}
      </div>
    </NodeBlock>
  );
}
