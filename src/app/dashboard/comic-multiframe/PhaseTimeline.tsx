"use client";

import { useState } from "react";
import { Check, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import type { ProjectState, StepRow } from "./types";
import { PHASES, STEP_LABEL, phaseOfStep } from "./types";
import StepArtifactView from "./StepArtifactView";

/**
 * 4 阶段时间轴：
 *   - 顶部：4 个大节点 + 连线，进度填充
 *   - 各节点点开（展开抽屉）：列出该阶段的子步骤 + 各自产物
 *   - 当前正在跑的 phase 节点呼吸动画
 *
 * 进度算法：
 *   succeeded/skipped 算 1，running 算 0.5，否则 0；按子步骤数加权
 */
export default function PhaseTimeline({
  project,
  runningStep,
  onRun,
  onSkip,
}: {
  project: ProjectState | null;
  runningStep: boolean;
  onRun: (stepKey?: string) => void;
  onSkip: (stepKey: string) => void;
}) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  // 计算每个阶段的状态摘要
  const phaseInfo = PHASES.map((p) => {
    const rows = project ? project.steps.filter((s) => p.steps.includes(s.stepKey)) : [];
    const total = p.steps.length;
    let done = 0;
    let runningInPhase = false;
    let failed = false;
    for (const r of rows) {
      if (r.status === "succeeded" || r.status === "skipped") done += 1;
      else if (r.status === "running") {
        runningInPhase = true;
        done += 0.5;
      } else if (r.status === "failed") {
        failed = true;
      }
    }
    const pct = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
    let state: "pending" | "running" | "done" | "failed" = "pending";
    if (failed) state = "failed";
    else if (pct >= 100) state = "done";
    else if (runningInPhase || (project?.currentStep && p.steps.includes(project.currentStep)))
      state = "running";
    return { def: p, rows, pct, state };
  });

  return (
    <div className="rounded-3xl bg-white/95 backdrop-blur border border-slate-200 shadow-xl shadow-slate-200/40 px-6 py-6 lg:px-10 lg:py-8">
      {/* 顶部：4 阶段节点 */}
      <div className="relative">
        <div className="absolute left-[5%] right-[5%] top-1/2 -translate-y-1/2 h-px bg-slate-200" />
        <div className="relative grid grid-cols-4 gap-4">
          {phaseInfo.map((info) => {
            const isExpanded = expandedPhase === info.def.id;
            return (
              <button
                key={info.def.id}
                onClick={() => setExpandedPhase(isExpanded ? null : info.def.id)}
                className="flex flex-col items-center text-center group"
              >
                <PhaseDot state={info.state} pct={info.pct} />
                <div className="mt-3 flex items-center gap-1">
                  <span
                    className={[
                      "text-sm font-medium",
                      info.state === "running"
                        ? "text-cyan-700"
                        : info.state === "done"
                        ? "text-emerald-700"
                        : info.state === "failed"
                        ? "text-rose-700"
                        : "text-slate-500",
                    ].join(" ")}
                  >
                    {info.def.label}
                  </span>
                  <ChevronRight
                    className={[
                      "w-3 h-3 text-slate-300 transition-transform",
                      isExpanded ? "rotate-90 text-slate-500" : "group-hover:text-slate-500",
                    ].join(" ")}
                  />
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{info.def.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 中部：当前阶段文案 */}
      {project && (
        <CurrentPhaseChip
          project={project}
          phaseInfo={phaseInfo}
          onRun={onRun}
          runningStep={runningStep}
        />
      )}

      {/* 展开区：该阶段所有子步骤 */}
      {expandedPhase && project && (
        <div className="mt-6 border-t border-slate-100 pt-6 space-y-3">
          {(phaseInfo.find((p) => p.def.id === expandedPhase)?.rows || []).map((row, i) => (
            <SubStepRow
              key={row.stepKey}
              step={row}
              index={i}
              phaseStartIndex={phaseStartIndexOf(row.stepKey)}
              runningStep={runningStep}
              onRun={onRun}
              onSkip={onSkip}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- 当前阶段中央 chip ---------- */
function CurrentPhaseChip({
  project,
  phaseInfo,
  onRun,
  runningStep,
}: {
  project: ProjectState;
  phaseInfo: { def: { id: string; label: string }; state: string }[];
  onRun: (stepKey?: string) => void;
  runningStep: boolean;
}) {
  const cur = project.currentStep;
  const phase = cur ? phaseOfStep(cur) : null;
  const phaseLabel = phase ? phaseInfo.find((p) => p.def.id === phase)?.def.label : null;
  const runningPhase = phaseInfo.find((p) => p.state === "running");

  const text = (() => {
    if (project.status === "completed") return "🎬 全部步骤已完成，可下载成片";
    if (project.status === "failed") return `⚠ 当前在「${phaseLabel || "—"}」步骤失败，可重试`;
    if (project.isRunning) return `正在「${phaseLabel || "唤醒"}」阶段 · ${cur ? STEP_LABEL[cur] : "AI 创作引擎启动中…"}`;
    if (runningStep) return `正在执行「${cur ? STEP_LABEL[cur] : ""}」`;
    if (cur) return `等待执行「${STEP_LABEL[cur]}」`;
    return "正在唤醒 AI 创作引擎…";
  })();

  const showAction =
    !project.isRunning &&
    !runningStep &&
    project.status !== "completed" &&
    cur;

  return (
    <div className="mt-6 flex items-center justify-center gap-3">
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100/80 border border-slate-200 text-xs text-slate-700">
        {project.isRunning || runningPhase?.state === "running" ? (
          <Loader2 className="w-3.5 h-3.5 text-cyan-600 animate-spin" />
        ) : project.status === "failed" ? (
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
        ) : project.status === "completed" ? (
          <Check className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
        )}
        {text}
      </div>
      {showAction && (
        <button
          onClick={() => onRun()}
          disabled={runningStep}
          className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow disabled:opacity-60"
        >
          执行下一步
        </button>
      )}
    </div>
  );
}

/* ---------- 节点圆点 ---------- */
function PhaseDot({
  state,
  pct,
}: {
  state: "pending" | "running" | "done" | "failed";
  pct: number;
}) {
  const sz = 44;
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, pct) / 100) * c;

  const ringColor =
    state === "done"
      ? "stroke-emerald-500"
      : state === "running"
      ? "stroke-cyan-500"
      : state === "failed"
      ? "stroke-rose-500"
      : "stroke-slate-200";

  return (
    <div className="relative" style={{ width: sz, height: sz }}>
      {/* 背景圆 */}
      <svg viewBox="0 0 44 44" className="absolute inset-0">
        <circle cx="22" cy="22" r={r} className="fill-white stroke-slate-200" strokeWidth="2" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          className={ringColor}
          strokeWidth="2.5"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {state === "done" ? (
          <Check className="w-5 h-5 text-emerald-600" />
        ) : state === "running" ? (
          <span className="relative flex">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
            <span className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          </span>
        ) : state === "failed" ? (
          <AlertTriangle className="w-4 h-4 text-rose-600" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-slate-300" />
        )}
      </div>
    </div>
  );
}

/* ---------- 子步骤行（展开后） ---------- */
function SubStepRow({
  step,
  index,
  phaseStartIndex,
  runningStep,
  onRun,
  onSkip,
}: {
  step: StepRow;
  index: number;
  phaseStartIndex: number;
  runningStep: boolean;
  onRun: (stepKey?: string) => void;
  onSkip: (stepKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const SKIPPABLE = new Set([
    "direction_pick",
    "direction_refine",
    "direction_extract",
    "novel_adapt",
  ]);
  const hasArtifact =
    step.status === "succeeded" &&
    (step.output != null || (step.artifacts && step.artifacts.length > 0));

  const statusColor: Record<string, string> = {
    pending: "bg-slate-200 text-slate-500",
    running: "bg-cyan-100 text-cyan-700",
    succeeded: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
    skipped: "bg-slate-100 text-slate-400",
  };

  return (
    <div
      className={[
        "rounded-xl border transition",
        step.status === "running"
          ? "border-cyan-300 bg-cyan-50/40"
          : step.status === "failed"
          ? "border-rose-200 bg-rose-50/40"
          : "border-slate-200 bg-white",
      ].join(" ")}
    >
      <div className="px-3 py-2.5 flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-mono flex items-center justify-center shrink-0">
          {String(phaseStartIndex + index + 1).padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-800 font-medium truncate">
              {STEP_LABEL[step.stepKey] || step.stepKey}
            </span>
            {(step.cost ?? 0) > 0 && (
              <span className="text-[10px] text-slate-400">¥{(step.cost ?? 0).toFixed(4)}</span>
            )}
          </div>
          {step.errorMessage && (
            <details className="text-[11px] text-rose-600 mt-0.5 group">
              <summary className="cursor-pointer truncate list-none flex items-center gap-1 hover:text-rose-700">
                <ChevronRight className="w-3 h-3 group-open:rotate-90 transition shrink-0" />
                <span className="truncate">{step.errorMessage}</span>
              </summary>
              <div className="mt-1 pl-4 text-rose-600/80 whitespace-pre-wrap break-all bg-rose-50/60 rounded p-2 border border-rose-100">
                {step.errorMessage}
              </div>
            </details>
          )}
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusColor[step.status]}`}>
          {step.status === "running" && (
            <span className="inline-block w-2 h-2 mr-1 rounded-full bg-cyan-500 animate-pulse align-middle" />
          )}
          {step.status}
        </span>
        {hasArtifact && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700"
          >
            {open ? "收起" : "查看"}
          </button>
        )}
        {step.status === "failed" && (
          <button
            onClick={() => onRun(step.stepKey)}
            disabled={runningStep}
            className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 disabled:opacity-60"
          >
            重试
          </button>
        )}
        {step.status === "pending" && SKIPPABLE.has(step.stepKey) && (
          <button
            onClick={() => onSkip(step.stepKey)}
            className="text-[11px] text-slate-400 hover:text-slate-700"
          >
            跳过
          </button>
        )}
      </div>

      {open && hasArtifact && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/40">
          <StepArtifactView
            stepKey={step.stepKey}
            output={step.output}
            artifacts={step.artifacts || null}
          />
        </div>
      )}
    </div>
  );
}

function phaseStartIndexOf(stepKey: string): number {
  let count = 0;
  for (const p of PHASES) {
    if (p.steps.includes(stepKey)) return count;
    count += p.steps.length;
  }
  return 0;
}
