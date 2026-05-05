"use client";

/**
 * 节点 02 · 资料补全
 *
 * 双模式：
 *   skip → AI 判断信息已足够，显示判定理由 + 直接确认 / "我还想补充" 入口
 *   qa   → 多轮问答列表（阶段 0 不接 AI 真问答，仅渲染 fixtures）
 */

import { CircleCheck, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { FeedbackBar, NodeBlock } from "..";
import type { NodeComponentProps } from "./types";

export default function Node02_Supplement({ node, actions, busy, isLast }: NodeComponentProps) {
  const out = node.output as
    | { mode: "skip" | "qa"; judgement: string; questions: Array<{ id: string; question: string; answer: string | null }> }
    | null;

  if (!out) {
    return (
      <NodeBlock
        status={node.status}
        title={node.meta.title}
        subtitle="加载中…"
        nodeIndex={node.index}
        onRollback={actions.onRollback}
      >
        <div className="text-sm text-slate-400">暂无数据</div>
      </NodeBlock>
    );
  }

  const isSkip = out.mode === "skip";

  return (
    <NodeBlock
      status={node.status}
      title={isSkip ? "信息已完整" : "需要补充资料"}
      subtitle={
        isSkip
          ? "AI 判断当前信息已足够生成图片，可直接进入下一步"
          : `AI 提了 ${out.questions.length} 个问题以更精准地生成图片`
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
              placeholder="想再补充些什么？例如：希望调性更高级、目标人群偏年轻…"
              onRetry={actions.onReject}
              retryLabel="再追问一轮"
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
      {isSkip ? (
        <div className="rounded-lg bg-emerald-50/60 border border-emerald-200/70 p-4 flex items-start gap-3">
          <CircleCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {out.judgement}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {out.questions.map((q) => (
            <div key={q.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2 mb-2">
                <MessageCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm font-medium text-slate-700">{q.question}</div>
              </div>
              <input
                type="text"
                placeholder="QA 模式即将上线 · 现阶段请用底部反馈追问"
                defaultValue={q.answer ?? ""}
                disabled
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400 placeholder:text-slate-400 cursor-not-allowed"
              />
            </div>
          ))}
        </div>
      )}
    </NodeBlock>
  );
}
