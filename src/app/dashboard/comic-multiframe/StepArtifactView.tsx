"use client";

import { useState } from "react";
import type {
  ArtifactItem,
  IntentAnalysisOutput,
  DirectionOutput,
  DirectionExtractOutput,
  OutlineOutput,
  NovelOutput,
  ScriptBreakdownOutput,
  SubjectBindingOutput,
  StoryboardScriptOutput,
  AssetMatchOutput,
  MotionPromptOutput,
  VideoComposeOutput,
  KeyframesOutput,
} from "./types";

/**
 * 按 stepKey 分发到对应可视化渲染器。
 * 用于详情抽屉、阶段时间轴展开区。
 */
export default function StepArtifactView({
  stepKey,
  output,
  artifacts,
}: {
  stepKey: string;
  output: unknown;
  artifacts: ArtifactItem[] | null;
}) {
  const o = output as Record<string, unknown> | null;
  if (!o && (!artifacts || artifacts.length === 0)) {
    return <div className="text-xs text-slate-400">（暂无产物）</div>;
  }

  switch (stepKey) {
    case "intent_analysis":
      return <IntentAnalysisView data={o as unknown as IntentAnalysisOutput} />;
    case "direction_pick":
    case "direction_refine":
      return <DirectionView data={o as unknown as DirectionOutput} />;
    case "direction_extract":
      return <DirectionExtractView data={o as unknown as DirectionExtractOutput} />;
    case "outline":
      return <OutlineView data={o as unknown as OutlineOutput} />;
    case "novel_adapt":
      return <NovelView data={o as unknown as NovelOutput} />;
    case "script_breakdown":
      return <ScriptBreakdownView data={o as unknown as ScriptBreakdownOutput} />;
    case "subject_binding":
      return (
        <SubjectBindingView
          data={o as unknown as SubjectBindingOutput}
          artifacts={artifacts}
        />
      );
    case "storyboard_script":
      return <StoryboardScriptView data={o as unknown as StoryboardScriptOutput} />;
    case "asset_match":
      return <AssetMatchView data={o as unknown as AssetMatchOutput} />;
    case "keyframes":
      return <KeyframesView output={o as unknown as KeyframesOutput} artifacts={artifacts} />;
    case "motion_prompt":
      return <MotionPromptView data={o as unknown as MotionPromptOutput} />;
    case "video_gen":
      return <VideoGenView artifacts={artifacts} />;
    case "video_compose":
      return <VideoComposeView data={o as unknown as VideoComposeOutput} />;
    default:
      return <RawJSON data={o} />;
  }
}

/* ---------------- 共用 ---------------- */

