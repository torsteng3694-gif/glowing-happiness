"use client";

/**
 * 节点 06 · 提示词生成
 *
 *   按分类折叠分组
 *   每条 prompt 单条卡：序号 / 标题 / 提示词文本 / 编辑 / AI 重写
 */

import { useState } from "react";
import { ChevronDown, Languages, Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FeedbackBar, InlineEditableText, NodeBlock, RegenerateDialog } from "..";
import type { NodeComponentProps, PlanActions } from "./types";

interface Node06Props extends NodeComponentProps {
  planActions: PlanActions;
}

export default function Node06_PromptGeneration({
  node,
  snapshot,
  actions,
  planActions,
  busy,
  isLast,
}: Node06Props) {
  const selectedTypes = snapshot.imageTypes.filter((t) => t.selected);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleGroup(typeId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

  return (
    <NodeBlock
      status={node.status}
      title={node.meta.title}
      subtitle={`已为 ${snapshot.imagePlans.length} 张图片生成提示词，可逐条审阅与编辑`}
      nodeIndex={node.index}
      onRollback={actions.onRollback}
      canRollback={node.index > 0}
      errorMessage={node.errorMessage}
      isLast={isLast}
      footer={
        node.status === "awaiting_review" || node.status === "rejected" ? (
          <div className="flex flex-col gap-3">
            <FeedbackBar
              placeholder="想整体重写所有提示词？例如：'统一加上「干净专业」描述'…"
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
          const isCollapsed = collapsed.has(t.id);
          return (
            <div key={t.id} className="rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => toggleGroup(t.id)}
                className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={cn("w-4 h-4 text-slate-400 transition-transform", isCollapsed && "-rotate-90")}
                  />
                  <span className="font-medium text-slate-800">{t.name}</span>
                  <Badge color="slate">{plans.length} 张</Badge>
                </div>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-slate-100">
                  {plans.map((p) => (
                    <div key={p.id} className="px-4 py-3 hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-100 text-amber-700 text-xs font-bold">
                          {p.idx}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 mb-1">{p.title}</div>
                          <InlineEditableText
                            value={p.prompt ?? ""}
                            onSave={(next) => planActions.onPatchPlan(p.id, { prompt: next })}
                            multiline
                            placeholder="（点击编辑提示词）"
                            displayClassName="text-xs text-slate-600 leading-relaxed font-mono whitespace-pre-wrap"
                            disabled={busy}
                          />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <RegenerateDialog
                            title="AI 重写这条提示词"
                            placeholder="例如：去掉背景人物 / 用更专业的术语…"
                            onSubmit={(feedback) => planActions.onRegeneratePrompt(p.id, feedback)}
                          >
                            <button
                              className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 px-2 py-1 rounded-md hover:bg-amber-50"
                              disabled={busy}
                            >
                              <Sparkles className="w-3 h-3" />
                              AI 重写
                            </button>
                          </RegenerateDialog>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </NodeBlock>
  );
}
