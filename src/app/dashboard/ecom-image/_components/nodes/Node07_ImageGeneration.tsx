"use client";

/**
 * 节点 07 · 批量出图
 *
 *   按分类分组 → 每组下 N 个 plan 横向卡片
 *   每个 plan 行：左侧标题/提示词预览，右侧候选图横向滚动 + "+ 追加" 按钮
 */

import { useMemo, useState } from "react";
import { ChevronDown, Download, Play, RotateCw, Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NodeBlock } from "..";
import GeneratedImageCard, { type VirtualGenerated } from "./GeneratedImageCard";
import type { GeneratedImageActions, GeneratedImageView, NodeComponentProps } from "./types";

interface Node07Props extends NodeComponentProps {
  generatedActions: GeneratedImageActions;
}

export default function Node07_ImageGeneration({
  node,
  snapshot,
  actions,
  generatedActions,
  busy,
  isLast,
}: Node07Props) {
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

  const imagesPerPlan = snapshot.project.imagesPerPlan ?? 2;

  const stats = useMemo(() => {
    const all = snapshot.generatedImages;
    return {
      total: all.length,
      done: all.filter((g) => g.status === "done").length,
      running: all.filter((g) => g.status === "running").length,
      queued: all.filter((g) => g.status === "queued").length,
      failed: all.filter((g) => g.status === "failed").length,
      picked: all.filter((g) => g.picked).length,
    };
  }, [snapshot.generatedImages]);

  /**
   * 为每个 plan 合并"真候选 + 虚拟占位"：
   *   - 已有 K 张真候选（任意状态：queued/running/done/failed）
   *   - 不足 imagesPerPlan 时，补虚拟占位到目标数（用于显示骨架）
   *   - 已超过目标数时（用户主动追加过）就不再补
   */
  function getPlanCandidates(planId: string): Array<GeneratedImageView | VirtualGenerated> {
    const real = snapshot.generatedImages
      .filter((g) => g.planId === planId)
      .sort((a, b) => a.candidateIdx - b.candidateIdx);
    if (real.length >= imagesPerPlan) return real;
    const usedIdx = new Set(real.map((r) => r.candidateIdx));
    const items: Array<GeneratedImageView | VirtualGenerated> = [...real];
    let nextIdx = 1;
    while (items.length < imagesPerPlan) {
      while (usedIdx.has(nextIdx)) nextIdx++;
      items.push({
        status: "virtual",
        candidateIdx: nextIdx,
        _planId: planId,
        _key: `virtual_${planId}_${nextIdx}`,
      });
      usedIdx.add(nextIdx);
      nextIdx++;
    }
    return items.sort((a, b) => a.candidateIdx - b.candidateIdx);
  }

  const hasInflight = stats.queued + stats.running > 0;
  const hasUngenerated = snapshot.imagePlans.length * imagesPerPlan > stats.total;
  const expectedTotal = snapshot.imagePlans.length * imagesPerPlan;

  return (
    <NodeBlock
      status={node.status}
      title={node.meta.title}
      subtitle={
        hasInflight
          ? `串行生成中：已完成 ${stats.done} / 总计 ${expectedTotal}（${stats.running} 张正在生成，${stats.queued} 张排队）`
          : `已完成 ${stats.done} / 总计 ${expectedTotal}，挑中 ${stats.picked} 张${stats.failed > 0 ? `，${stats.failed} 张失败` : ""}`
      }
      nodeIndex={node.index}
      onRollback={actions.onRollback}
      canRollback={node.index > 0}
      errorMessage={node.errorMessage}
      isLast={isLast}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`/api/ecom-image/projects/${snapshot.project.id}/zip?picked=1`}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-brand-300 transition-colors",
                stats.picked === 0 && "opacity-50 pointer-events-none",
              )}
              download
              title={stats.picked === 0 ? "请先挑选候选图" : `下载 ${stats.picked} 张挑中`}
            >
              <Download className="w-3.5 h-3.5" />
              下载挑中 {stats.picked}
            </a>
            <a
              href={`/api/ecom-image/projects/${snapshot.project.id}/zip`}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-brand-300 transition-colors",
                stats.done === 0 && "opacity-50 pointer-events-none",
              )}
              download
              title={stats.done === 0 ? "还没有生成完成的图片" : `下载全部 ${stats.done} 张`}
            >
              <Download className="w-3.5 h-3.5" />
              下载全部 {stats.done}
            </a>
            {stats.failed > 0 && (
              <span className="text-xs text-rose-600">⚠ {stats.failed} 张失败</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {stats.failed > 0 && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                onClick={() => generatedActions.onRetryFailed()}
                disabled={busy}
                title={`重试 ${stats.failed} 张失败的`}
              >
                重试失败 {stats.failed}
              </Button>
            )}
            {hasUngenerated && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                onClick={() => generatedActions.onGenerateAll("missing")}
                disabled={busy || hasInflight}
                title={hasInflight ? "请等待当前任务完成" : "为所有未生成的方案串行补足候选"}
              >
                {hasInflight ? "生成中…" : `全部生成 (${expectedTotal - stats.total} 张)`}
              </Button>
            )}
            {(node.status === "awaiting_review" || node.status === "rejected") && stats.done > 0 && (
              <Button
                variant="primary"
                onClick={actions.onConfirm}
                disabled={busy || hasInflight}
                title={hasInflight ? "请等待生成完成" : ""}
              >
                {node.meta.confirmCtaLabel}
              </Button>
            )}
          </div>
        </div>
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
                  <Badge color="slate">{plans.length} 张方案</Badge>
                </div>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-slate-100">
                  {plans.map((p) => {
                    const candidates = getPlanCandidates(p.id);
                    const planAllDone = candidates.every(
                      (c) => c.status === "done",
                    );
                    return (
                      <div key={p.id} className="px-4 py-3">
                        <div className="flex items-start gap-4">
                          {/* 左：plan 元信息 */}
                          <div className="w-48 shrink-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-700 text-xs font-bold">
                                {p.idx}
                              </span>
                              <span className="text-sm font-medium text-slate-800 truncate">{p.title}</span>
                              {planAllDone && (
                                <span className="text-emerald-500 text-xs">✓</span>
                              )}
                            </div>
                            <Badge color="slate" className="!text-[10px]">
                              {p.aspectRatio}
                            </Badge>
                            {/* 垫图缩略：显示该 plan 启用的源图 */}
                            {(() => {
                              const refSourceIds = new Set(
                                p.referenceIds.filter((r) => r.type === "source").map((r) => r.id),
                              );
                              const refImgs = snapshot.sourceImages.filter((s) => refSourceIds.has(s.id));
                              if (refImgs.length === 0) {
                                return (
                                  <div className="mt-1.5 text-[10px] text-rose-500" title="没有启用任何垫图，将走纯文生图">
                                    ⚠ 无垫图（纯文生图）
                                  </div>
                                );
                              }
                              return (
                                <div className="mt-1.5 flex items-center gap-1" title={`${refImgs.length} 张垫图`}>
                                  <span className="text-[10px] text-slate-500">垫图</span>
                                  <div className="flex items-center -space-x-1">
                                    {refImgs.slice(0, 5).map((s) => (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        key={s.id}
                                        src={s.url}
                                        alt=""
                                        className="w-5 h-5 rounded border border-white object-cover bg-slate-100"
                                      />
                                    ))}
                                    {refImgs.length > 5 && (
                                      <span className="text-[9px] text-slate-400 ml-1">+{refImgs.length - 5}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {p.prompt && (
                              <p
                                className="text-[10px] text-slate-500 line-clamp-3 mt-1.5 leading-relaxed cursor-help"
                                title={p.prompt}
                              >
                                {p.prompt}
                              </p>
                            )}
                          </div>

                          {/* 右：候选图（真+虚拟）横向滚动 */}
                          <div className="flex-1 min-w-0 overflow-x-auto">
                            <div className="flex items-stretch gap-2 pb-1">
                              {candidates.map((g) => (
                                <GeneratedImageCard
                                  key={"id" in g ? g.id : g._key}
                                  generated={g}
                                  planId={p.id}
                                  actions={generatedActions}
                                  disabled={busy}
                                />
                              ))}
                              {/* + 追加（永远在末尾，让用户超出 imagesPerPlan 也能加） */}
                              <button
                                onClick={() => generatedActions.onGenerate(p.id)}
                                disabled={busy}
                                className="shrink-0 w-32 aspect-square rounded-lg border-2 border-dashed border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 text-slate-400 hover:text-amber-500 flex flex-col items-center justify-center gap-1 transition-colors"
                                title="追加新候选"
                              >
                                <Play className="w-5 h-5" />
                                <span className="text-[10px]">追加候选</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </NodeBlock>
  );
}
