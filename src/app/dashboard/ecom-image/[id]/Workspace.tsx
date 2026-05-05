"use client";

/**
 * 电商一键出图 · 工作台客户端容器
 *
 *   - 拉取项目 snapshot（首次 + 用户操作后 mutate）
 *   - 渲染纵向节点流：UserBubble → 已确认/跳过节点 (SummaryCard) → 当前节点 (NodeBlock)
 *   - 实现 callbacks：调 ecomApi → 成功后乐观刷新 snapshot
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ecomApi } from "@/lib/ecom-image/api-client";
import { NODE_KEYS, NODE_META, type NodeKey } from "@/lib/ecom-image/nodes";
import type { ProjectSnapshot } from "@/lib/ecom-image/snapshot";
import {
  ModelPicker,
  NodeBlock,
  NodeProgressBar,
  SummaryCard,
  UserBubble,
  useLastModelSlug,
} from "../_components";
import {
  Node01_ProductAnalysis,
  Node02_Supplement,
  Node03_ImageAnalysis,
  Node04_PlanCreation,
  Node05_ModelSelection,
  Node06_PromptGeneration,
  Node07_ImageGeneration,
} from "../_components/nodes";
import type {
  GeneratedImageActions,
  ImageTypeActions,
  ModelConfigActions,
  NodeActions,
  PlanActions,
  SourceImageActions,
} from "../_components/nodes";

// 真 engine 节点（前端意义）：
//   - 这些节点 pending/failed 时 UI 显示"启动卡"等用户主动触发
//   - 02/05 由 confirm 自动 run，不在这里
const REAL_ENGINE_NODES = new Set<NodeKey>([
  NODE_KEYS.PRODUCT_ANALYSIS,
  NODE_KEYS.IMAGE_ANALYSIS,
  NODE_KEYS.PLAN_CREATION,
  NODE_KEYS.PROMPT_GENERATION,
  NODE_KEYS.IMAGE_GENERATION,
]);
/** 节点 07 不需要选模型（用项目锁定的） */
const NODES_WITHOUT_MODEL_PICKER = new Set<NodeKey>([NODE_KEYS.IMAGE_GENERATION]);

