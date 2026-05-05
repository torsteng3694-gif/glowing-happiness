/**
 * 电商一键出图 · 7 节点 output JSON 的严格 schema
 *
 * 每个节点的 EcomProjectNode.output（String）都是某个 schema 的 JSON.stringify 结果。
 * UI 与引擎共享此处定义，是节点产物的唯一真理之源。
 *
 * 单产物 + 用户编辑/反馈重生模式：节点 01-06 的 output 是单一对象，
 * 不使用 candidates 列表语义（与 comic-v3 区别）。
 */

import { z } from "zod";

// ============================================================
// 通用基础类型
// ============================================================

/** 评级徽章：赢 / 中 / 低 */
export const RatingSchema = z.enum(["win", "mid", "low"]);
export type Rating = z.infer<typeof RatingSchema>;

/** 提示词语言 */
export const PromptLanguageSchema = z.enum(["zh", "en"]);
export type PromptLanguage = z.infer<typeof PromptLanguageSchema>;

/** 垫图引用：可指向用户上传图（source）或已生成图（generated） */
export const ReferenceImageRefSchema = z.object({
  type: z.enum(["source", "generated"]),
  id: z.string(),
});
export type ReferenceImageRef = z.infer<typeof ReferenceImageRefSchema>;

// ============================================================
// 节点 01 · 商品智能分析
// ============================================================

/**
 * AI 推荐的单个出图类型（与 EcomImageType 行一一对应；节点 01 confirm 时落库）
 * 注意：此 schema 是节点 01 LLM 直接输出的形态，落库时再分配 typeKey。
 */
export const RecommendedTypeSchema = z.object({
  typeKey: z.string(),
  name: z.string(),
  description: z.string(),
  /** 优先级标签（自由 tag）："必选"|"推荐"|"高转化" 等 */
  priorityTags: z.array(z.string()).default([]),
  /** 场景标签（自由 tag）："平台必需"|"品牌建设" 等 */
  sceneTags: z.array(z.string()).default([]),
  /** 一句话价值定位（"点击率提升关键"） */
  valueChip: z.string().optional(),
  /** 平台适配 */
  platforms: z.array(z.string()).default([]),
  /** "为什么推荐"长说明 */
  reasoning: z.string().optional(),
  /** AI 评级 */
  rating: RatingSchema.optional(),
});
export type RecommendedType = z.infer<typeof RecommendedTypeSchema>;

/** 节点 01 产物 */
export const ProductAnalysisOutputSchema = z.object({
  /** AI 1 句话项目标题（用户可改，节点 01 也会写到 EcomProject.title） */
  projectTitle: z.string(),
  /** 商品分析综合判断 Markdown 长文（用户可编辑） */
  reportMd: z.string(),
  /** AI 推荐的出图类型池 */
  recommendedTypes: z.array(RecommendedTypeSchema),
});
export type ProductAnalysisOutput = z.infer<typeof ProductAnalysisOutputSchema>;

// ============================================================
// 节点 02 · 资料补全
// ============================================================

/** AI 提的单个问题（QA 模式） */
export const SupplementQuestionSchema = z.object({
  id: z.string(),
  /** 问题文案 */
  question: z.string(),
  /** 提问的目的解释（可选，hover 显示） */
  rationale: z.string().optional(),
  /** 用户答案：null = 未答；"" = 用户主动跳过 */
  answer: z.string().nullable().default(null),
  /** 用户答案附带的图片 URL */
  attachments: z.array(z.string()).default([]),
});
export type SupplementQuestion = z.infer<typeof SupplementQuestionSchema>;

/** 节点 02 产物 */
export const SupplementInfoOutputSchema = z.object({
  /** skip = AI 判定无需补充；qa = 进入多轮问答 */
  mode: z.enum(["skip", "qa"]),
  /** AI 判定理由（skip 模式下作为说明文案显示） */
  judgement: z.string(),
  /** QA 模式下的问题列表（skip 模式时为空） */
  questions: z.array(SupplementQuestionSchema).default([]),
});
export type SupplementInfoOutput = z.infer<typeof SupplementInfoOutputSchema>;

