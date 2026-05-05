"use client";

/**
 * 节点 05 · 模型选择
 *
 *   候选模型卡片网格 + 每方案出图数 + 提示词语言 + 总价预估
 */

import { useMemo } from "react";
import { Check, Globe, Languages, Zap } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FeedbackBar, NodeBlock } from "..";
import type { ModelConfigActions, NodeComponentProps } from "./types";

interface SelectableModel {
  slug: string;
  name: string;
  description?: string;
  unitPrice: number;
  avgLatencySec?: number;
  tags: string[];
  preferredLanguage?: "zh" | "en";
}

interface Node05Props extends NodeComponentProps {
  modelConfigActions: ModelConfigActions;
}

export default function Node05_ModelSelection({
  node,
  snapshot,
  actions,
  modelConfigActions,
  busy,
  isLast,
}: Node05Props) {
  const out = node.output as
    | {
        availableModels: SelectableModel[];
        selectedSlug: string | null;
        promptLanguage: "zh" | "en";
        imagesPerPlan: number;
      }
    | null;

  // 优先用项目锁定的值，否则回退到 output
  const selected = snapshot.project.imageModelSlug ?? out?.selectedSlug ?? null;
  const language = (snapshot.project.promptLanguage as "zh" | "en") ?? out?.promptLanguage ?? "zh";
  const imagesPerPlan = snapshot.project.imagesPerPlan ?? out?.imagesPerPlan ?? 2;

  const setSelected = (slug: string) => modelConfigActions.onPatch({ imageModelSlug: slug });
  const setLanguage = (lang: "zh" | "en") => modelConfigActions.onPatch({ promptLanguage: lang });
  const setImagesPerPlan = (n: number) => modelConfigActions.onPatch({ imagesPerPlan: n });

  const totalPlans = snapshot.imagePlans.length;
  const selectedModel = out?.availableModels.find((m) => m.slug === selected) ?? null;
  const totalCost = useMemo(() => {
    if (!selectedModel) return 0;
    return selectedModel.unitPrice * totalPlans * imagesPerPlan;
  }, [selectedModel, totalPlans, imagesPerPlan]);

  return (
    <NodeBlock
      status={node.status}
      title={node.meta.title}
      subtitle="选择用于本项目的生图模型，模型确认后将锁定"
      nodeIndex={node.index}
      onRollback={actions.onRollback}
      canRollback={node.index > 0}
      errorMessage={node.errorMessage}
      isLast={isLast}
      footer={
        node.status === "awaiting_review" || node.status === "rejected" ? (
          <div className="flex flex-col gap-3">
            <FeedbackBar
              placeholder="对模型推荐不满意？写一句意见…"
              onRetry={actions.onReject}
              disabled={busy}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-slate-600">
                总价预估：
                <span className="font-bold text-amber-600 text-lg ml-1">
                  ¥{totalCost.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400 ml-1">
                  （{totalPlans} 张方案 × {imagesPerPlan} 候选）
                </span>
              </div>
              <Button variant="primary" onClick={actions.onConfirm} disabled={busy || !selected}>
                {node.meta.confirmCtaLabel} →
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {!out ? (
        <div className="text-sm text-slate-400">暂无模型数据</div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 模型网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {out.availableModels.map((m) => {
              const isSelected = selected === m.slug;
              return (
                <button
                  key={m.slug}
                  onClick={() => setSelected(m.slug)}
                  disabled={busy}
                  className={cn(
                    "text-left rounded-xl border p-4 bg-white transition-all relative",
                    isSelected
                      ? "border-brand-300 shadow-sm ring-1 ring-brand-200"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="font-semibold text-slate-900">{m.name}</h3>
                    {m.preferredLanguage === "en" && (
                      <Badge color="violet" className="!text-[10px]">
                        英文
                      </Badge>
                    )}
                  </div>
                  {m.description && (
                    <p className="text-xs text-slate-600 mb-3">{m.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Zap className="w-3 h-3" />¥{m.unitPrice} / 张
                    </span>
                    {m.avgLatencySec && (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="w-3 h-3" />~{m.avgLatencySec}s
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.tags.map((t) => (
                      <Badge key={t} color="slate" className="!text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 提示词语言 / 每方案出图数 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5" />
                提示词语言
              </div>
              <div className="flex gap-2">
                {(["zh", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    disabled={busy}
                    className={cn(
                      "flex-1 h-8 rounded-md border text-sm font-medium transition-colors",
                      language === lang
                        ? "bg-brand-50 border-brand-300 text-brand-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
                    )}
                  >
                    {lang === "zh" ? "中文" : "英文"}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500 mb-2">
                每方案出图数（每张方案生成几张候选）
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setImagesPerPlan(Math.max(1, imagesPerPlan - 1))}
                  disabled={busy || imagesPerPlan <= 1}
                  className="w-8 h-8 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  −
                </button>
                <span className="w-12 text-center text-sm font-bold">{imagesPerPlan}</span>
                <button
                  onClick={() => setImagesPerPlan(Math.min(5, imagesPerPlan + 1))}
                  disabled={busy || imagesPerPlan >= 5}
                  className="w-8 h-8 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  +
                </button>
                <span className="text-xs text-slate-400 ml-1">张 / 方案</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </NodeBlock>
  );
}