function Chip({ children, color = "slate" }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-100",
    fuchsia: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
  };
  return (
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${map[color]}`}>
      {children}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">{children}</div>;
}

function RawJSON({ data }: { data: unknown }) {
  return (
    <pre className="text-[11px] bg-slate-900/95 text-slate-100 rounded-lg p-3 overflow-x-auto max-h-64">
{JSON.stringify(data, null, 2)}
    </pre>
  );
}

/* ---------------- 1. 意图分析 ---------------- */
function IntentAnalysisView({ data }: { data: IntentAnalysisOutput }) {
  if (!data) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
      <div>
        <FieldLabel>题材</FieldLabel>
        <Chip color="cyan">{data.genre}</Chip>
      </div>
      <div>
        <FieldLabel>受众</FieldLabel>
        <Chip color="emerald">{data.audience}</Chip>
      </div>
      <div className="md:col-span-2">
        <FieldLabel>核心冲突</FieldLabel>
        <div className="text-slate-700">{data.coreConflict}</div>
      </div>
      <div>
        <FieldLabel>基调</FieldLabel>
        <Chip color="amber">{data.tone}</Chip>
      </div>
      <div>
        <FieldLabel>主题词</FieldLabel>
        <div className="flex flex-wrap gap-1">
          {(data.themes || []).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      </div>
      <div className="md:col-span-2 mt-1 rounded-lg bg-cyan-50 border border-cyan-100 px-3 py-2">
        <FieldLabel>推荐创作方式</FieldLabel>
        <div className="text-cyan-800 font-medium">{data.recommendedApproach}</div>
      </div>
    </div>
  );
}

/* ---------------- 2/3. 创意方向 ---------------- */
function DirectionView({ data }: { data: DirectionOutput }) {
  if (!data?.candidates) return null;
  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">
        AI 自动选中：<Chip color="cyan">{data.selectedId}</Chip>{" "}
        <span className="text-slate-600">{data.reason}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {data.candidates.map((c) => {
          const selected = c.id === data.selectedId;
          return (
            <div
              key={c.id}
              className={[
                "rounded-lg border p-3 text-sm",
                selected
                  ? "border-cyan-400 bg-cyan-50/60 ring-2 ring-cyan-200/60"
                  : "border-slate-200 bg-white",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-slate-400">{c.id}</span>
                <span className="font-medium text-slate-800">{c.title}</span>
                {selected && <Chip color="cyan">已选</Chip>}
              </div>
              <div className="text-xs text-slate-600 leading-relaxed">{c.summary}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 4. 提炼方向 ---------------- */
function DirectionExtractView({ data }: { data: DirectionExtractOutput }) {
  if (!data) return null;
  return (
    <div className="rounded-lg bg-gradient-to-br from-cyan-50 to-emerald-50 border border-cyan-100 p-4">
      <div className="text-xs text-cyan-700 mb-1">{data.toneFinal}</div>
      <div className="text-lg font-bold text-slate-900">{data.finalTitle}</div>
      <div className="text-sm text-slate-700 italic mt-1">「{data.oneLineThesis}」</div>
      <div className="text-sm text-slate-600 mt-3 leading-relaxed">{data.premise}</div>
    </div>
  );
}

/* ---------------- 5. 创意大纲 ---------------- */
function OutlineView({ data }: { data: OutlineOutput }) {
  if (!data?.chapters) return null;
  const emotionColor: Record<string, string> = {
    rising: "amber",
    tense: "rose",
    climax: "fuchsia",
    calm: "emerald",
    resolution: "cyan",
  };
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">共 {data.totalChapters} 章</div>
      {data.chapters.map((c) => (
        <div key={c.index} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-mono flex items-center justify-center text-sm shrink-0">
            {c.index}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800">{c.title}</span>
              <Chip color={emotionColor[c.emotion] || "slate"}>{c.emotion}</Chip>
            </div>
            <div className="text-xs text-slate-600 mt-1 leading-relaxed">{c.summary}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- 6. 小说创作 ---------------- */
function NovelView({ data }: { data: NovelOutput }) {
  const [expand, setExpand] = useState(false);
  if (!data?.text) return null;
  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">字数：{data.wordCount}</div>
      <div
        className={[
          "text-sm text-slate-700 leading-relaxed whitespace-pre-wrap rounded-lg bg-white border border-slate-200 p-3",
          expand ? "" : "max-h-48 overflow-hidden relative",
        ].join(" ")}
      >
        {data.text}
        {!expand && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        )}
      </div>
      <button
        onClick={() => setExpand(!expand)}
        className="mt-2 text-xs text-cyan-600 hover:text-cyan-700"
      >
        {expand ? "收起" : "展开全文"}
      </button>
    </div>
  );
}

/* ---------------- 7. 剧本转换 ---------------- */
function ScriptBreakdownView({ data }: { data: ScriptBreakdownOutput }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.charactersPool && data.charactersPool.length > 0 && (
        <div>
          <FieldLabel>角色池</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {data.charactersPool.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-fuchsia-50 border border-fuchsia-100 text-fuchsia-700"
                title={c.description}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-fuchsia-400 truncate max-w-[160px]">{c.description}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div>
        <FieldLabel>场景（共 {data.scenes?.length || 0}）</FieldLabel>
        <div className="space-y-2">
          {data.scenes?.map((sc) => (
            <div key={sc.index} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-mono text-slate-400">SCENE {sc.index}</span>
                <Chip color="cyan">{sc.location}</Chip>
                <Chip color="amber">{sc.timeOfDay}</Chip>
                {sc.characters?.map((ch) => (
                  <Chip key={ch} color="fuchsia">{ch}</Chip>
                ))}
              </div>
              <div className="text-xs text-slate-700 leading-relaxed mb-2">{sc.action}</div>
              {sc.dialogues?.length > 0 && (
                <div className="space-y-0.5 border-l-2 border-slate-200 pl-3">
                  {sc.dialogues.map((d, i) => (
                    <div key={i} className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">{d.speaker}：</span>
                      {d.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 8. 资产提取 ---------------- */
function SubjectBindingView({
  data,
  artifacts,
}: {
  data: SubjectBindingOutput;
  artifacts: ArtifactItem[] | null;
}) {
  if (!data?.summary) return null;
  const okCount = data.summary.filter((c) => c.referenceUrl).length;
  const failCount = data.summary.length - okCount;
  return (
    <div>
      <div className="text-xs text-slate-500 mb-2 flex items-center gap-2 flex-wrap">
        <span>共 {data.summary.length} 个角色</span>
        {okCount > 0 && <Chip color="emerald">成功 {okCount}</Chip>}
        {failCount > 0 && <Chip color="rose">失败 {failCount}</Chip>}
        {artifacts && (
          <span className="text-slate-400">已上传 {artifacts.length} 张</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {data.summary.map((c) => (
          <div
            key={c.id}
            className={[
              "rounded-lg border overflow-hidden",
              c.referenceUrl
                ? "border-slate-200 bg-white"
                : "border-rose-200 bg-rose-50/40",
            ].join(" ")}
          >
            {c.referenceUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.referenceUrl}
                alt={c.name}
                className="w-full aspect-[3/4] object-cover bg-slate-100"
              />
            ) : (
              <div className="w-full aspect-[3/4] bg-gradient-to-br from-rose-50 to-rose-100/60 flex flex-col items-center justify-center p-3 text-center">
                <div className="w-8 h-8 rounded-full bg-rose-200/70 flex items-center justify-center mb-2">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-rose-600">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.5 3v4a.5.5 0 0 1-1 0V4a.5.5 0 0 1 1 0zM8 12a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z" />
                  </svg>
                </div>
                <div className="text-[11px] text-rose-700 font-medium">立绘生成失败</div>
                {c.error && (
                  <div
                    className="text-[10px] text-rose-500 mt-1 line-clamp-3"
                    title={c.error}
                  >
                    {c.error}
                  </div>
                )}
              </div>
            )}
            <div className="p-2">
              <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
              {c.visualAnchor && (
                <div className="text-[11px] text-slate-500 truncate" title={c.visualAnchor}>
                  {c.visualAnchor}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 9. 分镜脚本 ---------------- */
function StoryboardScriptView({ data }: { data: StoryboardScriptOutput }) {
  if (!data?.shots) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">共 {data.shots.length} 个分镜</div>
      {data.shots.map((s) => (
        <div key={s.index} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono text-slate-400">SHOT {s.index}</span>
            <Chip color="cyan">scene {s.sceneIndex}</Chip>
            <Chip color="amber">{s.durationSec}s</Chip>
          </div>
          <div className="text-xs text-slate-700 leading-relaxed">
            <span className="text-slate-400">image: </span>
            {s.imagePrompt}
          </div>
          {s.motionPrompt && (
            <div className="text-xs text-slate-700 leading-relaxed mt-1">
              <span className="text-slate-400">motion: </span>
              {s.motionPrompt}
            </div>
          )}
          {s.dialogue && (
            <div className="text-xs text-slate-800 mt-1.5 italic border-l-2 border-cyan-300 pl-2">
              {s.dialogue}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- 10. 匹配出镜资产 ---------------- */
function AssetMatchView({ data }: { data: AssetMatchOutput }) {
  if (!data?.shotAssets) return null;
  return (
    <div className="space-y-1.5">
      {data.shotAssets.map((a) => (
        <div key={a.shotIndex} className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-mono text-slate-400 w-12">SHOT {a.shotIndex}</span>
          {a.characterIds.length === 0 ? (
            <span className="text-slate-400">（无角色出镜）</span>
          ) : (
            a.characterIds.map((id) => (
              <Chip key={id} color="fuchsia">
                {id.slice(0, 8)}
              </Chip>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- 11. 关键帧 ---------------- */
function KeyframesView({
  output,
  artifacts,
}: {
  output: KeyframesOutput | null;
  artifacts: ArtifactItem[] | null;
}) {
  const items = artifacts && artifacts.length > 0 ? artifacts : output?.items || [];
  const failed = output?.failed || [];

  if (items.length === 0 && failed.length === 0)
    return <div className="text-xs text-slate-400">无关键帧</div>;

  // 把 success items 与 failed 项合并按 shotIndex 排序
  const successByShot = new Map<number, ArtifactItem>();
  for (const it of items) if (it.shotIndex != null) successByShot.set(it.shotIndex, it);
  const failedByShot = new Map<number, string>();
  for (const f of failed) failedByShot.set(f.shotIndex, f.error);

  const allShots = Array.from(
    new Set([...successByShot.keys(), ...failedByShot.keys()]),
  ).sort((a, b) => a - b);

  return (
    <div>
      <div className="text-xs text-slate-500 mb-2 flex items-center gap-2 flex-wrap">
        <span>分镜 {allShots.length} 个</span>
        {items.length > 0 && <Chip color="emerald">成功 {items.length}</Chip>}
        {failed.length > 0 && <Chip color="rose">失败 {failed.length}</Chip>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {allShots.map((shotIndex) => {
          const ok = successByShot.get(shotIndex);
          const err = failedByShot.get(shotIndex);
          if (ok) {
            return (
              <a
                key={shotIndex}
                href={ok.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg overflow-hidden border border-slate-200 bg-white hover:shadow-md transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ok.url}
                  alt={`shot-${shotIndex}`}
                  className="w-full aspect-video object-cover bg-slate-100"
                />
                <div className="p-1.5 text-[11px] text-slate-500">SHOT {shotIndex}</div>
              </a>
            );
          }
          return (
            <div
              key={shotIndex}
              className="rounded-lg overflow-hidden border border-rose-200 bg-rose-50/40"
            >
              <div className="w-full aspect-video bg-gradient-to-br from-rose-50 to-rose-100/60 flex flex-col items-center justify-center p-3 text-center">
                <div className="w-7 h-7 rounded-full bg-rose-200/70 flex items-center justify-center mb-1.5">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-rose-600">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.5 3v4a.5.5 0 0 1-1 0V4a.5.5 0 0 1 1 0zM8 12a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z" />
                  </svg>
                </div>
                <div className="text-[11px] text-rose-700 font-medium">生成失败</div>
                {err && (
                  <div className="text-[10px] text-rose-500 mt-1 line-clamp-2 max-w-[180px]" title={err}>
                    {err}
                  </div>
                )}
              </div>
              <div className="p-1.5 text-[11px] text-rose-600 bg-white border-t border-rose-100">
                SHOT {shotIndex}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 12. 视频提示词 ---------------- */
function MotionPromptView({ data }: { data: MotionPromptOutput }) {
  if (!data?.items) return null;
  return (
    <div className="space-y-1.5">
      {data.items.map((it) => (
        <div key={it.shotIndex} className="flex gap-3 text-xs">
          <span className="text-[10px] font-mono text-slate-400 w-12 shrink-0">
            SHOT {it.shotIndex}
          </span>
          <span className="text-slate-700 leading-relaxed flex-1">{it.motionPrompt}</span>
          <span className="text-slate-400 shrink-0">{it.durationSec}s</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- 13. 批量生成视频 ---------------- */
function VideoGenView({ artifacts }: { artifacts: ArtifactItem[] | null }) {
  if (!artifacts || artifacts.length === 0)
    return <div className="text-xs text-slate-400">无视频片段</div>;
  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">
        共 {artifacts.length} 段，总时长{" "}
        {artifacts.reduce((s, a) => s + (a.durationSec || 0), 0).toFixed(1)}s
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {artifacts.map((a, i) => (
          <div key={i} className="rounded-lg overflow-hidden border border-slate-200 bg-black">
            <video src={a.url} controls className="w-full aspect-video" />
            <div className="p-1.5 text-[11px] text-slate-300 bg-slate-800 flex items-center justify-between">
              <span>SHOT {a.shotIndex ?? i + 1}</span>
              <span>{a.durationSec?.toFixed(1)}s</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 14. 视频合成 ---------------- */
function VideoComposeView({ data }: { data: VideoComposeOutput }) {
  if (!data?.videoUrl) return null;
  return (
    <div>
      <video
        src={data.videoUrl}
        poster={data.coverUrl}
        controls
        className="w-full max-h-96 rounded-lg bg-black"
      />
      <div className="text-xs text-slate-500 mt-2">总时长：{data.durationSec?.toFixed(1)}s</div>
    </div>
  );
}