// ============================================================
// 节点 03 · 图片内容分析
// ============================================================

/** 单张图分析结果（与 EcomSourceImage 行一一对应；status 由表字段管理） */
export const ImageAnalysisItemSchema = z.object({
  /** EcomSourceImage.id */
  sourceImageId: z.string(),
  /** AI 生成的标题（用户可编辑） */
  title: z.string(),
  /** AI 生成的详细描述（用户可编辑） */
  description: z.string(),
});
export type ImageAnalysisItem = z.infer<typeof ImageAnalysisItemSchema>;

/** 节点 03 产物（仅维护"已分析"图的列表，excluded/pending 不入此处） */
export const ImageAnalysisOutputSchema = z.object({
  items: z.array(ImageAnalysisItemSchema),
});
export type ImageAnalysisOutput = z.infer<typeof ImageAnalysisOutputSchema>;

// ============================================================
// 节点 04 · 出图方案规划
// ============================================================

/** 单分类的策略（统筹层） */
export const PlanGroupStrategySchema = z.object({
  /** 一句话主张 */
  summary: z.string(),
  /** 展示思路 */
  thinking: z.string(),
  /** 配色方案 */
  colorPlan: z.string(),
  /** 光线建议 */
  lighting: z.string(),
  /** 构图风格 */
  composition: z.string(),
});
export type PlanGroupStrategy = z.infer<typeof PlanGroupStrategySchema>;

/** 单张图规划（与 EcomImagePlan 行一一对应） */
export const ImagePlanItemSchema = z.object({
  /** EcomImagePlan.id */
  planId: z.string(),
  idx: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  /** 自由字符串："1:1"、"3:4"、"1080:720" 等 */
  aspectRatio: z.string(),
  referenceIds: z.array(ReferenceImageRefSchema).default([]),
  origin: z.enum(["auto", "manual", "ai_added"]).default("auto"),
});
export type ImagePlanItem = z.infer<typeof ImagePlanItemSchema>;

/** 单分类组（关联 EcomImageType 行） */
export const PlanGroupSchema = z.object({
  /** EcomImageType.id */
  typeId: z.string(),
  typeKey: z.string(),
  typeName: z.string(),
  description: z.string().optional(),
  priorityTags: z.array(z.string()).default([]),
  sceneTags: z.array(z.string()).default([]),
  valueChip: z.string().optional(),
  platforms: z.array(z.string()).default([]),
  rating: RatingSchema.optional(),
  strategy: PlanGroupStrategySchema,
  plans: z.array(ImagePlanItemSchema),
});
export type PlanGroup = z.infer<typeof PlanGroupSchema>;

/** 节点 04 产物 */
export const PlanCreationOutputSchema = z.object({
  totalGroups: z.number().int().nonnegative(),
  totalImages: z.number().int().nonnegative(),
  groups: z.array(PlanGroupSchema),
});
export type PlanCreationOutput = z.infer<typeof PlanCreationOutputSchema>;

// ============================================================
// 节点 05 · 模型选择
// ============================================================

/** 单个可选模型（节点 05 渲染卡片用；从 Model 表 + Channel 报价聚合而来） */
export const SelectableModelSchema = z.object({
  /** Model.slug */
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  /** 单价（元/张），从 Channel 聚合得到的展示价 */
  unitPrice: z.number().nonnegative(),
  /** 平均生成耗时（秒），可选 */
  avgLatencySec: z.number().positive().optional(),
  /** 推荐场景标签 */
  tags: z.array(z.string()).default([]),
  /** 提示词语言偏好 */
  preferredLanguage: PromptLanguageSchema.optional(),
  /** 示例输出图缩略 */
  sampleUrls: z.array(z.string()).default([]),
});
export type SelectableModel = z.infer<typeof SelectableModelSchema>;

