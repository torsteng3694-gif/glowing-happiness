/**
 * AI 漫剧 · S3.0 — 各 step 产物的 zod schema
 *
 * 规则：
 *   - 每一步定义一个 *Schema（zod）+ 一个 *Output（type 推导）
 *   - runner 在返回前用 schema.parse(data) 强校验；不合规抛错由引擎处理
 *   - API/前端读取时用 .safeParse() 兜底，避免坏数据炸页面
 *
 * 单候选 vs 多候选：
 *   - 多候选 step：runner 返回 Candidate<T>[]
 *   - 单候选 step：runner 返回 Candidate<T>[]（length=1），引擎一致处理
 */

import { z } from "zod";
import { STEP_KEYS_V3 } from "./steps";

/* ============================================================
 * Step 1. analyze — 意图分析
 * ============================================================ */

export const AnalyzeSchema = z.object({
  genre: z.string().min(1).max(20),
  audience: z.string().min(1).max(30),
  coreConflict: z.string().min(1).max(80),
  themes: z.array(z.string().min(1).max(20)).min(1).max(5),
  tone: z.string().min(1).max(20),
  recommendedApproach: z.string().min(1).max(60),
});
export type AnalyzeOutput = z.infer<typeof AnalyzeSchema>;

/* ============================================================
 * Step 2. direction — 创意方向（多候选）
 * 单个候选 = 一个完整的方向，由用户从 N 选 1
 * ============================================================ */

export const DirectionDataSchema = z.object({
  /** 方向标识（A/B/C 或 LLM 起的名字 slug），用于 candidate.id */
  slug: z.string().min(1).max(40),
  title: z.string().min(1).max(40),
  /** 一句话主旨 */
  thesis: z.string().min(1).max(120),
  /** 详细梗概，前端会渲染到 mdSummary */
  summary: z.string().min(1).max(600),
  /** 整体调性，下游 outline / script 会读 */
  tone: z.string().min(1).max(40),
  /** 这个方向相比其他方向的差异点（用户对比时看的） */
  uniqueAngle: z.string().min(1).max(120),
});
export type DirectionData = z.infer<typeof DirectionDataSchema>;

/* ============================================================
 * Step 3. outline — 故事大纲
 * ============================================================ */

export const OutlineChapterSchema = z.object({
  index: z.number().int().min(1).max(20),
  title: z.string().min(1).max(40),
  summary: z.string().min(1).max(300),
  emotion: z.enum(["rising", "tense", "climax", "calm", "resolution"]),
});

export const OutlineSchema = z.object({
  totalChapters: z.number().int().min(2).max(20),
  chapters: z.array(OutlineChapterSchema).min(2).max(20),
});
export type OutlineOutput = z.infer<typeof OutlineSchema>;

/* ============================================================
 * Step 4. script — 剧本拆解
 * ============================================================ */

export const ScriptSceneSchema = z.object({
  index: z.number().int().min(1),
  location: z.string().min(1).max(40),
  timeOfDay: z.string().min(1).max(20),
  characters: z.array(z.string().min(1).max(20)),
  /** 场景动作叙述（含动作 / 镜头氛围） */
  action: z.string().min(1).max(800),
  dialogues: z
    .array(
      z.object({
        speaker: z.string().min(1).max(20),
        text: z.string().min(1).max(400),
      }),
    )
    .max(20),
});

export const CharacterPoolItemSchema = z.object({
  name: z.string().min(1).max(20),
  /** 角色外观/性格/年龄等 */
  description: z.string().min(1).max(300),
  /** "main" | "支线" | "反派" 等粗分类 */
  importance: z.enum(["main", "supporting", "minor"]).default("supporting"),
});

export const ScriptSchema = z.object({
  scenes: z.array(ScriptSceneSchema).min(1).max(50),
  charactersPool: z.array(CharacterPoolItemSchema).min(1).max(20),
  /** 出现的关键场景/地点池（用于 assets 步生成场景图时复用） */
  scenesPool: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        description: z.string().min(1).max(300),
      }),
    )
    .max(20)
    .default([]),
});
export type ScriptOutput = z.infer<typeof ScriptSchema>;

/* ============================================================
 * Step 5. assets_plan — 资产骨架（仅 prompt，不含图）
 * 产物：每个 asset 的 id / name / imagePrompt / visualAnchor
 * ============================================================ */