export default function Workspace({ projectId }: { projectId: string }) {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastModelSlug, saveLastModelSlug] = useLastModelSlug();

  // ---- 拉取 snapshot ----
  const refresh = useCallback(async () => {
    try {
      const data = await ecomApi.getSnapshot(projectId);
      setSnapshot(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "加载失败");
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 节点 running 时轮询；节点 07 有任务在跑时也要轮询（即使节点本身是 awaiting_review）
  useEffect(() => {
    if (!snapshot) return;
    const hasRunningNode = snapshot.nodes.some(
      (n) => n.status === "running" || (n.status === "pending" && n.key === snapshot.project.currentNode),
    );
    const hasInflightImage = snapshot.generatedImages.some(
      (g) => g.status === "queued" || g.status === "running",
    );
    if (!hasRunningNode && !hasInflightImage) return;
    // 有图片在生成时用 1.5s（更顺滑），其他场景 2s
    const t = setInterval(refresh, hasInflightImage ? 1500 : 2000);
    return () => clearInterval(t);
  }, [snapshot, refresh]);

  // ---- 通用包装：调 API + 刷新 + 错误捕获 ----
  const wrap = useCallback(
    <T,>(fn: () => Promise<T>) =>
      async () => {
        if (busy) return;
        setBusy(true);
        setActionError(null);
        try {
          await fn();
          await refresh();
        } catch (e) {
          setActionError(e instanceof Error ? e.message : "操作失败");
        } finally {
          setBusy(false);
        }
      },
    [busy, refresh],
  );

  // ---- 节点级 actions（按 key 工厂出 NodeActions） ----
  const makeNodeActions = useCallback(
    (key: NodeKey): NodeActions => ({
      onConfirm: wrap(() => ecomApi.confirmNode(projectId, key)),
      onReject: async (feedback) => {
        if (busy) return;
        setBusy(true);
        setActionError(null);
        try {
          await ecomApi.rejectNode(projectId, key, feedback);
          await refresh();
        } catch (e) {
          setActionError(e instanceof Error ? e.message : "操作失败");
        } finally {
          setBusy(false);
        }
      },
      onRollback: wrap(() => ecomApi.rollbackNode(projectId, key)),
      onSkip: NODE_META[key].skippable ? wrap(() => ecomApi.skipNode(projectId, key)) : undefined,
    }),
    [busy, projectId, refresh, wrap],
  );

  // ---- 单产物 actions（统一捕获错误并显示） ----
  const runWithCatch = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "操作失败");
      }
    },
    [refresh],
  );

  const imageTypeActions: ImageTypeActions = useMemo(
    () => ({
      onToggleSelected: (typeId, selected) =>
        runWithCatch(() => ecomApi.patchImageType(projectId, typeId, { selected })),
      onPatch: (typeId, patch) =>
        runWithCatch(() => ecomApi.patchImageType(projectId, typeId, patch)),
      onDelete: (typeId) =>
        runWithCatch(() => ecomApi.deleteImageType(projectId, typeId)),
    }),
    [projectId, runWithCatch],
  );

  const sourceImageActions: SourceImageActions = useMemo(
    () => ({
      onPatch: (id, patch) =>
        runWithCatch(() => ecomApi.patchSourceImage(projectId, id, patch)),
      onReanalyze: (id, feedback) =>
        runWithCatch(() => ecomApi.reanalyzeSourceImage(projectId, id, feedback)),
      onToggleExclude: (id, excluded) =>
        runWithCatch(() =>
          ecomApi.patchSourceImage(projectId, id, {
            analyzeStatus: excluded ? "excluded" : "done",
          }),
        ),
    }),
    [projectId, runWithCatch],
  );

  const planActions: PlanActions = useMemo(
    () => ({
      onPatchPlan: (planId, patch) =>
        runWithCatch(() => ecomApi.patchImagePlan(projectId, planId, patch)),
      onDeletePlan: (planId) =>
        runWithCatch(() => ecomApi.deleteImagePlan(projectId, planId)),
      onAddPlan: (typeId, origin) =>
        runWithCatch(() => ecomApi.addImagePlan(projectId, { imageTypeId: typeId, origin })),
      onRewritePlan: (planId, feedback) =>
        runWithCatch(() => ecomApi.rewriteImagePlan(projectId, planId, feedback)),
      onRegeneratePrompt: (planId, feedback) =>
        runWithCatch(() => ecomApi.regeneratePromptForPlan(projectId, planId, feedback)),
    }),
    [projectId, runWithCatch],
  );

  const modelConfigActions: ModelConfigActions = useMemo(
    () => ({
      onPatch: (patch) => runWithCatch(() => ecomApi.patchModelConfig(projectId, patch)),
    }),
    [projectId, runWithCatch],
  );

  const generatedActions: GeneratedImageActions = useMemo(
    () => ({
      onTogglePicked: (genId, picked) =>
        runWithCatch(() => ecomApi.patchGeneratedImage(projectId, genId, { picked })),
      onDelete: (genId) =>
        runWithCatch(() => ecomApi.deleteGeneratedImage(projectId, genId)),
      onGenerate: (planId, generatedImageId) =>
        runWithCatch(() => ecomApi.generateForPlan(projectId, planId, { generatedImageId })),
      onGenerateAll: (mode) => runWithCatch(() => ecomApi.generateAll(projectId, mode ?? "missing")),
      onRetryFailed: () => runWithCatch(() => ecomApi.retryFailed(projectId)),
    }),
    [projectId, runWithCatch],
  );

  // ---- 渲染 ----
  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Card className="p-8 text-center">
          <div className="text-rose-600 font-medium mb-2">加载失败</div>
          <div className="text-sm text-slate-500 mb-4">{loadError}</div>
          <Button onClick={refresh}>重试</Button>
        </Card>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载中…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      {/* 顶部 */}
      <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="min-w-0">
          <Link
            href="/dashboard/ecom-image"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            返回项目列表
          </Link>
          <h1 className="text-xl font-bold text-slate-900 truncate">{snapshot.project.title}</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <ImagePlus className="w-3.5 h-3.5" />
            {snapshot.sourceImages.length} 张图
          </span>
          <span>·</span>
          <span>进度 {snapshot.project.progress}%</span>
        </div>
      </header>

      {/* 错误条 */}
      {actionError && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700">
            ×
          </button>
        </div>
      )}

      {/* 用户消息气泡 */}
      <div className="mb-6">
        <UserBubble
          text={snapshot.project.initialPrompt}
          imageUrls={snapshot.sourceImages.map((s) => s.url)}
        />
      </div>

      {/* 节点流 */}
      <div className="flex flex-col gap-5">
        {(() => {
          // 计算最后一个会被渲染的 node index（用于 isLast 标记）
          const renderableIndices = snapshot.nodes
            .map((n, i) => {
              if (n.status === "confirmed" || n.status === "skipped") return i;
              if (n.status === "running") return i;
              if (n.status === "pending" && n.key === snapshot.project.currentNode) return i;
              if (n.status === "awaiting_review" || n.status === "rejected" || n.status === "failed") return i;
              return -1;
            })
            .filter((i) => i >= 0);
          const lastRenderIdx = renderableIndices[renderableIndices.length - 1];

          return snapshot.nodes.map((node, i) => {
            const isLast = i === lastRenderIdx;
            // 已确认 / 已跳过 → SummaryCard
            if (node.status === "confirmed" || node.status === "skipped") {
              return renderSummaryCard(node, snapshot, isLast);
            }

            // 进行中 → NodeBlock + NodeProgressBar
            if (node.status === "running") {
              return (
                <NodeBlock
                  key={node.key}
                  status="running"
                  title={node.meta.title}
                  subtitle={node.runStageText ?? "AI 正在思考…"}
                  nodeIndex={node.index}
                  canRollback={false}
                  isLast={isLast}
                >
                  <NodeProgressBar
                    stages={node.meta.runStages}
                    currentStage={node.runStage ?? node.meta.runStages[0]}
                    text={node.runStageText ?? `正在执行${node.meta.title}…`}
                  />
                </NodeBlock>
              );
            }

            // 真 engine 节点 + pending/failed → 启动卡（让用户选模型并启动）
            const isReal = REAL_ENGINE_NODES.has(node.key);
            const isFirstReady =
              node.status === "pending" && node.key === snapshot.project.currentNode;
            if (isReal && (isFirstReady || node.status === "failed")) {
              const needsModel = !NODES_WITHOUT_MODEL_PICKER.has(node.key);
              const startLabel =
                node.status === "failed"
                  ? "重新启动"
                  : node.key === NODE_KEYS.IMAGE_GENERATION
                    ? `开始批量生成图片`
                    : `开始${node.meta.title}`;
              return (
                <NodeBlock
                  key={node.key}
                  status={node.status}
                  title={node.meta.title}
                  subtitle={
                    node.status === "failed"
                      ? "上次执行失败，可重试"
                      : needsModel
                        ? "选择视觉模型并开始"
                        : `使用项目锁定的生图模型 ${snapshot.project.imageModelSlug ?? "（未选）"}`
                  }
                  nodeIndex={node.index}
                  canRollback={node.index > 0}
                  onRollback={makeNodeActions(node.key).onRollback}
                  isLast={isLast}
                  errorMessage={node.errorMessage}
                >
                  <div className="flex flex-col gap-3">
                    {needsModel && (
                      <ModelPicker
                        value={lastModelSlug}
                        onChange={saveLastModelSlug}
                        disabled={busy}
                      />
                    )}
                    <div className="flex items-center justify-end">
                      <Button
                        variant="primary"
                        leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                        onClick={async () => {
                          if (needsModel && !lastModelSlug) {
                            setActionError("请先选择视觉模型");
                            return;
                          }
                          setBusy(true);
                          setActionError(null);
                          try {
                            await ecomApi.runNode(projectId, node.key, {
                              modelSlug: needsModel ? lastModelSlug ?? undefined : undefined,
                            });
                            await refresh();
                          } catch (e) {
                            setActionError(e instanceof Error ? e.message : "启动失败");
                          } finally {
                            setBusy(false);
                          }
                        }}
                        loading={busy}
                        disabled={needsModel && !lastModelSlug}
                      >
                        {startLabel}
                      </Button>
                    </div>
                  </div>
                </NodeBlock>
              );
            }

            // mock 节点 + pending/currentNode → 当作 running 渲染（mock-engine 是同步落库）
            if (node.status === "pending" && node.key === snapshot.project.currentNode) {
              return (
                <NodeBlock
                  key={node.key}
                  status="running"
                  title={node.meta.title}
                  subtitle="AI 正在思考…"
                  nodeIndex={node.index}
                  canRollback={false}
                  isLast={isLast}
                >
                  <NodeProgressBar
                    stages={node.meta.runStages}
                    currentStage={node.runStage ?? node.meta.runStages[0]}
                    text={`正在执行${node.meta.title}…`}
                  />
                </NodeBlock>
              );
            }

            // awaiting_review / rejected → 节点专属组件
            if (node.status === "awaiting_review" || node.status === "rejected" || (node.status === "failed" && !isReal)) {
              const actions = makeNodeActions(node.key);
              return renderActiveNode(node.key, {
                node,
                snapshot,
                actions,
                busy,
                imageTypeActions,
                sourceImageActions,
                planActions,
                modelConfigActions,
                generatedActions,
                isLast,
              });
            }

            // pending（且不是 currentNode）→ 不渲染
            return null;
          });
        })()}
      </div>
    </div>
  );
}