/** 节点 05 产物 */
export const ModelSelectionOutputSchema = z.object({
  /** 候选模型清单 */
  availableModels: z.array(SelectableModelSchema),
  /** 用户选定的模型 slug（confirm 后落到 EcomProject.imageModelSlug） */
  selectedSlug: z.string().nullable().default(null),
  /** 提示词语言 */
  promptLanguage: PromptLanguageSchema.default("zh"),
  /** 每方案出图数（落到 EcomProject.imagesPerPlan） */
  imagesPerPlan: z.number().int().min(1).max(5).default(2),
  /** 总价预估（前端实时计算后写入，便于落库审计） */
  estimatedTotalCost: z.number().nonnegative().default(0),
});
export type ModelSelectionOutput = z.infer<typeof ModelSelectionOutputSchema>;

// ============================================================
// 节点 06 · 提示词生成
// ============================================================

/** 单条提示词（与 EcomImagePlan.prompt 同步；节点 06 确认时回写到 plan 表） */
export const PromptItemSchema = z.object({
  /** EcomImagePlan.id */
  planId: z.string(),
  language: PromptLanguageSchema,
  prompt: z.string(),
  negativePrompt: z.string().default(""),
  /** plan 是否在节点 04 之后被改过；true 时 UI 给"plan 已更新，需重新生成"提示 */
  staleHint: z.boolean().default(false),
});
export type PromptItem = z.infer<typeof PromptItemSchema>;

/** 节点 06 产物 */
export const PromptGenerationOutputSchema = z.object({
  prompts: z.array(PromptItemSchema),
});
export type PromptGenerationOutput = z.infer<typeof PromptGenerationOutputSchema>;

// ============================================================
// 节点 07 · 批量出图
// ============================================================

/**
 * 节点 07 不在 output JSON 里存图片数据（图片在 EcomGeneratedImage 表里）。
 * output 仅存"运行汇总"，图片网格直接 JOIN EcomGeneratedImage 渲染。
 */
export const ImageGenerationOutputSchema = z.object({
  /** 总 plan 数 */
  totalPlans: z.number().int().nonnegative(),
  /** 总候选数（已生成 + 排队中） */
  totalCandidates: z.number().int().nonnegative(),
  /** 已完成的候选数 */
  doneCandidates: z.number().int().nonnegative(),
  /** 失败的候选数 */
  failedCandidates: z.number().int().nonnegative(),
  /** 已被用户挑中的候选数 */
  pickedCandidates: z.number().int().nonnegative(),
  /** 是否全部完成（所有 plan 至少有 1 张 done） */
  allCompleted: z.boolean().default(false),
});
export type ImageGenerationOutput = z.infer<typeof ImageGenerationOutputSchema>;

// ============================================================
// 自动化配置
// ============================================================

export const AutoConfirmFlagsSchema = z.object({
  product_analysis: z.boolean().default(false),
  supplement_info: z.boolean().default(false),
  image_analysis: z.boolean().default(false),
  plan_creation: z.boolean().default(false),
  model_selection: z.boolean().default(false),
  prompt_generation: z.boolean().default(false),
  image_generation: z.boolean().default(false),
});
export type AutoConfirmFlags = z.infer<typeof AutoConfirmFlagsSchema>;

export const AutoConfigSchema = z.object({
  autoConfirm: AutoConfirmFlagsSchema,
  retryChat: z.number().int().min(0).max(20).default(5),
  retryImageGen: z.number().int().min(0).max(20).default(5),
  imagesPerPlan: z.number().int().min(1).max(5).default(2),
  defaultImageModelSlug: z.string().nullable().default(null),
  defaultPromptLanguage: PromptLanguageSchema.default("zh"),
});
export type AutoConfig = z.infer<typeof AutoConfigSchema>;

// ============================================================
// 工具：解析持久化字段
// ============================================================

/** 安全 parse JSON 字段，失败返回 fallback */
export function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
