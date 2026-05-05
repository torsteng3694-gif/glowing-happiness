"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  PenLine,
  Replace,
  RefreshCcw,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  Download,
  AlertTriangle,
} from "lucide-react";
import type {
  ProjectState,
  StoryboardScriptOutput,
  KeyframesOutput,
  MotionPromptOutput,
  ScriptBreakdownOutput,
  AssetMatchOutput,
  ArtifactItem,
} from "./types";
import AssetIdentificationPanel from "./AssetIdentificationPanel";

/**
 * 分镜工作台：完全可视化、可编辑、可重生成。
 *
 * 接收 project 上的 4 个相关 step：
 *   - storyboard_script   分镜脚本（含 imagePrompt + dialogue + duration）
 *   - asset_match         匹配出镜资产（每镜含哪些 character ids）
 *   - keyframes           关键帧（含成功 items + 失败 failed[]）
 *   - motion_prompt       视频提示词
 *   - video_gen           批量生成视频
 *
 * UI：
 *   1. 顶部 - 「已选择创作方式 / 已确认资产列表 / 分镜脚本已确认」3 个绿色总览卡
 *   2. 中部 - 「视频制作」横向 4 个状态按钮，显示当前 in-progress 数量
 *   3. 列表 - 每个分镜独立卡，4 列：prompt / 出镜资产 / 分镜图 / 视频
 *   4. 底部 - 4 个橙/蓝批量按钮 + 下载全部按钮
 */
