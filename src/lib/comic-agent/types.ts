/**
 * AI 漫剧 · S2.0 — 各步产物的 TypeScript 结构
 *
 * 所有产物以 JSON 字符串形式存储在 ComicProjectStep.output 字段。
 * 这里集中定义类型，runner 写入、API/前端读出时都按这套类型解释。
 */

/* ---------- 剧本创作阶段 ---------- */

/** 1. 意图分析 */
export type IntentAnalysisOutput = {
  genre: string;
  audience: string;
  coreConflict: string;
  themes: string[];
  tone: string;
  recommendedApproach: string; // 推荐的创作方式（≤30字）
};

/** 2. 创意方向（候选 + 选中） */
export type DirectionPickOutput = {
  candidates: { id: string; title: string; summary: string }[];
  selectedId: string;
  reason: string;
};

/** 3. 微调方向 */
export type DirectionRefineOutput = {
  candidates: { id: string; title: string; summary: string }[];
  selectedId: string;
  reason: string;
};

/** 4. 提炼方向（最终落定） */
export type DirectionExtractOutput = {
  finalTitle: string;          // 最终敲定的方向标题
  oneLineThesis: string;       // 一句话主旨
  toneFinal: string;
  premise: string;             // 短梗概（≤120字）
};

export type OutlineChapter = {
  index: number;
  title: string;
  summary: string;
  emotion: "rising" | "tense" | "climax" | "calm" | "resolution";
};

export type OutlineOutput = {
  totalChapters: number;
  chapters: OutlineChapter[];
};

/* ---------- 编剧精排 ---------- */

export type NovelAdaptOutput = {
  /** 章节扩写后的连续叙事文本 */
  text: string;
  wordCount: number;
};

export type ScriptScene = {
  index: number;
  location: string;       // 场景地点
  timeOfDay: string;      // 白天 / 夜晚 / 黄昏 ...
  characters: string[];   // 出场角色名
  action: string;         // 动作叙述
  dialogues: { speaker: string; text: string }[];
};

export type ScriptBreakdownOutput = {
  scenes: ScriptScene[];
  charactersPool: { name: string; description: string }[];
};

/* ---------- 主体绑定（角色卡） ---------- */

export type SubjectBindingOutput = {
  /** 引用 ComicCharacter 表的 id */
  characterIds: string[];
  /** 同时把摘要塞回来，前端无需额外查表 */
  summary: {
    id: string;
    type: "character" | "scene" | "prop";
    name: string;
    referenceUrl?: string;
    visualAnchor?: string;
  }[];
};

/* ---------- 分镜 ---------- */

export type ShotDesign = {
  index: number;
  sceneIndex: number;
  shotType: "wide" | "medium" | "close" | "extreme_close" | "over_shoulder";
  cameraMove: "static" | "pan" | "zoom_in" | "zoom_out" | "dolly" | "tracking";
  durationSec: number;       // 该镜预计时长
  description: string;       // 镜头叙事
  emotion: string;
};

export type ShotScript = {
  index: number;
  sceneIndex: number;
  imagePrompt: string;       // 用于关键帧的提示词（含视觉锚）
  motionPrompt: string;      // 用于图生视频的运动描述
  dialogue?: string;         // 该镜对白（用于配音/字幕）
  durationSec: number;
};

export type StoryboardScriptOutput = {
  shots: ShotScript[];
};

/** 匹配出镜资产：每个分镜引用哪些 ComicCharacter.id */
export type AssetMatchOutput = {
  shotAssets: { shotIndex: number; characterIds: string[] }[];
};

/** 视频提示词：为每个 shot/keyframe 生成的运动 prompt */
export type MotionPromptOutput = {
  items: { shotIndex: number; motionPrompt: string; durationSec: number }[];
};

/* ---------- 媒体产物（关键帧 / 视频片段 / 成片） ---------- */

export type ArtifactItem = {
  url: string;
  type: "image" | "video" | "audio";
  shotIndex?: number;
  durationSec?: number;
  width?: number;
  height?: number;
};

export type KeyframesOutput = {
  count: number;
  items: ArtifactItem[];
  /** 哪些 shot 完全失败（重试用尽） */
  failed?: { shotIndex: number; error: string }[];
};

export type VideoGenOutput = {
  count: number;
  totalDurationSec: number;
  items: ArtifactItem[];
};

export type VideoComposeOutput = {
  videoUrl: string;
  coverUrl?: string;
  durationSec: number;
};

/* ---------- 通用 ---------- */

export type StepRunResult = {
  output: unknown;                  // 直接 JSON.stringify 进 ComicProjectStep.output
  artifacts?: ArtifactItem[];       // 直接 JSON.stringify 进 ComicProjectStep.artifacts
  cost: number;
  realCost: number;
  modelSlug?: string;
  channelId?: string | null;
  externalId?: string | null;
  meta?: Record<string, unknown>;
};

export type StepRunContext = {
  userId: string;
  projectId: string;
  /** 项目当前快照（最新一次从 DB 读出） */
  project: {
    id: string;
    title: string;
    initialPrompt: string;
    style: string | null;
    /** 视觉风格预设 slug（hk_neon / guofeng / ...） */
    visualStyle: string | null;
    language: string;
    resolution: string;
    aspectRatio: string;
    speedTier: string;
    llmSlug: string;
    imageSlug: string;
    videoSlug: string;
    ttsSlug: string;
  };
  /** 已完成步骤产物：key -> 解析后的 output 对象 */
  prior: Record<string, unknown>;
  /** 当前生效的智能托管策略（逐步模式下用默认值） */
  policy: import("./steps").AutoRunPolicy;
};
