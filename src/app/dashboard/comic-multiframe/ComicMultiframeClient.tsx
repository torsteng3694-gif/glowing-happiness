"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Plus,
  Bug,
  BookOpen,
  X,
  Palette,
  Film,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Bot,
} from "lucide-react";

import ArtifactCanvas from "./ArtifactCanvas";
import PhaseTimeline from "./PhaseTimeline";
import AutoPolicyDialog from "./AutoPolicyDialog";
import ShotWorkbench, { type ComicCharacter } from "./ShotWorkbench";
import AssetLibraryDialog, { type CharacterFull } from "./AssetLibraryDialog";
import {
  DEFAULT_POLICY_STATE,
  type AutoPolicyState,
  type ProjectState,
  type StepRow,
} from "./types";

/* ===========================================================
 * AI 漫剧 · S2.0 工作区
 *   - 顶部：ArtifactCanvas（画板 + 缩略堆栈）
 *   - 中部：项目配置条（渠道偏好/模型/速度/分辨率/文案）
 *   - 下部：PhaseTimeline（4 阶段 + 子步骤展开）
 *   - 底部 sticky：故事点子输入 + 模式切换 + 提交
 * =========================================================== */

export default function ComicMultiframeClient() {
  /* ---- 表单状态 ---- */
  const [prompt, setPrompt] = useState("");
  const [speed, setSpeed] = useState<"fast" | "balance" | "quality">("fast");
  const [resolution, setResolution] = useState<"480P" | "720P" | "1080P">("480P");
  const [channelPref, setChannelPref] = useState<"price" | "quality">("price");
  const [modelAutoSwitch, setModelAutoSwitch] = useState(true);
  const [modelLocked, setModelLocked] = useState(false);
  const [modelPreset, setModelPreset] = useState<"sd2_fast" | "sd2_balance" | "sd2_quality">("sd2_fast");
  const [runMode, setRunMode] = useState<"step" | "auto">("auto");
  const [policy, setPolicy] = useState<AutoPolicyState>(DEFAULT_POLICY_STATE);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // 资产库弹窗
  const [assetLibOpen, setAssetLibOpen] = useState(false);
  const [projectVisualStyle, setProjectVisualStyle] = useState<string | null>(null);

  /* ---- 项目状态 ---- */
  const [project, setProject] = useState<ProjectState | null>(null);
  const [characters, setCharacters] = useState<CharacterFull[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [runningStep, setRunningStep] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  /* ---- SSE 订阅 ---- */
  useEffect(() => {
    if (!project?.id) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource(`/api/comic-multiframe/projects/${project.id}/stream`);
    esRef.current = es;
    es.addEventListener("update", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        setProject((prev) => (prev && prev.id === data.id ? { ...prev, ...data } : prev));
      } catch {}
    });
    es.addEventListener("done", () => {
      es.close();
      esRef.current = null;
    });
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [project?.id]);

  async function refreshProject(projectId: string) {
    try {
      const detail = await fetch(`/api/comic-multiframe/projects/${projectId}`).then((x) => x.json());
      const p = detail?.project;
      if (!p) return;
      setProject({
        id: p.id,
        status: p.status,
        progress: p.progress,
        currentStep: p.currentStep,
        totalCost: p.totalCost,
        isRunning: p.isRunning,
        finalVideoUrl: p.finalVideoUrl,
        coverUrl: p.coverUrl,
        steps: (p.steps || []).map((s: StepRow) => ({
          stepKey: s.stepKey,
          status: s.status,
          progress: s.progress,
          cost: s.cost,
          errorMessage: s.errorMessage,
          output: s.output,
          artifacts: s.artifacts,
        })),
      });
      setCharacters((p.characters as CharacterFull[]) || []);
      setProjectVisualStyle(p.visualStyle ?? null);
    } catch (e) {
      console.warn("refreshProject failed", e);
    }
  }

  useEffect(() => {
    if (!modelAutoSwitch || modelLocked) return;
    const next =
      speed === "fast" ? "sd2_fast" : speed === "balance" ? "sd2_balance" : "sd2_quality";
    setModelPreset(next);
  }, [speed, modelAutoSwitch, modelLocked]);

  async function submit() {
    setErrorMsg(null);
    if (!prompt.trim()) {
      setErrorMsg("请输入故事描述");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/comic-multiframe/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          mode: runMode,
          resolution,
          speedTier: speed,
          modelPreset,
          modelLocked,
          modelAutoSwitch,
          autoPolicy: runMode === "auto" ? policy : null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "提交失败");
      await refreshProject(j.project_id);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function stepAction(action: "run" | "skip" | "auto", stepKey?: string) {
    if (!project) return;
    setErrorMsg(null);

    const targetKey =
      stepKey ||
      project.currentStep ||
      project.steps.find((s) => s.status === "pending")?.stepKey;

    if (action === "run" && targetKey) {
      setProject((prev) =>
        prev
          ? {
              ...prev,
              status: "running",
              currentStep: targetKey,
              steps: prev.steps.map((s) =>
                s.stepKey === targetKey ? { ...s, status: "running", progress: 10 } : s,
              ),
            }
          : prev,
      );
    }

    if (action === "run") setRunningStep(true);
    try {
      const r = await fetch(`/api/comic-multiframe/projects/${project.id}/steps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, stepKey, autoPolicy: action === "auto" ? policy : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "操作失败");
      await refreshProject(project.id);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      await refreshProject(project.id);
    } finally {
      setRunningStep(false);
    }
  }

  /* ---- 提交触发：smart submit（auto 模式打开弹窗 confirm） ---- */
  function trySubmit() {
    if (runMode === "auto") setPolicyOpen(true);
    else submit();
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <BackgroundDecor />

      <div className="relative px-6 lg:px-10 pt-8 pb-32 max-w-7xl mx-auto space-y-6">
        {/* —— 顶部画板 —— */}
        <ArtifactCanvas project={project} initialPrompt={prompt} />

        {/* —— 中部配置条 —— */}
        <ConfigBar
          channelPref={channelPref}
          onChannelPref={setChannelPref}
          speed={speed}
          onSpeed={setSpeed}
          resolution={resolution}
          onResolution={setResolution}
        modelPreset={modelPreset}
        onModelPreset={setModelPreset}
        modelLocked={modelLocked}
        onModelLocked={setModelLocked}
        modelAutoSwitch={modelAutoSwitch}
        onModelAutoSwitch={setModelAutoSwitch}
        />

        {/* —— 4 阶段时间轴 —— */}
        <PhaseTimeline
          project={project}
          runningStep={runningStep}
          onRun={(k) => stepAction("run", k)}
          onSkip={(k) => stepAction("skip", k)}
        />

        {/* —— 分镜工作台（生成分镜脚本之后才出现） —— */}
        {project &&
          project.steps.find((s) => s.stepKey === "storyboard_script")?.status === "succeeded" && (
            <ShotWorkbench
              project={project}
              characters={characters}
              onRefresh={() => refreshProject(project.id)}
              onOpenAssetLibrary={() => setAssetLibOpen(true)}
            />
          )}

        {/* 错误提示 */}
        {errorMsg && (
          <div className="rounded-xl text-xs text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2">
            {errorMsg}
          </div>
        )}
      </div>

      {/* —— 底部固定提交栏 —— */}
      <PromptDock
        prompt={prompt}
        onPrompt={setPrompt}
        runMode={runMode}
        onRunMode={setRunMode}
        speed={speed}
        resolution={resolution}
        submitting={submitting}
        canSubmit={!project || project.status === "completed" || project.status === "failed"}
        onSubmit={trySubmit}
        project={project}
        onAuto={() => setPolicyOpen(true)}
        onOpenGuide={() => setGuideOpen(true)}
      />

      {assetLibOpen && project && (
        <AssetLibraryDialog
          projectId={project.id}
          characters={characters}
          visualStyle={projectVisualStyle}
          onClose={() => setAssetLibOpen(false)}
          onChange={() => refreshProject(project.id)}
        />
      )}

      {policyOpen && (
        <AutoPolicyDialog
          value={policy}
          onChange={setPolicy}
          onCancel={() => setPolicyOpen(false)}
          onConfirm={async () => {
            setPolicyOpen(false);
            if (project && project.status !== "completed") {
              // 已有项目 → 让后端按当前 policy 跑剩余 step
              await stepAction("auto");
            } else {
              await submit();
            }
          }}
        />
      )}

      {guideOpen && <GuideDialog onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

/* ============ 中部配置条 ============ */
function ConfigBar({
  channelPref,
  onChannelPref,
  speed,
  onSpeed,
  resolution,
  onResolution,
  modelPreset,
  onModelPreset,
  modelLocked,
  onModelLocked,
  modelAutoSwitch,
  onModelAutoSwitch,
}: {
  channelPref: "price" | "quality";
  onChannelPref: (v: "price" | "quality") => void;
  speed: "fast" | "balance" | "quality";
  onSpeed: (v: "fast" | "balance" | "quality") => void;
  resolution: "480P" | "720P" | "1080P";
  onResolution: (v: "480P" | "720P" | "1080P") => void;
  modelPreset: "sd2_fast" | "sd2_balance" | "sd2_quality";
  onModelPreset: (v: "sd2_fast" | "sd2_balance" | "sd2_quality") => void;
  modelLocked: boolean;
  onModelLocked: (v: boolean) => void;
  modelAutoSwitch: boolean;
  onModelAutoSwitch: (v: boolean) => void;
}) {
  return (
    <div className="rounded-2xl bg-white/85 backdrop-blur border border-slate-200 px-5 py-3.5 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 mr-2">
        <span className="w-1 h-4 bg-cyan-400 rounded-r" />
        <span className="text-sm font-medium text-slate-800">漫剧 S2 配置</span>
      </div>

      <Selector
        label="渠道偏好"
        value={channelPref}
        onChange={(v) => onChannelPref(v as "price" | "quality")}
        options={[
          { id: "price", label: "价格优先" },
          { id: "quality", label: "质量优先" },
        ]}
      />

      <Selector
        label="模型"
        value={modelPreset}
        onChange={(v) => onModelPreset(v as "sd2_fast" | "sd2_balance" | "sd2_quality")}
        icon={<Palette className="w-3.5 h-3.5 text-cyan-600" />}
        options={[
          { id: "sd2_fast", label: "SD 2.0 旗舰版（快）" },
          { id: "sd2_balance", label: "SD 2.0 旗舰版（均）" },
          { id: "sd2_quality", label: "SD 2.0 旗舰版（质）" },
        ]}
        readonly={modelLocked}
      />

      <button
        type="button"
        onClick={() => onModelAutoSwitch(!modelAutoSwitch)}
        className={[
          "inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition",
          modelAutoSwitch
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-500",
        ].join(" ")}
      >
        <Bot className="w-3.5 h-3.5" />
        自动切换
      </button>

      <button
        type="button"
        onClick={() => onModelLocked(!modelLocked)}
        className={[
          "inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition",
          modelLocked
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-white text-slate-500",
        ].join(" ")}
      >
        {modelLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        {modelLocked ? "模型已锁定" : "锁定模型"}
      </button>

      <Selector
        label="速度"
        value={speed}
        onChange={(v) => onSpeed(v as typeof speed)}
        icon={<Bot className="w-3.5 h-3.5 text-emerald-600" />}
        options={[
          { id: "fast", label: "快速" },
          { id: "balance", label: "均衡" },
          { id: "quality", label: "高质" },
        ]}
      />

      <Selector
        label="分辨率"
        value={resolution}
        onChange={(v) => onResolution(v as typeof resolution)}
        icon={<Film className="w-3.5 h-3.5 text-fuchsia-600" />}
        options={[
          { id: "480P", label: "480P" },
          { id: "720P", label: "720P" },
          { id: "1080P", label: "1080P" },
        ]}
      />

      <div className="ml-auto text-xs text-slate-400">
        当前管线由「解说漫剧管线」全局/用户偏好决定
      </div>
    </div>
  );
}

function Selector({
  label,
  value,
  onChange,
  options,
  icon,
  readonly,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  icon?: React.ReactNode;
  readonly?: boolean;
}) {
  const cur = options.find((o) => o.id === value) ?? options[0];
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => !readonly && setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-slate-300 transition"
      >
        {icon}
        {label && <span className="text-slate-400">{label}</span>}
        <span className="font-medium">{cur.label}</span>
        {!readonly && <ChevronDown className="w-3 h-3 text-slate-400" />}
      </button>
      {open && !readonly && (
        <div className="absolute top-full left-0 mt-1 z-30 rounded-lg bg-white shadow-lg border border-slate-200 py-1 min-w-[120px]">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={[
                "w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50",
                o.id === value ? "text-cyan-700 font-medium" : "text-slate-700",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ 底部 PromptDock（sticky 输入栏） ============ */
function PromptDock({
  prompt,
  onPrompt,
  runMode,
  onRunMode,
  speed: _speed,
  resolution: _resolution,
  submitting,
  canSubmit,
  onSubmit,
  project,
  onAuto,
  onOpenGuide,
}: {
  prompt: string;
  onPrompt: (v: string) => void;
  runMode: "step" | "auto";
  onRunMode: (v: "step" | "auto") => void;
  speed: string;
  resolution: string;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  project: ProjectState | null;
  onAuto: () => void;
  onOpenGuide: () => void;
}) {
  const showAutoBtn = !!project && project.status !== "completed" && !project.isRunning;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 lg:px-10 pb-5">
      <div className="max-w-5xl mx-auto rounded-3xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl shadow-slate-300/40 overflow-hidden">
        <div className="flex items-start gap-4 px-5 pt-4 pb-2">
          <button
            type="button"
            className="flex-shrink-0 w-12 h-12 rounded-xl border border-dashed border-slate-300 text-slate-400 hover:text-cyan-600 hover:border-cyan-300 transition flex flex-col items-center justify-center text-[10px] gap-0.5"
          >
            <Plus className="w-4 h-4" />
            参考图
          </button>
          <textarea
            value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder={
              project
                ? "项目已创建。如需新开一部漫剧，请先等当前项目结束或刷新页面。"
                : "描述你想要生成的故事内容…"
            }
            disabled={!!project && project.status !== "completed" && project.status !== "failed"}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none py-3 disabled:opacity-50"
          />
          {showAutoBtn && (
            <button
              onClick={onAuto}
              className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              智能托管
            </button>
          )}
          <button
            onClick={onSubmit}
            disabled={submitting || !canSubmit}
            title={canSubmit ? "提交" : "项目进行中"}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 active:scale-95 transition disabled:opacity-50"
          >
            {submitting ? (
              <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between px-5 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenGuide}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            >
              <BookOpen className="w-3 h-3" />
              玩法说明
            </button>
            <button className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
              <Bug className="w-3 h-3" />
              BUG 反馈
            </button>
          </div>

          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50/50 p-0.5 text-xs">
            <button
              onClick={() => onRunMode("step")}
              className={[
                "px-3 py-1 rounded-full transition inline-flex items-center gap-1",
                runMode === "step"
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              <ChevronRight className="w-3 h-3" />
              逐步确认
            </button>
            <button
              onClick={() => onRunMode("auto")}
              className={[
                "px-3 py-1 rounded-full transition inline-flex items-center gap-1",
                runMode === "auto"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow"
                  : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              <Sparkles className="w-3 h-3" />
              智能托管
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideDialog({ onClose }: { onClose: () => void }) {
  const quickSteps = [
    "01 全局设置：偏好配置、智能引擎、渠道策略",
    "02 新建项目：设置项目名与横竖屏方向",
    "03 S2.0 资产导入与分享：跨项目复用资产",
    "04 意图识别实战：输入想法/小说/剧本自动识别",
    "05 剧本确认：可修改后再确认",
    "06 资产识别：角色/场景/道具提取",
    "06.1 违规提示词自动替换：合规兜底",
    "07 脚本大纲 · 分镜合并 · 分镜确认",
    "08 视频制作全流程：匹配资产 → 分镜图 → 提示词 → 视频",
    "09 回退到资产识别后可重新选择视频模型参数",
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] p-4 sm:p-8">
      <div className="mx-auto h-full max-w-5xl rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-cyan-700 font-medium tracking-wide uppercase">使用指南 · GUIDE</div>
            <h2 className="text-lg font-semibold text-slate-900 mt-1">AI 漫剧 · S2.0</h2>
            <p className="text-sm text-slate-500 mt-1">从想法到成品视频的 AI 全自动创作流水线</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-6 text-sm text-slate-700">
          <div className="grid sm:grid-cols-4 gap-3">
            {["多图深度融合", "全流程可控", "多主体一致性", "一键成片"].map((x) => (
              <div key={x} className="rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2 text-cyan-800">
                {x}
              </div>
            ))}
          </div>

          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-2">视频教程</h3>
            <p className="text-slate-600">
              跟着视频学，3 分钟上手。完整教程覆盖：项目创建、资产管理、意图识别、剧本编排、分镜制作、视频生成全流程。
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-2">快速目录</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {quickSteps.map((s) => (
                <div key={s} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  {s}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-2">整体流程概览</h3>
            <p className="text-slate-600">
              AI 漫剧 S2.0 会从创意输入开始，依次完成意图分析、创意方向、大纲、小说、剧本、资产提取、分镜脚本和视频制作。每一步可人工干预并可回退重做。
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-2">核心流程详解</h3>
            <ul className="space-y-2 text-slate-600 list-disc pl-5">
              <li>创意阶段：输入描述 + 参考图（1~9 张），AI 深度融合理解。</li>
              <li>意图分析：自动判断最优路径（剧情创作 / 提炼 / 微调 / 转换 / 主体识别）。</li>
              <li>创意方向：给出 3 个方向，可带反馈重生成。</li>
              <li>创意大纲与小说：逐步展开故事结构与文本细节。</li>
              <li>剧本转换：转为可制作的分场景剧本格式。</li>
              <li>资产提取：角色/场景/道具自动识别与复用，缺失资产自动生成。</li>
              <li>分镜脚本：支持手动合并拆分、调整时长、重排结构。</li>
              <li>视频制作：匹配出镜资产 → 分镜图 → 运动提示词 → 视频片段。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-2">两种创作模式</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 px-3 py-3 bg-white">
                <div className="font-medium text-slate-900">逐步确认模式</div>
                <p className="mt-1 text-slate-600">每一步暂停等待确认，适合精细创作与强控制。</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-3 bg-white">
                <div className="font-medium text-slate-900">智能托管模式</div>
                <p className="mt-1 text-slate-600">自动跑完整流程，适合快速出片与批量生产。</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-2">进阶技巧</h3>
            <ul className="space-y-2 text-slate-600 list-disc pl-5">
              <li>支持回退节点，重做不满意的步骤。</li>
              <li>支持“带反馈重生成”，让结果更贴近期望。</li>
              <li>资产库支持跨项目导入与导出分享。</li>
              <li>视频制作阶段支持单帧重生（图 / 提示词 / 视频）。</li>
              <li>内置违规提示词自动替换，降低内容合规风险。</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ============ 背景装饰 ============ */
function BackgroundDecor() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cyan-50/30 via-white to-white" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #0891b2 1px, transparent 1px), linear-gradient(to bottom, #0891b2 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="pointer-events-none absolute -top-32 right-[10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-fuchsia-200/30 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute top-[40%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-br from-cyan-200/30 to-transparent blur-3xl" />
    </>
  );
}
