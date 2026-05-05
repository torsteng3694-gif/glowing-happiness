"use client";

import { useState } from "react";
import { Button, Card, Spinner } from "@/components/ui";
import { Check, RefreshCw, Play, SkipForward, AlertTriangle, FastForward } from "lucide-react";
import { STEP_BY_KEY_V3, STEP_KEYS_V3 } from "@/lib/comic-v3/steps";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import AssetWorkbench from "./AssetWorkbench";
import AssetSkeletonWorkbench from "./AssetSkeletonWorkbench";
import ShotWorkbench from "./ShotWorkbench";
import type { ProjectSnapshot, StepRow, Candidate, AssetRow, ShotRow } from "./types";

type Props = {
  snapshot: ProjectSnapshot | null;
  step: StepRow | null;
  actionPending: string | null;
  onRun: () => Promise<unknown>;
  onPick: (candidateId: string) => Promise<unknown>;
  onEdit: (patch: Record<string, unknown>) => Promise<unknown>;
  onConfirm: () => Promise<unknown>;
  onSkip: () => Promise<unknown>;
  onRetry: () => Promise<unknown>;
};

export default function StepWorkspace(props: Props) {
  const { step, snapshot, actionPending } = props;

  if (!step) {
    return (
      <Card className="p-12 text-center text-slate-500 text-sm">加载中…</Card>
    );
  }

  const def = STEP_BY_KEY_V3[step.stepKey];
  const projectId = snapshot?.id ?? "";
  // assets_plan 和 assets_render 两个 step 都需要把 ComicAssetV3 列表传下去
  const isAssetsRelated =
    step.stepKey === STEP_KEYS_V3.ASSETS_PLAN ||
    step.stepKey === STEP_KEYS_V3.ASSETS_RENDER;
  const assetsForStep = isAssetsRelated ? snapshot?.assets ?? [] : null;
  // storyboard step 用 shots
  const isStoryboardStep = step.stepKey === STEP_KEYS_V3.STORYBOARD;
  const shotsForStep = isStoryboardStep ? snapshot?.shots ?? [] : null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">{def?.title || step.stepKey}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                第 {step.stepIndex + 1} 步 / 共 10 步
              </span>
              {step.runCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  已重跑 {step.runCount} 次
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{def?.subtitle}</p>
          </div>
        </div>

        {/* 错误提示 */}
        {step.errorMessage && step.status === "failed" && (
          <div className="mt-4 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">执行失败</div>
              <div className="text-xs mt-0.5 break-all">{step.errorMessage}</div>
            </div>
          </div>
        )}

        {/* 状态分支：渲染对应 UI */}
        <div className="mt-5">
          {step.status === "pending" && <PendingPanel onRun={props.onRun} pending={!!actionPending} canSkip={!!def?.canSkip} onSkip={props.onSkip} />}
          {step.status === "running" && (
            <RunningPanel
              step={step}
              projectId={projectId}
              assets={assetsForStep}
              shots={shotsForStep}
              progress={step.progress}
            />
          )}
          {step.status === "awaiting_user" && (
            <AwaitingUserPanel
              step={step}
              projectId={projectId}
              assets={assetsForStep}
              shots={shotsForStep}
              actionPending={!!actionPending}
              canSkip={!!def?.canSkip}
              onPick={props.onPick}
              onEdit={props.onEdit}
              onConfirm={props.onConfirm}
              onSkip={props.onSkip}
              onRetry={props.onRetry}
            />
          )}
          {step.status === "succeeded" && (
            <SucceededPanel
              step={step}
              projectId={projectId}
              assets={assetsForStep}
              shots={shotsForStep}
              actionPending={!!actionPending}
              onRetry={props.onRetry}
            />
          )}
          {step.status === "failed" && (
            <FailedPanel actionPending={!!actionPending} onRetry={props.onRetry} canSkip={!!def?.canSkip} onSkip={props.onSkip} />
          )}
          {step.status === "skipped" && <SkippedPanel />}
        </div>
      </Card>
    </div>
  );
}

/* ============================================================
 * 子面板
 * ============================================================ */

