/**
 * AI 漫剧 S2.0 — 前端类型与常量
 *
 * 这些类型是后端 step output 的镜像（不直接 import 后端，避免把 server-only 模块拽入 client bundle）
 */

export type ArtifactItem = {
  url: string;
  type: "image" | "video" | "audio";
  shotIndex?: number;
  durationSec?: number;
  width?: number;
  height?: number;
};

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export type StepRow = {
  stepKey: string;
  status: StepStatus;
  progress: number;
  cost?: number;
  errorMessage?: string | null;
  output?: unknown;
  artifacts?: ArtifactItem[] | null;
};

export type ProjectStatus = "draft" | "running" | "paused" | "failed" | "completed";

export type ProjectState = {
  id: string;
  status: ProjectStatus;
  progress: number;
  currentStep: string | null;
  totalCost: number;
  isRunning: boolean;
  finalVideoUrl?: string | null;
  coverUrl?: string | null;
  steps: StepRow[];
};

/* ============ 14 步元数据 ============ */

export const STEP_KEYS = [
  "intent_analysis",
  "direction_pick",
  "direction_refine",
  "direction_extract",
  "outline",
  "novel_adapt",
  "script_breakdown",
  "subject_binding",
  "storyboard_script",
  "asset_match",
  "keyframes",
  "motion_prompt",
  "video_gen",
  "video_compose",
] as const;

export const STEP_LABEL: Record<string, string> = {
  intent_analysis: "意图分析",
  direction_pick: "创意方向",
  direction_refine: "微调方向",
  direction_extract: "提炼方向",
  outline: "创意大纲",
  novel_adapt: "小说创作",
  script_breakdown: "剧本转换",
  subject_binding: "资产提取",
  storyboard_script: "分镜脚本",
  asset_match: "匹配出镜资产",
  keyframes: "生成分镜图",
  motion_prompt: "生成视频提示词",
  video_gen: "批量生成视频",
  video_compose: "视频合成",
};

export const STEP_SUBTITLE: Record<string, string> = {
  intent_analysis: "自动选择推荐的创作方式，无推荐则随机选",
  direction_pick: "自动随机选择一个创意方向并确认",
  direction_refine: "自动随机选择一个微调方向并确认",
  direction_extract: "自动随机选择一个提炼方向并确认",
  outline: "生成完毕后自动确认",
  novel_adapt: "生成完毕后自动确认",
  script_breakdown: "生成完毕后自动确认",
  subject_binding: "自动一键生成所有资产并确认",
  storyboard_script: "自动合成分镜并确认",
  asset_match: "自动为分镜匹配出镜资产",
  keyframes: "自动批量生成分镜图",
  motion_prompt: "自动批量生成视频提示词",
  video_gen: "自动批量生成视频，达到目标数即止",
  video_compose: "拼接 + 配音 + 字幕 + 转场",
};

/* ============ 4 阶段映射（前端展示概念） ============ */

export type PhaseId = "brewing" | "thinking" | "producing" | "completing";

export const PHASES: {
  id: PhaseId;
  label: string;
  hint: string;
  steps: string[];
}[] = [
  {
    id: "brewing",
    label: "酝酿",
    hint: "故事意图与方向",
    steps: ["intent_analysis", "direction_pick", "direction_refine", "direction_extract"],
  },
  {
    id: "thinking",
    label: "思考",
    hint: "结构与剧本成型",
    steps: ["outline", "novel_adapt", "script_breakdown"],
  },
  {
    id: "producing",
    label: "制作",
    hint: "资产、分镜、画面、视频",
    steps: [
      "subject_binding",
      "storyboard_script",
      "asset_match",
      "keyframes",
      "motion_prompt",
      "video_gen",
    ],
  },
  {
    id: "completing",
    label: "完成",
    hint: "拼接成片",
    steps: ["video_compose"],
  },
];

export function phaseOfStep(stepKey: string): PhaseId | null {
  for (const p of PHASES) if (p.steps.includes(stepKey)) return p.id;
  return null;
}

/* ============ AutoPolicy ============ */

export type AutoPolicyState = {
  steps: Record<string, boolean>;
  retry: { chat: number; image: number; video: number };
  videoTargetPerShot: number;
};

export const DEFAULT_POLICY_STATE: AutoPolicyState = {
  steps: Object.fromEntries(STEP_KEYS.map((k) => [k, true])),
  retry: { chat: 5, image: 5, video: 10 },
  videoTargetPerShot: 1,
};

/* ============ 各步 output 类型 ============ */

export type IntentAnalysisOutput = {
  genre: string;
  audience: string;
  coreConflict: string;
  themes: string[];
  tone: string;
  recommendedApproach: string;
};

export type DirectionCandidate = { id: string; title: string; summary: string };
export type DirectionOutput = {
  candidates: DirectionCandidate[];
  selectedId: string;
  reason: string;
};

export type DirectionExtractOutput = {
  finalTitle: string;
  oneLineThesis: string;
  toneFinal: string;
  premise: string;
};

export type OutlineChapter = {
  index: number;
  title: string;
  summary: string;
  emotion: "rising" | "tense" | "climax" | "calm" | "resolution";
};
export type OutlineOutput = { totalChapters: number; chapters: OutlineChapter[] };

export type NovelOutput = { text: string; wordCount: number };

export type ScriptScene = {
  index: number;
  location: string;
  timeOfDay: string;
  characters: string[];
  action: string;
  dialogues: { speaker: string; text: string }[];
};
export type ScriptBreakdownOutput = {
  scenes: ScriptScene[];
  charactersPool: { name: string; description: string }[];
};

export type SubjectBindingOutput = {
  characterIds: string[];
  summary: {
    id: string;
    type: "character" | "scene" | "prop" | "skill";
    name: string;
    referenceUrl?: string;
    visualAnchor?: string;
    error?: string;
  }[];
};

export type KeyframesOutput = {
  count: number;
  items: { url: string; type: "image"; shotIndex: number }[];
  failed?: { shotIndex: number; error: string }[];
};

export type ShotScript = {
  index: number;
  sceneIndex: number;
  imagePrompt: string;
  motionPrompt: string;
  dialogue?: string;
  durationSec: number;
};
export type StoryboardScriptOutput = { shots: ShotScript[] };

export type AssetMatchOutput = {
  shotAssets: { shotIndex: number; characterIds: string[] }[];
};

export type MotionPromptOutput = {
  items: { shotIndex: number; motionPrompt: string; durationSec: number }[];
};

export type VideoComposeOutput = {
  videoUrl: string;
  coverUrl?: string;
  durationSec: number;
};