// ============================================================
// 渲染辅助
// ============================================================

function renderSummaryCard(
  node: ProjectSnapshot["nodes"][number],
  snapshot: ProjectSnapshot,
  isLast = false,
) {
  // 每节点的折叠卡显示信息略不同
  const variant = node.status === "skipped" ? "skipped" : "confirmed";

  if (node.key === NODE_KEYS.PRODUCT_ANALYSIS) {
    const selected = snapshot.imageTypes.filter((t) => t.selected);
    return (
      <SummaryCard
        key={node.key}
        nodeIndex={node.index}
        variant={variant}
        isLast={isLast}
        statusTitle="已选择出图类型"
        cardTitle="出图类型方案"
        metaChips={[
          { label: `${selected.length} 种类型` },
          { label: `${selected.flatMap((s) => s.platforms).length} 个平台` },
          { label: `${selected.filter((s) => s.priorityTags.includes("高转化")).length} 项高优` },
        ]}
        thumbnails={
          <>
            {selected.slice(0, 4).map((t) => (
              <div
                key={t.id}
                className="shrink-0 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200/60 text-[11px]"
              >
                <div className="font-medium text-emerald-800 truncate max-w-[120px]">{t.name}</div>
              </div>
            ))}
            {selected.length > 4 && (
              <div className="shrink-0 px-2 py-1 rounded-md bg-slate-100 text-[11px] text-slate-500">
                +{selected.length - 4}
              </div>
            )}
          </>
        }
      />
    );
  }

  if (node.key === NODE_KEYS.SUPPLEMENT_INFO) {
    return (
      <SummaryCard
        key={node.key}
        nodeIndex={node.index}
        variant={variant}
        isLast={isLast}
        statusTitle={variant === "skipped" ? "补充资料已跳过" : "补充资料已完成"}
        cardTitle="补充资料"
        metaChips={[{ label: variant === "skipped" ? "无需补充" : "信息已完整" }]}
      />
    );
  }

  if (node.key === NODE_KEYS.IMAGE_ANALYSIS) {
    const done = snapshot.sourceImages.filter((s) => s.analyzeStatus === "done").length;
    return (
      <SummaryCard
        key={node.key}
        nodeIndex={node.index}
        variant={variant}
        isLast={isLast}
        statusTitle="图片内容已分析"
        cardTitle="图片内容分析"
        metaChips={[
          { label: `${done} 张已分析` },
          { label: `${snapshot.sourceImages.length} 张原图` },
        ]}
        thumbnails={
          <>
            {snapshot.sourceImages.slice(0, 5).map((s) => (
              <div
                key={s.id}
                className="shrink-0 w-[140px] rounded-md bg-white border border-slate-200 overflow-hidden flex items-stretch"
              >
                <div className="w-10 h-10 bg-slate-50 shrink-0 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="px-1.5 py-0.5 min-w-0 flex items-center text-[10px] text-slate-600 truncate">
                  {s.title?.slice(0, 12) ?? "未命名"}
                </div>
              </div>
            ))}
          </>
        }
      />
    );
  }

  if (node.key === NODE_KEYS.PLAN_CREATION) {
    const groups = snapshot.imageTypes.filter((t) => t.selected).length;
    return (
      <SummaryCard
        key={node.key}
        nodeIndex={node.index}
        variant={variant}
        isLast={isLast}
        statusTitle="出图方案已确认"
        cardTitle="出图方案规划"
        metaChips={[
          { label: `${groups} 个分类` },
          { label: `${snapshot.imagePlans.length} 张图` },
        ]}
      />
    );
  }

  if (node.key === NODE_KEYS.MODEL_SELECTION) {
    return (
      <SummaryCard
        key={node.key}
        nodeIndex={node.index}
        variant={variant}
        isLast={isLast}
        statusTitle="生图模型已锁定"
        cardTitle="模型选择"
        metaChips={[
          { label: snapshot.project.imageModelSlug ?? "未指定" },
          { label: `提示词 · ${snapshot.project.promptLanguage}` },
          { label: `每方案 ${snapshot.project.imagesPerPlan ?? 2} 张` },
        ]}
      />
    );
  }

  if (node.key === NODE_KEYS.PROMPT_GENERATION) {
    return (
      <SummaryCard
        key={node.key}
        nodeIndex={node.index}
        variant={variant}
        isLast={isLast}
        statusTitle="提示词已生成"
        cardTitle="提示词生成"
        metaChips={[{ label: `${snapshot.imagePlans.length} 条提示词` }]}
      />
    );
  }

  if (node.key === NODE_KEYS.IMAGE_GENERATION) {
    const done = snapshot.generatedImages.filter((g) => g.status === "done").length;
    const picked = snapshot.generatedImages.filter((g) => g.picked).length;
    return (
      <SummaryCard
        key={node.key}
        nodeIndex={node.index}
        variant={variant}
        isLast={isLast}
        statusTitle="图片已批量生成"
        cardTitle="批量出图"
        metaChips={[
          { label: `${done} 张已生成` },
          { label: `${picked} 张已挑选` },
        ]}
      />
    );
  }

  return null;
}