export const AssetPlanItemSchema = z.object({
  id: z.string(),
  type: z.enum(["character", "scene", "prop"]),
  name: z.string().min(1).max(40),
  imagePrompt: z.string().nullable(),
  visualAnchor: z.string().max(400).nullable(),
  negativePrompt: z.string().nullable(),
  imageModelOverride: z.string().nullable(),
});
export const AssetsPlanOutputSchema = z.object({
  assets: z.array(AssetPlanItemSchema),
});
export type AssetsPlanOutput = z.infer<typeof AssetsPlanOutputSchema>;

/* ============================================================
 * Step 6. assets_render — 资产渲染（含选定图）
 * 下游 step（storyboard 等）读这个产物拿 visualAnchor 和 pickedUrl
 * ============================================================ */

export const AssetRenderItemSchema = z.object({
  id: z.string(),
  type: z.enum(["character", "scene", "prop"]),
  name: z.string().min(1).max(40),
  pickedUrl: z.string().url().nullable(),
  visualAnchor: z.string().max(400).nullable(),
  imagePrompt: z.string().nullable(),
});
export const AssetsRenderOutputSchema = z.object({
  assets: z.array(AssetRenderItemSchema),
});
export type AssetsRenderOutput = z.infer<typeof AssetsRenderOutputSchema>;

/* ============================================================
 * 兼容：旧代码引用的 AssetsOutput 等价于新的 AssetsRenderOutput
 * （storyboard runner 仍读 ASSETS_RENDER 的产物）
 * ============================================================ */
export const AssetsOutputSchema = AssetsRenderOutputSchema;
export type AssetsOutput = AssetsRenderOutput;

/* ============================================================
 * Step 7. storyboard — 分镜脚本（已合并 keyframes 生图）
 * ============================================================ */

/** LLM 产出的"分镜计划项"——还没有图 */
export const ShotPlanItemSchema = z.object({
  index: z.number().int().min(1),
  sceneIndex: z.number().int().min(1),
  shotType: z.enum(["wide", "medium", "close", "extreme_close", "over_shoulder"]),
  cameraMove: z.enum(["static", "pan", "zoom_in", "zoom_out", "dolly", "tracking"]),
  durationSec: z.number().min(1).max(20),
  imagePrompt: z.string().min(1).max(800),
  motionHint: z.string().max(300).default(""),
  dialogue: z.string().max(400).default(""),
  assetIds: z.array(z.string()).default([]),
});
export const ShotPlanBatchSchema = z.object({
  shots: z.array(ShotPlanItemSchema).min(1).max(60),
});
export type ShotPlanItem = z.infer<typeof ShotPlanItemSchema>;

/** Storyboard step 的最终产物——含每镜的 keyframe URL（如有） */
export const ShotSchema = z.object({
  index: z.number().int().min(1),
  sceneIndex: z.number().int().min(1),
  shotType: z.enum(["wide", "medium", "close", "extreme_close", "over_shoulder"]),
  cameraMove: z.enum(["static", "pan", "zoom_in", "zoom_out", "dolly", "tracking"]),
  durationSec: z.number().min(1).max(20),
  imagePrompt: z.string().min(1).max(800),
  motionHint: z.string().max(300).default(""),
  dialogue: z.string().max(400).default(""),
  assetIds: z.array(z.string()).default([]),
  /** 关键帧 URL；未生成则为 null */
  keyframeUrl: z.string().url().nullable().default(null),
});

export const StoryboardSchema = z.object({
  shots: z.array(ShotSchema).min(1).max(60),
});
export type StoryboardOutput = z.infer<typeof StoryboardSchema>;

/* ============================================================
 * Step 7. keyframes — 关键帧
 * ============================================================ */

