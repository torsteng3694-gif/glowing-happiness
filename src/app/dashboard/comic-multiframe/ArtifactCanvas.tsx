"use client";

import { Copy, Sparkles } from "lucide-react";
import type { ProjectState, StepRow } from "./types";
import { STEP_LABEL } from "./types";
import StepArtifactView from "./StepArtifactView";
import { useMemo, useState } from "react";

/**
 * 顶部"画板"区：
 *   - 大预览区（左）：展示当前选中卡片的产物（图/视频/文本）
 *   - 卡堆栈（右）：所有 succeeded 步骤的产物缩略，按时间倒序
 *   - 项目未启动 / 跑步骤中 → 显示空态/加载文案
 */
export default function ArtifactCanvas({
  project,
  initialPrompt,
}: {
  project: ProjectState | null;
  initialPrompt: string;
}) {
  // 把 succeeded 步骤按 stepIndex 正序展开为可选卡片
  const cards = useMemo<StepRow[]>(() => {
    if (!project) return [];
    return project.steps.filter(
      (s) => s.status === "succeeded" && (s.output != null || (s.artifacts && s.artifacts.length > 0)),
    );
  }, [project]);

  const [activeKey, setActiveKey] = useState<string | null>(null);

  // 默认选最新一张（succeeded 最末尾）
  const effectiveKey = activeKey || cards[cards.length - 1]?.stepKey || null;
  const active = cards.find((c) => c.stepKey === effectiveKey) || null;

  return (
    <div className="relative rounded-3xl bg-white/95 backdrop-blur border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
      <div className="relative grid grid-cols-1 lg:grid-cols-12 min-h-[300px]">
        {/* —— 左：主预览 —— */}
        <div className="lg:col-span-9 p-6 lg:p-8 relative">
          {!project && <CanvasEmpty initialPrompt={initialPrompt} />}

          {project && cards.length === 0 && (
            <CanvasAwaiting project={project} initialPrompt={initialPrompt} />
          )}

          {project && active && (
            <CanvasPreview project={project} step={active} />
          )}
        </div>

        {/* —— 右：缩略堆栈 —— */}
        <div className="lg:col-span-3 border-l border-slate-100 p-4 bg-slate-50/40">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-2">产物</div>
          {cards.length === 0 ? (
            <div className="text-xs text-slate-400">暂无产物</div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {[...cards].reverse().map((c) => {
                const thumb = pickThumb(c);
                const selected = c.stepKey === effectiveKey;
                return (
                  <button
                    key={c.stepKey}
                    onClick={() => setActiveKey(c.stepKey)}
                    className={[
                      "w-full text-left rounded-xl overflow-hidden border transition group relative",
                      selected
                        ? "border-cyan-300 ring-2 ring-cyan-200/60 shadow"
                        : "border-slate-200 hover:border-slate-300",
                    ].join(" ")}
                  >
                    <div className="aspect-[3/4] bg-slate-100 relative">
                      {thumb.kind === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb.url}
                          alt={STEP_LABEL[c.stepKey]}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {thumb.kind === "video" && (
                        <video src={thumb.url} muted className="w-full h-full object-cover" />
                      )}
                      {thumb.kind === "text" && (
                        <div className="w-full h-full bg-gradient-to-br from-cyan-50 to-fuchsia-50 flex flex-col items-center justify-center p-3">
                          <Sparkles className="w-5 h-5 text-cyan-500 mb-1.5" />
                          <div className="text-[11px] text-slate-500 text-center line-clamp-3">
                            {thumb.summary}
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 right-1 bg-white/85 backdrop-blur text-[10px] text-slate-700 rounded px-1.5 py-0.5 truncate text-center">
                        {STEP_LABEL[c.stepKey]}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- 空态：从未提交过 ---------- */
function CanvasEmpty({ initialPrompt }: { initialPrompt: string }) {
  return (
    <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-100 to-emerald-100 flex items-center justify-center mb-4">
        <Sparkles className="w-7 h-7 text-cyan-600" />
      </div>
      <div className="text-slate-500 text-sm max-w-md">
        {initialPrompt
          ? "已读取你的故事点子，点下方「开始酝酿」让 AI 创作引擎为你产出第一个画面。"
          : "在下方输入故事点子，AI 漫剧 S2.0 会为你逐步生成意图分析、剧本、分镜、关键帧到成片。"}
      </div>
    </div>
  );
}

/* ---------- 等待态：项目已建但还没产物 ---------- */
function CanvasAwaiting({
  project,
  initialPrompt,
}: {
  project: ProjectState;
  initialPrompt: string;
}) {
  const isRunning = project.isRunning || project.status === "running";
  return (
    <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center">
      <div className="relative w-14 h-14 mb-4">
        <div className="absolute inset-0 rounded-full bg-cyan-200/40 animate-ping" />
        <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white shadow-lg">
          <Sparkles className="w-7 h-7" />
        </div>
      </div>
      <div className="text-slate-700 text-sm font-medium">
        {isRunning ? "正在唤醒 AI 创作引擎…" : "AI 已准备就绪"}
      </div>
      <div className="text-slate-400 text-xs mt-1.5 max-w-md line-clamp-2">{initialPrompt}</div>
    </div>
  );
}

/* ---------- 主预览：展示选中步骤的产物 ---------- */
function CanvasPreview({ project: _project, step }: { project: ProjectState; step: StepRow }) {
  const thumb = pickThumb(step);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider">当前预览</span>
          <span className="text-sm font-semibold text-slate-800">{STEP_LABEL[step.stepKey]}</span>
        </div>
        <button
          onClick={() => copyArtifact(thumb)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
        >
          <Copy className="w-3 h-3" />
          复制
        </button>
      </div>

      {/* 大预览：图/视频用大尺寸；文本类落到内容区 */}
      {thumb.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb.url}
          alt={STEP_LABEL[step.stepKey]}
          className="w-full max-h-[420px] rounded-xl object-contain bg-slate-50 border border-slate-100"
        />
      )}
      {thumb.kind === "video" && (
        <video
          src={thumb.url}
          poster={thumb.poster}
          controls
          className="w-full max-h-[420px] rounded-xl bg-black"
        />
      )}
      {thumb.kind === "text" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 max-h-[420px] overflow-y-auto">
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

/* ---------- 工具：从 step 抽取首张缩略 ---------- */
type Thumb =
  | { kind: "image"; url: string; summary?: string }
  | { kind: "video"; url: string; poster?: string; summary?: string }
  | { kind: "text"; summary: string };

function pickThumb(step: StepRow): Thumb {
  const arts = step.artifacts || [];
  const firstImg = arts.find((a) => a.type === "image");
  const firstVid = arts.find((a) => a.type === "video");
  // video_compose 优先用 output.videoUrl
  if (step.stepKey === "video_compose") {
    const vc = (step.output || {}) as { videoUrl?: string; coverUrl?: string };
    if (vc.videoUrl) return { kind: "video", url: vc.videoUrl, poster: vc.coverUrl };
  }
  if (firstVid) return { kind: "video", url: firstVid.url };
  if (firstImg) return { kind: "image", url: firstImg.url };
  // 文本类：用 stepKey 派生一段摘要
  const summary = textSummaryOf(step);
  return { kind: "text", summary };
}

function textSummaryOf(step: StepRow): string {
  const o = step.output as Record<string, unknown> | null;
  if (!o) return STEP_LABEL[step.stepKey] || step.stepKey;
  switch (step.stepKey) {
    case "intent_analysis":
      return `${o.genre} · ${o.tone}`;
    case "direction_extract":
      return String(o.finalTitle || "");
    case "outline":
      return `共 ${(o as { totalChapters?: number }).totalChapters || 0} 章大纲`;
    case "novel_adapt":
      return `小说 · ${(o as { wordCount?: number }).wordCount || 0} 字`;
    case "script_breakdown":
      return `场景 ${((o as { scenes?: unknown[] }).scenes || []).length} 个`;
    case "storyboard_script":
      return `分镜 ${((o as { shots?: unknown[] }).shots || []).length} 个`;
    case "asset_match":
      return `镜资匹配 ${((o as { shotAssets?: unknown[] }).shotAssets || []).length} 条`;
    case "motion_prompt":
      return `视频提示词 ${((o as { items?: unknown[] }).items || []).length} 条`;
    default:
      return STEP_LABEL[step.stepKey] || step.stepKey;
  }
}

async function copyArtifact(thumb: Thumb) {
  try {
    if (thumb.kind === "text") {
      await navigator.clipboard.writeText(thumb.summary);
    } else {
      await navigator.clipboard.writeText(thumb.url);
    }
  } catch {
    // ignore
  }
}