function PendingPanel({
  onRun,
  pending,
  canSkip,
  onSkip,
}: {
  onRun: () => Promise<unknown>;
  pending: boolean;
  canSkip: boolean;
  onSkip: () => Promise<unknown>;
}) {
  return (
    <div className="text-center py-8">
      <div className="text-sm text-slate-500 mb-4">这一步还未开始执行</div>
      <div className="inline-flex gap-2">
        <Button onClick={() => onRun()} loading={pending} variant="glow">
          <Play className="w-4 h-4" /> 执行此步
        </Button>
        {canSkip && (
          <Button onClick={() => onSkip()} variant="outline" disabled={pending}>
            <SkipForward className="w-4 h-4" /> 跳过
          </Button>
        )}
      </div>
    </div>
  );
}

function RunningPanel({
  step,
  projectId,
  assets,
  shots,
  progress,
}: {
  step: StepRow;
  projectId: string;
  assets: AssetRow[] | null;
  shots: ShotRow[] | null;
  progress: number;
}) {
  const isAssetsPlanStep = step.stepKey === STEP_KEYS_V3.ASSETS_PLAN;
  const isAssetsRenderStep = step.stepKey === STEP_KEYS_V3.ASSETS_RENDER;
  const isStoryboardStep = step.stepKey === STEP_KEYS_V3.STORYBOARD;

  const showAssetsLive =
    (isAssetsPlanStep || isAssetsRenderStep) && assets && assets.length > 0;
  const showShotsLive = isStoryboardStep && shots && shots.length > 0;

  // 计算已生成 / 总计
  const assetsStats = (() => {
    if (!isAssetsRenderStep || !assets || assets.length === 0) return null;
    const total = assets.length;
    const withCands = assets.filter((a) => a.candidates && a.candidates.length > 0).length;
    const generating = assets.filter((a) => a.genStatus === "generating").length;
    const failed = assets.filter((a) => a.genStatus === "failed").length;
    const totalImages = assets.reduce((s, a) => s + (a.candidates?.length || 0), 0);
    return { total, withCands, generating, failed, totalImages };
  })();
  const shotsStats = (() => {
    if (!isStoryboardStep || !shots || shots.length === 0) return null;
    const total = shots.length;
    const ready = shots.filter((s) => s.genStatus === "ready").length;
    const generating = shots.filter((s) => s.genStatus === "generating").length;
    const failed = shots.filter((s) => s.genStatus === "failed").length;
    return { total, ready, generating, failed };
  })();

  return (
    <div className="space-y-4">
      {/* 顶部进度条 + 实时统计 */}
      <div className="rounded-lg bg-violet-50 border border-violet-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <Spinner className="w-4 h-4 text-violet-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-violet-900">
              {isAssetsRenderStep
                ? "正在生图，已生成的可立即查看 / 挑选"
                : isAssetsPlanStep
                  ? "正在推导 imagePrompt…"
                  : isStoryboardStep
                    ? "正在生成分镜与关键帧，已就绪的可立即查看 / 重生成"
                    : "正在执行…"}
            </div>
            {assetsStats && (
              <div className="text-xs text-violet-700/80 mt-0.5">
                {assetsStats.withCands}/{assetsStats.total} 个资产已出图 ·{" "}
                共 {assetsStats.totalImages} 张
                {assetsStats.generating > 0 && ` · ${assetsStats.generating} 个生成中`}
                {assetsStats.failed > 0 && ` · ${assetsStats.failed} 个失败`}
              </div>
            )}
            {shotsStats && (
              <div className="text-xs text-violet-700/80 mt-0.5">
                {shotsStats.ready}/{shotsStats.total} 个分镜已就绪
                {shotsStats.generating > 0 && ` · ${shotsStats.generating} 生成中`}
                {shotsStats.failed > 0 && ` · ${shotsStats.failed} 失败`}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-violet-200/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
            style={{ width: `${Math.max(8, progress)}%` }}
          />
        </div>
      </div>

      {/* 实时 workbench */}
      {showAssetsLive && isAssetsPlanStep && (
        <AssetSkeletonWorkbench projectId={projectId} assets={assets} />
      )}
      {showAssetsLive && isAssetsRenderStep && (
        <AssetWorkbench projectId={projectId} assets={assets} />
      )}
      {showShotsLive && (
        <ShotWorkbench projectId={projectId} shots={shots} />
      )}

      {/* 非 assets/storyboard 类 / 还没有数据：纯文字提示 */}
      {!showAssetsLive && !showShotsLive && (
        <div className="text-center py-8 text-sm text-slate-500">
          后台正在执行，完成后会自动展示结果
        </div>
      )}
    </div>
  );
}

function AwaitingUserPanel({
  step,
  projectId,
  assets,
  shots,
  actionPending,
  canSkip,
  onPick,
  onEdit,
  onConfirm,
  onSkip,
  onRetry,
}: {
  step: StepRow;
  projectId: string;
  assets: AssetRow[] | null;
  shots: ShotRow[] | null;
  actionPending: boolean;
  canSkip: boolean;
  onPick: (id: string) => Promise<unknown>;
  onEdit: (patch: Record<string, unknown>) => Promise<unknown>;
  onConfirm: () => Promise<unknown>;
  onSkip: () => Promise<unknown>;
  onRetry: () => Promise<unknown>;
}) {
  const candidates: Candidate[] = step.candidates || [];
  const picked = candidates.find((c) => c.id === step.pickedCandidateId) ?? candidates[0] ?? null;

  const isAssetsPlanStep = step.stepKey === STEP_KEYS_V3.ASSETS_PLAN;
  const isAssetsRenderStep = step.stepKey === STEP_KEYS_V3.ASSETS_RENDER;
  const isAssetsRelated = isAssetsPlanStep || isAssetsRenderStep;
  const isStoryboardStep = step.stepKey === STEP_KEYS_V3.STORYBOARD;

  // 各 step 的"准备就绪"判定
  const allReady = (() => {
    if (isAssetsPlanStep)
      return !assets || assets.length === 0 || assets.every((a) => !!a.imagePrompt);
    if (isAssetsRenderStep)
      return !assets || assets.length === 0 || assets.every((a) => !!a.pickedUrl);
    if (isStoryboardStep)
      return !shots || shots.length === 0 || shots.every((s) => !!s.keyframeUrl);
    return true;
  })();

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
        ⏸ 等待你的决定 ·{" "}
        {isAssetsPlanStep
          ? "审阅每个资产的 imagePrompt，必要时编辑，然后点击「确认继续」进入生图阶段"
          : isAssetsRenderStep
            ? "为每个角色/场景挑选满意的候选图，然后点击「确认继续」"
            : isStoryboardStep
              ? "审阅分镜与关键帧，对不满意的镜单独编辑/重生成/换模型；全部就绪后点击「确认继续」"
              : "选择满意的候选并点击「确认继续」，或重跑 / 跳过"}
      </div>

      {/* assets_plan：骨架审改 UI */}
      {isAssetsPlanStep && assets && (
        <AssetSkeletonWorkbench projectId={projectId} assets={assets} />
      )}

      {/* assets_render：挑图 UI */}
      {isAssetsRenderStep && assets && (
        <AssetWorkbench projectId={projectId} assets={assets} />
      )}

      {/* storyboard：分镜工作台 */}
      {isStoryboardStep && shots && (
        <ShotWorkbench projectId={projectId} shots={shots} />
      )}

      {!isAssetsRelated && !isStoryboardStep && candidates.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              selected={c.id === step.pickedCandidateId}
              onPick={() => onPick(c.id)}
              disabled={actionPending}
            />
          ))}
        </div>
      )}

      {/* 单候选 / 选中候选预览（assets_plan/assets_render/storyboard 已用工作台替代，不再重复展示 mdSummary） */}
      {!isAssetsRelated && !isStoryboardStep && picked && (
        <Card className="bg-slate-50/60 p-4">
          <div className="text-xs font-medium text-slate-500 mb-2">
            {candidates.length > 1 ? "已选候选预览" : "本步产出"}
          </div>
          {picked.mdSummary ? (
            <MarkdownMessage content={picked.mdSummary} className="text-sm" />
          ) : (
            <pre className="text-xs bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto">
              {JSON.stringify(picked.data, null, 2)}
            </pre>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button
          onClick={() => onConfirm()}
          loading={actionPending}
          variant="glow"
          disabled={!step.pickedCandidateId || !allReady}
          title={
            isAssetsPlanStep && !allReady
              ? "请先为每个资产生成或填写 imagePrompt"
              : isAssetsRenderStep && !allReady
                ? "请先为每个资产挑选一张图"
                : isStoryboardStep && !allReady
                  ? "请先为每个分镜生成关键帧（不满意可单镜重生成）"
                  : undefined
          }
        >
          <Check className="w-4 h-4" /> 确认继续
        </Button>
        <Button onClick={() => onRetry()} variant="outline" disabled={actionPending}>
          <RefreshCw className="w-4 h-4" /> 重跑此步
        </Button>
        {canSkip && (
          <Button onClick={() => onSkip()} variant="outline" disabled={actionPending}>
            <SkipForward className="w-4 h-4" /> 跳过
          </Button>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  selected,
  onPick,
  disabled,
}: {
  candidate: Candidate;
  selected: boolean;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={
        "text-left rounded-xl border p-3 transition cursor-pointer disabled:opacity-60 " +
        (selected
          ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40"
          : "border-slate-200 hover:border-violet-300 bg-white")
      }
    >
      <div className="flex items-start gap-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono shrink-0">
          {candidate.id.slice(0, 8)}
        </span>
        {selected && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium shrink-0">
            已选
          </span>
        )}
      </div>
      <div className="mt-2 text-xs text-slate-700 line-clamp-6 prose-chat">
        {candidate.mdSummary ? (
          <MarkdownMessage content={candidate.mdSummary} className="text-xs" />
        ) : (
          <pre className="text-[11px] bg-slate-50 p-2 rounded">
            {JSON.stringify(candidate.data, null, 2).slice(0, 240)}
          </pre>
        )}
      </div>
    </button>
  );
}

function SucceededPanel({
  step,
  projectId,
  assets,
  shots,
  actionPending,
  onRetry,
}: {
  step: StepRow;
  projectId: string;
  assets: AssetRow[] | null;
  shots: ShotRow[] | null;
  actionPending: boolean;
  onRetry: () => Promise<unknown>;
}) {
  const isAssetsPlanStep = step.stepKey === STEP_KEYS_V3.ASSETS_PLAN;
  const isAssetsRenderStep = step.stepKey === STEP_KEYS_V3.ASSETS_RENDER;
  const isStoryboardStep = step.stepKey === STEP_KEYS_V3.STORYBOARD;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
        <Check className="w-4 h-4" /> 此步已完成
        {step.cost > 0 && <span className="text-emerald-600">· 花费 ¥{step.cost.toFixed(4)}</span>}
      </div>

      {isAssetsPlanStep && assets ? (
        <AssetSkeletonWorkbench projectId={projectId} assets={assets} />
      ) : isAssetsRenderStep && assets ? (
        <AssetWorkbench projectId={projectId} assets={assets} />
      ) : isStoryboardStep && shots ? (
        <ShotWorkbench projectId={projectId} shots={shots} />
      ) : (
        <Card className="bg-slate-50/60 p-4">
          {step.outputMd ? (
            <MarkdownMessage content={step.outputMd} className="text-sm" />
          ) : (
            <pre className="text-xs bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto max-h-96">
              {JSON.stringify(step.output, null, 2)}
            </pre>
          )}
        </Card>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={() => onRetry()} variant="outline" disabled={actionPending} loading={actionPending}>
          <RefreshCw className="w-4 h-4" /> 重跑此步（会再次扣费）
        </Button>
      </div>
    </div>
  );
}

function FailedPanel({
  actionPending,
  onRetry,
  canSkip,
  onSkip,
}: {
  actionPending: boolean;
  onRetry: () => Promise<unknown>;
  canSkip: boolean;
  onSkip: () => Promise<unknown>;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Button onClick={() => onRetry()} loading={actionPending} variant="glow">
        <RefreshCw className="w-4 h-4" /> 重试
      </Button>
      {canSkip && (
        <Button onClick={() => onSkip()} variant="outline" disabled={actionPending}>
          <SkipForward className="w-4 h-4" /> 跳过
        </Button>
      )}
    </div>
  );
}

function SkippedPanel() {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500 flex items-center gap-2">
      <FastForward className="w-4 h-4" /> 此步已被跳过
    </div>
  );
}