export const KeyframeItemSchema = z.object({
  shotIndex: z.number().int().min(1),
  url: z.string().url(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export const KeyframesOutputSchema = z.object({
  count: z.number().int().min(0),
  items: z.array(KeyframeItemSchema),
  /** 重试用尽仍失败的镜（不阻塞进入 motion 步，由用户决定是否手动重试） */
  failed: z
    .array(
      z.object({
        shotIndex: z.number().int(),
        error: z.string(),
      }),
    )
    .default([]),
});
export type KeyframesOutput = z.infer<typeof KeyframesOutputSchema>;

/* ============================================================
 * Step 8. motion — 视频运动 prompt
 * ============================================================ */

export const MotionItemSchema = z.object({
  shotIndex: z.number().int().min(1),
  motionPrompt: z.string().min(1).max(600),
  durationSec: z.number().min(1).max(20),
});

export const MotionOutputSchema = z.object({
  items: z.array(MotionItemSchema),
});
export type MotionOutput = z.infer<typeof MotionOutputSchema>;

/* ============================================================
 * Step 9. videos — 批量生成视频
 * ============================================================ */

export const VideoItemSchema = z.object({
  shotIndex: z.number().int().min(1),
  url: z.string().url(),
  durationSec: z.number().min(0),
  coverUrl: z.string().url().optional(),
});

export const VideosOutputSchema = z.object({
  count: z.number().int().min(0),
  totalDurationSec: z.number().min(0),
  items: z.array(VideoItemSchema),
  failed: z
    .array(
      z.object({
        shotIndex: z.number().int(),
        error: z.string(),
      }),
    )
    .default([]),
});
export type VideosOutput = z.infer<typeof VideosOutputSchema>;

/* ============================================================
 * Step 10. compose — 成片
 * ============================================================ */

export const ComposeOutputSchema = z.object({
  videoUrl: z.string().url(),
  coverUrl: z.string().url().optional(),
  durationSec: z.number().min(0),
  /** 启用了哪些扩展（与 project.extensions 对照） */
  extensionsApplied: z
    .object({
      bgm: z.boolean().default(false),
      subtitles: z.boolean().default(false),
      multiVoice: z.boolean().default(false),
    })
    .default({ bgm: false, subtitles: false, multiVoice: false }),
});
export type ComposeOutput = z.infer<typeof ComposeOutputSchema>;

/* ============================================================
 * 通用 Candidate 包装
 * ============================================================ */

/** 通用候选项结构（任意 step 的 candidates JSON 解析后都符合这个 shape） */
export const CandidateSchema = z.object({
  id: z.string().min(1),
  /** 此候选数据的语义类型，与 step.kind 关联 */
  kind: z.string(),
  /** 真正的产物数据，结构由 step 决定（runner 应保证已通过对应 schema） */
  data: z.unknown(),
  /** 给前端展示的 Markdown 摘要 */
  mdSummary: z.string().optional(),
  /** 该候选附带的媒体产物 */
  artifacts: z
    .array(
      z.object({
        url: z.string().url(),
        type: z.enum(["image", "video", "audio"]),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        durationSec: z.number().optional(),
      }),
    )
    .optional(),
});

export type Candidate<T = unknown> = {
  id: string;
  kind: string;
  data: T;
  mdSummary?: string;
  artifacts?: { url: string; type: "image" | "video" | "audio"; width?: number; height?: number; durationSec?: number }[];
};

/** 引擎按 stepKey 找对应的产物 schema（runner 跑完 / 落定 output 时调） */
export const STEP_OUTPUT_SCHEMA: Record<string, z.ZodTypeAny> = {
  [STEP_KEYS_V3.ANALYZE]: AnalyzeSchema,
  [STEP_KEYS_V3.DIRECTION]: DirectionDataSchema,
  [STEP_KEYS_V3.OUTLINE]: OutlineSchema,
  [STEP_KEYS_V3.SCRIPT]: ScriptSchema,
  [STEP_KEYS_V3.ASSETS_PLAN]: AssetsPlanOutputSchema,
  [STEP_KEYS_V3.ASSETS_RENDER]: AssetsRenderOutputSchema,
  [STEP_KEYS_V3.STORYBOARD]: StoryboardSchema,
  [STEP_KEYS_V3.KEYFRAMES]: KeyframesOutputSchema,
  [STEP_KEYS_V3.MOTION]: MotionOutputSchema,
  [STEP_KEYS_V3.VIDEOS]: VideosOutputSchema,
  [STEP_KEYS_V3.COMPOSE]: ComposeOutputSchema,
};

/* ============================================================
 * Runner 返回类型
 * ============================================================ */

export type RunnerResultV3 = {
  candidates: Candidate[];
  /** runner 推荐的默认选中项 id（必须出现在 candidates 里） */
  defaultPickedId?: string;
  /** 本次执行是否要求暂停等用户确认（与 step.defaultNeedsConfirm 配合） */
  needsConfirm: boolean;
  cost: number;
  realCost: number;
  modelSlug?: string;
  channelId?: string | null;
  externalId?: string | null;
  meta?: Record<string, unknown>;
};

/** 健壮地把 DB 里 string?/null 的 JSON 字段解析出来 */
export function safeParseJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