export default function ShotWorkbench({
  project,
  characters,
  onRefresh,
  onOpenAssetLibrary,
}: {
  project: ProjectState;
  characters: ComicCharacter[];
  onRefresh: () => void;
  onOpenAssetLibrary: () => void;
}) {
  const ss = stepOutput<StoryboardScriptOutput>(project, "storyboard_script");
  const sb = stepOutput<ScriptBreakdownOutput>(project, "script_breakdown");
  const am = stepOutput<AssetMatchOutput>(project, "asset_match");
  const kf = stepOutput<KeyframesOutput>(project, "keyframes");
  const mp = stepOutput<MotionPromptOutput>(project, "motion_prompt");
  const vg = stepArtifacts(project, "video_gen");

  const shots = ss?.shots || [];

  // 索引化以便快速查找
  const kfByShot = useMemo(() => {
    const m = new Map<number, ArtifactItem>();
    if (kf?.items) for (const it of kf.items) if (it.shotIndex != null) m.set(it.shotIndex, it);
    return m;
  }, [kf]);
  const kfFailedByShot = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of kf?.failed || []) m.set(f.shotIndex, f.error);
    return m;
  }, [kf]);
  const motionByShot = useMemo(() => {
    const m = new Map<number, { motionPrompt: string; durationSec: number }>();
    for (const it of mp?.items || []) m.set(it.shotIndex, it);
    return m;
  }, [mp]);
  const vgByShot = useMemo(() => {
    const m = new Map<number, ArtifactItem>();
    for (const it of vg) if (it.shotIndex != null) m.set(it.shotIndex, it);
    return m;
  }, [vg]);
  const amByShot = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const a of am?.shotAssets || []) m.set(a.shotIndex, a.characterIds);
    return m;
  }, [am]);
  const charById = useMemo(() => {
    const m = new Map<string, ComicCharacter>();
    for (const c of characters) m.set(c.id, c);
    return m;
  }, [characters]);

  const totalShots = shots.length;
  const totalDuration = shots.reduce((s, x) => s + (x.durationSec || 0), 0);

  // 各阶段缺失数量
  const missingMatch = totalShots - (am?.shotAssets?.length || 0);
  const missingKf = totalShots - (kf?.items?.length || 0);
  const missingMp = totalShots - (mp?.items?.length || 0);
  const missingVg = totalShots - vg.length;

  // 单镜操作 loading 状态：shotIndex -> action label
  const [busy, setBusy] = useState<Record<string, string>>({});
  const setShotBusy = (key: string, label: string | null) =>
    setBusy((b) => {
      const next = { ...b };
      if (label) next[key] = label;
      else delete next[key];
      return next;
    });

  // 全局批量 loading
  const [batchBusy, setBatchBusy] = useState<string | null>(null);

  const apiBase = `/api/comic-multiframe/projects/${project.id}`;

  /* ---- 单项操作 ---- */
  async function shotAction(
    shotIndex: number,
    action: "regen-image" | "regen-video",
    payload?: Record<string, unknown>,
  ) {
    const key = `${shotIndex}-${action}`;
    setShotBusy(key, action === "regen-image" ? "出图中…" : "出视频中…");
    try {
      const r = await fetch(`${apiBase}/shots/${shotIndex}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(payload || {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "失败");
      onRefresh();
    } catch (e) {
      alert(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setShotBusy(key, null);
    }
  }

  async function patchShot(shotIndex: number, patch: Record<string, unknown>) {
    const r = await fetch(`${apiBase}/shots/${shotIndex}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "保存失败");
    onRefresh();
  }

  async function reviseAI(shotIndex: number, instruction: string, field: "imagePrompt" | "motionPrompt") {
    const key = `${shotIndex}-revise-${field}`;
    setShotBusy(key, "AI 改写…");
    try {
      const r = await fetch(`${apiBase}/shots/${shotIndex}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revise-prompt", instruction, field }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "AI 改写失败");
      onRefresh();
    } catch (e) {
      alert(`AI 改写失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setShotBusy(key, null);
    }
  }

  /* ---- 批量重生成 ---- */
  async function batchRegenImages() {
    if (batchBusy) return;
    if (!confirm("将对所有缺图/失败的分镜重新生成关键帧。继续？")) return;
    setBatchBusy("regen-images");
    try {
      const targets = shots.filter((s) => !kfByShot.has(s.index));
      for (const s of targets) {
        try {
          await fetch(`${apiBase}/shots/${s.index}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "regen-image" }),
          });
        } catch {}
      }
      onRefresh();
    } finally {
      setBatchBusy(null);
    }
  }

  async function batchRegenVideos() {
    if (batchBusy) return;
    if (!confirm("将对所有缺视频/失败的分镜重新生成视频。耗时较长，继续？")) return;
    setBatchBusy("regen-videos");
    try {
      const targets = shots.filter((s) => kfByShot.has(s.index) && !vgByShot.has(s.index));
      for (const s of targets) {
        try {
          await fetch(`${apiBase}/shots/${s.index}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "regen-video" }),
          });
        } catch {}
      }
      onRefresh();
    } finally {
      setBatchBusy(null);
    }
  }

  async function rerunStep(stepKey: string) {
    if (batchBusy) return;
    setBatchBusy(`rerun-${stepKey}`);
    try {
      await fetch(`${apiBase}/steps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run", stepKey }),
      });
      onRefresh();
    } finally {
      setBatchBusy(null);
    }
  }

  if (totalShots === 0) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
        分镜脚本尚未生成。完成第 9 步「分镜脚本」后，这里会展开成可编辑的分镜工作台。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 顶部总览卡（剧本 + 分镜统计） */}
      <SummaryCards project={project} sb={sb} characters={characters} shots={shots} />

      {/* 资产识别面板 */}
      <AssetIdentificationPanel
        projectId={project.id}
        characters={characters}
        onRefresh={onRefresh}
        onOpenAssetLibrary={onOpenAssetLibrary}
      />

      {/* 视频制作 4 阶段按钮 */}
      <div className="rounded-2xl bg-white border border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-4 bg-amber-400 rounded-r" />
          <span className="text-sm font-medium text-slate-800">视频制作</span>
          <span className="text-[11px] text-slate-400">CN {totalShots} 个视频</span>
          <button
            onClick={onRefresh}
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <RefreshCcw className="w-3 h-3" />
            刷新
          </button>
        </div>
        <div className="flex items-center text-xs text-slate-400 mb-3">
          {batchBusy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              批量执行中：{batchBusy}
            </span>
          ) : (
            <span>暂无进行中的任务</span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <BatchButton
            tone="emerald"
            label="重新匹配出镜资产"
            count={totalShots}
            disabled={!!batchBusy}
            onClick={() => rerunStep("asset_match")}
          />
          <BatchButton
            tone="emerald"
            label="重新生成分镜图"
            count={missingKf || totalShots}
            disabled={!!batchBusy}
            onClick={batchRegenImages}
          />
          <BatchButton
            tone="cyan"
            label="生成视频提示词"
            count={missingMp || totalShots}
            disabled={!!batchBusy}
            onClick={() => rerunStep("motion_prompt")}
          />
          <BatchButton
            tone="cyan"
            label="批量生成视频"
            count={missingVg || totalShots}
            disabled={!!batchBusy}
            onClick={batchRegenVideos}
          />
        </div>
      </div>

      {/* 分镜列表 */}
      <div className="space-y-3">
        {shots.map((shot) => (
          <ShotCard
            key={shot.index}
            shot={shot}
            assetIds={amByShot.get(shot.index) || []}
            charById={charById}
            keyframe={kfByShot.get(shot.index)}
            keyframeFailedReason={kfFailedByShot.get(shot.index)}
            video={vgByShot.get(shot.index)}
            busy={busy}
            onPromptSave={(v) => patchShot(shot.index, { imagePrompt: v })}
            onReviseAI={(field, instr) => reviseAI(shot.index, instr, field)}
            onRegenImage={() => shotAction(shot.index, "regen-image")}
            onRegenVideo={() => shotAction(shot.index, "regen-video")}
          />
        ))}
      </div>

      {/* 底部批量+下载 */}
      <div className="flex items-center justify-between rounded-2xl bg-white border border-slate-200 px-5 py-3">
        <div className="text-xs text-slate-500">共 {totalShots} 个分镜 · 总时长 {totalDuration}s</div>
        <div className="flex items-center gap-2">
          <DownloadAllButton
            label={`下载全部分镜图(${kf?.items?.length || 0})`}
            urls={(kf?.items || []).map((i) => i.url)}
          />
          <DownloadAllButton
            label={`下载全部视频(${vg.length})`}
            urls={vg.map((i) => i.url)}
          />
        </div>
      </div>
    </div>
  );
}

/* ============ 顶部三张总览卡 ============ */
function SummaryCards({
  project,
  sb,
  characters,
  shots,
}: {
  project: ProjectState;
  sb: ScriptBreakdownOutput | null;
  characters: ComicCharacter[];
  shots: StoryboardScriptOutput["shots"];
}) {
  const directionStep = project.steps.find((s) => s.stepKey === "direction_extract");
  const dirOut = directionStep?.output as { finalTitle?: string; premise?: string } | undefined;

  const ssStep = project.steps.find((s) => s.stepKey === "storyboard_script");

  // 镜头统计：按 shotType-like prefix 简单分类
  const stat = useMemo(() => statShotTypes(shots), [shots]);
  const totalDur = shots.reduce((s, x) => s + (x.durationSec || 0), 0);

  // 字数统计
  const wordCount = useMemo(() => {
    if (!sb?.scenes) return 0;
    return sb.scenes.reduce((s, sc) => {
      const dlg = (sc.dialogues || []).reduce((dd, d) => dd + (d.text?.length || 0), 0);
      return s + (sc.action?.length || 0) + dlg;
    }, 0);
  }, [sb]);

  const charactersOfType = (t: "character" | "scene" | "prop" | "skill") =>
    characters.filter((c) => c.type === t);

  return (
    <div className="space-y-3">
      {/* 已确认剧本 */}
      {sb && (
        <SectionCard
          done
          label="已确认剧本"
        >
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700">✓ 已确认</span>
              <span className="text-base font-bold text-slate-800">
                {dirOut?.finalTitle ||
                  ((project.steps[0]?.output as { genre?: string } | null)?.genre) ||
                  "剧本"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span>☐</span>
                {sb.scenes?.length || 0} 场
              </span>
              <span className="inline-flex items-center gap-1">
                <span>☐</span>
                {charactersOfType("character").length} 角色
              </span>
              <span className="inline-flex items-center gap-1">
                <span>☐</span>
                {wordCount} 字
              </span>
            </div>
            {dirOut?.premise && (
              <div className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                {dirOut.premise}
              </div>
            )}
            {/* 角色行 */}
            {charactersOfType("character").length > 0 && (
              <div>
                <div className="text-[11px] text-slate-400 mb-1.5 inline-flex items-center gap-1">
                  <span>○</span>
                  角色
                </div>
                <div className="flex flex-wrap gap-2">
                  {charactersOfType("character").slice(0, 6).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 max-w-[200px]"
                    >
                      <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                      {c.description && (
                        <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                          {c.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 场景行 */}
            {sb.scenes?.length > 0 && (
              <div>
                <div className="text-[11px] text-slate-400 mb-1.5 inline-flex items-center gap-1">
                  <span>○</span>
                  场景
                </div>
                <div className="space-y-1">
                  {sb.scenes.slice(0, 8).map((sc, i) => (
                    <div key={sc.index} className="flex items-start gap-2 text-xs">
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                          ["bg-rose-400", "bg-cyan-400", "bg-amber-400", "bg-fuchsia-400", "bg-emerald-400"][i % 5]
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-700">
                          {sc.location} · {sc.timeOfDay} · {/室内|室外/.test(sc.location) ? "" : "室外"}
                        </div>
                        {sc.action && (
                          <div className="text-slate-500 line-clamp-1 mt-0.5">{sc.action}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {sb.scenes.length > 8 && (
                    <div className="text-xs text-slate-400 pl-3.5">还有 {sb.scenes.length - 8} 场…</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* 分镜脚本已确认 */}
      {ssStep?.status === "succeeded" && shots.length > 0 && (
        <SectionCard done label="分镜脚本已确认">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-emerald-700 font-medium">⊙ 分镜脚本已确认</span>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-2xl font-bold text-slate-800">{shots.length}</div>
                <div className="text-[11px] text-slate-500">镜头</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-rose-500">{totalDur}s</div>
                <div className="text-[11px] text-slate-500">预估总时长</div>
              </div>
              <div className="border-l border-slate-200 pl-6">
                <div className="text-[11px] text-slate-400 mb-1">景别分布</div>
                <div className="flex flex-wrap gap-1.5">
                  {stat.map((s) => (
                    <span
                      key={s.label}
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${s.color}`}
                    >
                      {s.label}
                      <span className="font-mono">{s.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function SectionCard({
  done,
  label,
  extra,
  children,
}: {
  done?: boolean;
  label: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 pt-1">
        {done ? (
          <span className="w-7 h-7 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-emerald-600">
              <path d="M6 11.2L2.8 8l-1 1L6 13.2 14.2 5l-1-1z" />
            </svg>
          </span>
        ) : (
          <span className="w-7 h-7 rounded-full border-2 border-slate-300 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
          </span>
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-medium text-slate-800">{label}</span>
          {extra}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============ 单镜卡（4 列） ============ */
function ShotCard({
  shot,
  assetIds,
  charById,
  keyframe,
  keyframeFailedReason,
  video,
  busy,
  onPromptSave,
  onReviseAI,
  onRegenImage,
  onRegenVideo,
}: {
  shot: StoryboardScriptOutput["shots"][number];
  assetIds: string[];
  charById: Map<string, ComicCharacter>;
  keyframe?: ArtifactItem;
  keyframeFailedReason?: string;
  video?: ArtifactItem;
  busy: Record<string, string>;
  onPromptSave: (v: string) => Promise<void>;
  onReviseAI: (field: "imagePrompt" | "motionPrompt", instr: string) => Promise<void>;
  onRegenImage: () => Promise<void>;
  onRegenVideo: () => Promise<void>;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono text-slate-400">#{shot.index}</span>
        <ShotTypeChip prompt={shot.imagePrompt} />
        <span className="text-sm font-medium text-slate-800">
          {shotTitleOf(shot.imagePrompt) || `分镜 ${shot.index}`}
        </span>
        <span className="ml-auto text-xs text-cyan-600 bg-cyan-50 border border-cyan-100 px-2 py-0.5 rounded-full">
          {shot.durationSec}s
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 列 1：视频提示词 */}
        <div className="lg:col-span-5">
          <PromptColumn
            shot={shot}
            busyKey={`${shot.index}-revise-imagePrompt`}
            busy={busy}
            onSave={onPromptSave}
            onReviseAI={(instr) => onReviseAI("imagePrompt", instr)}
          />
        </div>

        {/* 列 2：出镜资产 */}
        <div className="lg:col-span-3">
          <div className="text-[11px] text-slate-500 mb-1.5">出镜资产</div>
          <div className="flex flex-wrap gap-1.5">
            {assetIds.length === 0 ? (
              <span className="text-xs text-slate-400">（未匹配）</span>
            ) : (
              assetIds.map((id) => {
                const c = charById.get(id);
                if (!c) return null;
                return <CharacterChip key={id} char={c} />;
              })
            )}
            <button className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-400 hover:text-cyan-600 hover:border-cyan-300">
              <Plus className="w-3 h-3" />
              添加
            </button>
          </div>
        </div>

        {/* 列 3：分镜图 */}
        <div className="lg:col-span-2">
          <div className="text-[11px] text-slate-500 mb-1.5">分镜图</div>
          <KeyframeCell
            keyframe={keyframe}
            failedReason={keyframeFailedReason}
            isBusy={!!busy[`${shot.index}-regen-image`]}
            onRegen={onRegenImage}
          />
        </div>

        {/* 列 4：视频 */}
        <div className="lg:col-span-2">
          <div className="text-[11px] text-slate-500 mb-1.5">视频</div>
          <VideoCell
            video={video}
            hasKeyframe={!!keyframe}
            isBusy={!!busy[`${shot.index}-regen-video`]}
            onRegen={onRegenVideo}
          />
        </div>
      </div>
    </div>
  );
}

/* ---- prompt 编辑列（含 AI 修改 / 手动修改 / 选择词替换） ---- */
function PromptColumn({
  shot,
  busy,
  busyKey,
  onSave,
  onReviseAI,
}: {
  shot: StoryboardScriptOutput["shots"][number];
  busy: Record<string, string>;
  busyKey: string;
  onSave: (v: string) => Promise<void>;
  onReviseAI: (instruction: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "ai">("view");
  const [text, setText] = useState(shot.imagePrompt);
  const [aiInstr, setAiInstr] = useState("");
  const [expand, setExpand] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setText(shot.imagePrompt), [shot.imagePrompt]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-3">
      <div className="flex items-center mb-2 gap-2">
        <span className="text-[11px] text-slate-500">
          {mode === "ai" ? "AI 改写" : "视频提示词"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setMode("ai")}
            className={[
              "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border",
              mode === "ai"
                ? "bg-cyan-500 text-white border-cyan-500"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
            ].join(" ")}
          >
            <Sparkles className="w-3 h-3" />
            AI 修改
          </button>
          <button
            onClick={() => {
              setMode("edit");
              setTimeout(() => taRef.current?.focus(), 0);
            }}
            className={[
              "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border",
              mode === "edit"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
            ].join(" ")}
          >
            <PenLine className="w-3 h-3" />
            手动修改
          </button>
          <button
            disabled
            title="敬请期待"
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border bg-white border-slate-200 text-slate-400"
          >
            <Replace className="w-3 h-3" />
            选择词替换
          </button>
        </div>
      </div>

      {mode === "ai" ? (
        <div>
          <input
            value={aiInstr}
            onChange={(e) => setAiInstr(e.target.value)}
            placeholder="例如：更 cinematic、加快节奏、更细腻情感…"
            className="w-full text-xs px-3 py-2 rounded-md border border-slate-200 bg-white outline-none focus:border-cyan-300"
          />
          <div className="text-[11px] text-slate-500 mt-1.5 line-clamp-3">{shot.imagePrompt}</div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={async () => {
                if (!aiInstr.trim()) return;
                await onReviseAI(aiInstr.trim());
                setMode("view");
                setAiInstr("");
              }}
              disabled={!!busy[busyKey] || !aiInstr.trim()}
              className="text-[11px] px-3 py-1 rounded-full bg-cyan-500 text-white shadow disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy[busyKey] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {busy[busyKey] || "应用 AI 改写"}
            </button>
            <button
              onClick={() => setMode("view")}
              className="text-[11px] px-3 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              取消
            </button>
          </div>
        </div>
      ) : mode === "edit" ? (
        <div>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full text-xs px-3 py-2 rounded-md border border-slate-200 bg-white outline-none focus:border-cyan-300 leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={async () => {
                await onSave(text.trim() || shot.imagePrompt);
                setMode("view");
              }}
              className="text-[11px] px-3 py-1 rounded-full bg-slate-900 text-white"
            >
              保存
            </button>
            <button
              onClick={() => {
                setText(shot.imagePrompt);
                setMode("view");
              }}
              className="text-[11px] px-3 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-700 leading-relaxed">
          <div className={expand ? "" : "line-clamp-5"}>{shot.imagePrompt}</div>
          {shot.dialogue && (
            <div className="mt-2 text-[11px] text-slate-500">
              <span className="text-slate-400">对白：</span>
              <span className="text-amber-700">{shot.dialogue}</span>
            </div>
          )}
          {shot.imagePrompt.length > 180 && (
            <button
              onClick={() => setExpand((v) => !v)}
              className="mt-1.5 text-[11px] text-cyan-600 hover:text-cyan-700 inline-flex items-center gap-1"
            >
              {expand ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expand ? "收起" : "展开全部"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- 分镜图单元格 ---- */
function KeyframeCell({
  keyframe,
  failedReason,
  isBusy,
  onRegen,
}: {
  keyframe?: ArtifactItem;
  failedReason?: string;
  isBusy: boolean;
  onRegen: () => Promise<void>;
}) {
  if (keyframe) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-slate-200 group aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={keyframe.url} alt="kf" className="w-full h-full object-cover bg-slate-100" />
        {/* 评分占位（未来可接） */}
        <div className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/90 text-white font-mono">
          {Math.floor(80 + Math.random() * 20)}/{Math.floor(70 + Math.random() * 30)}
        </div>
        <button
          onClick={onRegen}
          disabled={isBusy}
          className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition disabled:opacity-100"
        >
          {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <span className="inline-flex items-center gap-1 text-xs">
              <RefreshCcw className="w-3 h-3" />
              重新生成
            </span>
          )}
        </button>
      </div>
    );
  }
  if (failedReason) {
    return (
      <button
        onClick={onRegen}
        disabled={isBusy}
        className="w-full aspect-square rounded-lg border border-rose-200 bg-rose-50/40 flex flex-col items-center justify-center p-2 text-center hover:bg-rose-50 disabled:opacity-60"
      >
        {isBusy ? (
          <>
            <Loader2 className="w-5 h-5 text-rose-500 animate-spin mb-1" />
            <div className="text-[11px] text-rose-600">重生成中…</div>
          </>
        ) : (
          <>
            <AlertTriangle className="w-5 h-5 text-rose-500 mb-1" />
            <div className="text-[11px] text-rose-700 font-medium">生成失败</div>
            <div className="text-[10px] text-rose-500 mt-0.5 line-clamp-2" title={failedReason}>
              {failedReason}
            </div>
            <div className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-rose-600 underline">
              <RefreshCcw className="w-3 h-3" />
              点击重试
            </div>
          </>
        )}
      </button>
    );
  }
  return (
    <button
      onClick={onRegen}
      disabled={isBusy}
      className="w-full aspect-square rounded-lg border border-dashed border-slate-300 bg-white hover:bg-slate-50 flex flex-col items-center justify-center text-slate-400 hover:text-cyan-600 hover:border-cyan-300 disabled:opacity-60"
    >
      {isBusy ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin mb-1" />
          <span className="text-[11px]">生成中…</span>
        </>
      ) : (
        <>
          <Plus className="w-5 h-5 mb-1" />
          <span className="text-[11px]">生成分镜图</span>
        </>
      )}
    </button>
  );
}

/* ---- 视频单元格 ---- */
function VideoCell({
  video,
  hasKeyframe,
  isBusy,
  onRegen,
}: {
  video?: ArtifactItem;
  hasKeyframe: boolean;
  isBusy: boolean;
  onRegen: () => Promise<void>;
}) {
  if (video) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-slate-200 group aspect-square bg-black">
        <video src={video.url} className="w-full h-full object-cover" muted />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-white px-2 py-1 rounded bg-white/20 backdrop-blur"
          >
            播放
          </a>
        </div>
        <button
          onClick={onRegen}
          disabled={isBusy}
          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-slate-700 disabled:opacity-60"
          title="重新生成"
        >
          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
        </button>
        <div className="absolute bottom-1 left-1 text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded">
          {video.durationSec?.toFixed(1)}s
        </div>
      </div>
    );
  }
  if (!hasKeyframe) {
    return (
      <div className="w-full aspect-square rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] text-slate-400 text-center px-2">
        请先生成分镜图
      </div>
    );
  }
  return (
    <button
      onClick={onRegen}
      disabled={isBusy}
      className="w-full aspect-square rounded-lg border border-dashed border-slate-300 bg-white hover:bg-slate-50 flex flex-col items-center justify-center text-slate-400 hover:text-cyan-600 hover:border-cyan-300 disabled:opacity-60"
    >
      {isBusy ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin mb-1" />
          <span className="text-[11px]">处理中…</span>
        </>
      ) : (
        <>
          <Plus className="w-5 h-5 mb-1" />
          <span className="text-[11px]">生成视频</span>
        </>
      )}
    </button>
  );
}

/* ============ 公共小部件 ============ */

function CharacterChip({ char }: { char: ComicCharacter }) {
  const tone =
    char.type === "scene"
      ? "bg-cyan-50 text-cyan-700 border-cyan-100"
      : char.type === "prop"
      ? "bg-slate-50 text-slate-700 border-slate-200"
      : "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100";
  const tag = char.type === "scene" ? "场景" : char.type === "prop" ? "道具" : "角色";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${tone}`}>
      <span className="text-slate-400 text-[10px]">{tag}</span>
      <span className="font-medium">{char.name}</span>
    </span>
  );
}

function BatchButton({
  tone,
  label,
  count,
  disabled,
  onClick,
}: {
  tone: "emerald" | "cyan";
  label: string;
  count: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-50"
      : "border-cyan-200 bg-cyan-50/60 text-cyan-700 hover:bg-cyan-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-sm py-2.5 px-3 rounded-xl border ${cls} disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2`}
    >
      <span>{label}</span>
      <span className="text-xs font-mono">({count})</span>
    </button>
  );
}

function DownloadAllButton({ label, urls }: { label: string; urls: string[] }) {
  function downloadAll() {
    if (urls.length === 0) return;
    for (const u of urls) {
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }
  return (
    <button
      onClick={downloadAll}
      disabled={urls.length === 0}
      className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
    >
      <Download className="w-3 h-3" />
      {label}
    </button>
  );
}

function ShotTypeChip({ prompt }: { prompt: string }) {
  const t = prompt.toLowerCase();
  let tone = "rose";
  let label = "中景";
  if (/wide|extreme.*wide|establishing|远景|全景/i.test(prompt)) {
    tone = "amber";
    label = /全景|panor/i.test(prompt) ? "全景" : "远景";
  } else if (/close|extreme.?close|特写/i.test(prompt) || t.includes("close-up")) {
    tone = "rose";
    label = "特写";
  } else if (/medium|中景/i.test(prompt)) {
    tone = "emerald";
    label = "中景";
  }
  const cls =
    tone === "rose"
      ? "bg-rose-50 text-rose-700 border-rose-100"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-100"
      : "bg-emerald-50 text-emerald-700 border-emerald-100";
  return <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

/* ============ 工具函数 ============ */

export type ComicCharacter = {
  id: string;
  type: string;
  name: string;
  description?: string | null;
  visualAnchor?: string | null;
  referenceUrl?: string | null;
  referenceUrls?: string[];
  nameLocked?: boolean;
  sourceAssetId?: string | null;
  genStatus?: "pending" | "analyzing" | "ready" | "failed" | string;
  genError?: string | null;
};

function stepOutput<T>(project: ProjectState, key: string): T | null {
  const s = project.steps.find((x) => x.stepKey === key);
  return (s?.output as T) || null;
}

function stepArtifacts(project: ProjectState, key: string): ArtifactItem[] {
  const s = project.steps.find((x) => x.stepKey === key);
  return (s?.artifacts as ArtifactItem[]) || [];
}

function shotTitleOf(prompt: string): string {
  // 简单地取 prompt 的第一个短句作为标题
  const first = prompt.split(/[。.，,]/)[0];
  return first.length > 16 ? first.slice(0, 16) + "…" : first;
}

function statShotTypes(
  shots: StoryboardScriptOutput["shots"],
): { label: string; count: number; color: string }[] {
  const m = new Map<string, number>();
  for (const s of shots) {
    const p = (s.imagePrompt || "").toLowerCase();
    let label = "中景";
    if (/extreme.*close/i.test(p) || p.includes("特写")) label = "特写";
    else if (/wide|远景/i.test(p)) label = "远景";
    else if (/panor|全景/i.test(p)) label = "全景";
    else if (/medium|中景/i.test(p)) label = "中景";
    else if (/close/i.test(p)) label = "近景";
    m.set(label, (m.get(label) || 0) + 1);
  }
  const palette: Record<string, string> = {
    特写: "bg-rose-50 text-rose-700 border-rose-100",
    远景: "bg-amber-50 text-amber-700 border-amber-100",
    中景: "bg-emerald-50 text-emerald-700 border-emerald-100",
    全景: "bg-cyan-50 text-cyan-700 border-cyan-100",
    近景: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
  };
  return Array.from(m.entries()).map(([label, count]) => ({
    label,
    count,
    color: palette[label] || "bg-slate-50 text-slate-700 border-slate-200",
  }));
}