function renderActiveNode(
  key: NodeKey,
  ctx: {
    node: ProjectSnapshot["nodes"][number];
    snapshot: ProjectSnapshot;
    actions: NodeActions;
    busy: boolean;
    imageTypeActions: ImageTypeActions;
    sourceImageActions: SourceImageActions;
    planActions: PlanActions;
    modelConfigActions: ModelConfigActions;
    generatedActions: GeneratedImageActions;
    isLast: boolean;
  },
) {
  switch (key) {
    case NODE_KEYS.PRODUCT_ANALYSIS:
      return (
        <Node01_ProductAnalysis
          key={key}
          node={ctx.node}
          snapshot={ctx.snapshot}
          actions={ctx.actions}
          busy={ctx.busy}
          isLast={ctx.isLast}
          imageTypeActions={ctx.imageTypeActions}
        />
      );
    case NODE_KEYS.SUPPLEMENT_INFO:
      return (
        <Node02_Supplement
          key={key}
          node={ctx.node}
          snapshot={ctx.snapshot}
          actions={ctx.actions}
          busy={ctx.busy}
          isLast={ctx.isLast}
        />
      );
    case NODE_KEYS.IMAGE_ANALYSIS:
      return (
        <Node03_ImageAnalysis
          key={key}
          node={ctx.node}
          snapshot={ctx.snapshot}
          actions={ctx.actions}
          busy={ctx.busy}
          isLast={ctx.isLast}
          sourceImageActions={ctx.sourceImageActions}
        />
      );
    case NODE_KEYS.PLAN_CREATION:
      return (
        <Node04_PlanCreation
          key={key}
          node={ctx.node}
          snapshot={ctx.snapshot}
          actions={ctx.actions}
          busy={ctx.busy}
          isLast={ctx.isLast}
          planActions={ctx.planActions}
        />
      );
    case NODE_KEYS.MODEL_SELECTION:
      return (
        <Node05_ModelSelection
          key={key}
          node={ctx.node}
          snapshot={ctx.snapshot}
          actions={ctx.actions}
          busy={ctx.busy}
          isLast={ctx.isLast}
          modelConfigActions={ctx.modelConfigActions}
        />
      );
    case NODE_KEYS.PROMPT_GENERATION:
      return (
        <Node06_PromptGeneration
          key={key}
          node={ctx.node}
          snapshot={ctx.snapshot}
          actions={ctx.actions}
          busy={ctx.busy}
          isLast={ctx.isLast}
          planActions={ctx.planActions}
        />
      );
    case NODE_KEYS.IMAGE_GENERATION:
      return (
        <Node07_ImageGeneration
          key={key}
          node={ctx.node}
          snapshot={ctx.snapshot}
          actions={ctx.actions}
          busy={ctx.busy}
          isLast={ctx.isLast}
          generatedActions={ctx.generatedActions}
        />
      );
    default:
      return null;
  }
}
