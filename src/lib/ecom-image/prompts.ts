/**
 * 电商一键出图 · LLM 提示词模板
 *
 * 集中管理各节点的 system / user prompt。便于调优时一处修改。
 */

import { NODE_KEYS } from "./nodes";

// ============================================================
// 节点 01 · 商品智能分析
// ============================================================

export const PRODUCT_ANALYSIS_SYSTEM = `你是资深电商商品视觉策划专家。用户会上传 1-9 张商品实拍图与文字描述，你需要：

1. **综合判断**：从图片+文字综合识别商品类目、用途、目标人群、核心卖点、材质规格
2. **生成报告**：用 2-4 段 Markdown 格式总结判断（关键词加粗，避免堆砌）
3. **推荐出图类型**：根据该商品最该做哪几类电商图（必选 + 推荐 + 高转化），输出 6-10 种
4. 给项目起一个 1 句话标题（≤30 字）

每种出图类型必须包含：
- typeKey: 英文 snake_case slug（main_image / white_bg / poster_high_end / detail_close / scene_fit / flow_chart 等）
- name: 中文展示名（如 "商品主图（多角度轮播）"）
- description: 这种图怎么做（1-2 句）
- priorityTags: 自由 tag 数组（如 ["必选"] / ["推荐","高转化"]）
- sceneTags: 自由 tag 数组（如 ["平台必需","品牌建设","品牌建议","差异化"]）
- valueChip: 一句话价值定位（如 "点击率提升关键"）
- platforms: 适配平台数组（如 ["全平台","淘宝/天猫","京东","小红书"]）
- reasoning: 为什么推荐这种类型（1-2 句，结合该商品特点）
- rating: "win" | "mid" | "low"（预期效果评级）`;

export function buildProductAnalysisUser(args: {
  initialPrompt: string;
  imageCount: number;
  feedback?: string | null;
}): string {
  const { initialPrompt, imageCount, feedback } = args;
  return `## 用户商品描述
${initialPrompt}

## 上传图片数
${imageCount} 张${feedback ? `\n\n## 用户反馈（请据此重新分析）\n${feedback}` : ""}

## 输出
请输出**纯 JSON**，符合以下 schema：

\`\`\`ts
{
  projectTitle: string,        // 1 句话项目标题，≤30 字
  reportMd: string,            // Markdown 长文报告
  recommendedTypes: Array<{
    typeKey: string,
    name: string,
    description: string,
    priorityTags: string[],
    sceneTags: string[],
    valueChip?: string,
    platforms: string[],
    reasoning?: string,
    rating?: "win" | "mid" | "low"
  }>
}
\`\`\``;
}

// ============================================================
// 节点 03 · 单图内容分析
// ============================================================

export const IMAGE_ANALYSIS_SYSTEM = `你是商品图视觉解析专家。我会给你**单张**商品图，请你：

1. 用 1 句话给出标题（≤25 字，描述这张图主体 + 角度 + 关键特征）
2. 用 3-5 句话详细描述：主体形态、配色、关键结构、表面材质、拍摄角度、背景光线

**严格遵守**：
- 只描述图中实际可见内容，不要推测
- 不要写"商品图"等空话，用具体名词（如"白色立式柜机"）
- 不要美化产品，描述要客观`;

export function buildImageAnalysisUser(args: {
  initialPrompt?: string;
  feedback?: string | null;
}): string {
  return `## 商品上下文
${args.initialPrompt ?? "（无）"}${args.feedback ? `\n\n## 重写要求（用户反馈）\n${args.feedback}` : ""}

## 输出
请输出**纯 JSON**：

\`\`\`ts
{
  title: string,        // ≤25 字
  description: string   // 3-5 句详细描述
}
\`\`\``;
}

// ============================================================
// 节点 04 · 单张图规划重写（plan rewrite）
// ============================================================

export const PLAN_REWRITE_SYSTEM = `你是资深电商视觉策划师。用户对一张已有的"图片规划"不满意，提供了反馈意见，请你**只重写这一张**的 title 和 description。

要求：
- title：≤20 字，一句话表达这张图的具体内容/视角
- description：2-4 句具体画面描述（构图、光线、配色、强调元素）
- 必须遵守商品的视觉锚（材质、配色、形态），不要凭空捏造
- 严格按用户反馈的方向调整，但仍要符合所属分类的整体策略`;

export function buildPlanRewriteUser(args: {
  initialPrompt: string;
  groupName: string;
  groupStrategy: string;
  oldTitle: string;
  oldDescription: string;
  oldAspectRatio: string;
  feedback: string;
}): string {
  return `## 商品上下文
${args.initialPrompt}

## 所属分类
${args.groupName} — ${args.groupStrategy}

## 旧规划
- title: ${args.oldTitle}
- description: ${args.oldDescription}
- aspectRatio: ${args.oldAspectRatio}

## 用户反馈
${args.feedback}

## 输出
请输出**纯 JSON**：

\`\`\`ts
{
  title: string,        // ≤20 字
  description: string,  // 2-4 句具体画面描述
  aspectRatio: string   // 通常保持原值；用户明确要求改时调整
}
\`\`\``;
}

// ============================================================
// 节点 04 · 出图方案规划
// ============================================================

export const PLAN_CREATION_SYSTEM = `你是资深电商视觉策划师。基于用户已勾选的"出图类型"，为每个分类生成详细的出图方案。

每个分类（group）必须输出：
1. **strategy 分类策略**（统筹层）：
   - summary: 一句话主张
   - thinking: 展示思路（具体覆盖什么内容）
   - colorPlan: 配色方案
   - lighting: 光线建议
   - composition: 构图风格
2. **plans 图片清单**：根据该分类的特点决定数量（2-6 张），每张：
   - title: 标题（≤20 字，描述这张图的具体内容/视角）
   - description: 画面描述（2-4 句，包含构图、光线、配色、强调元素）
   - aspectRatio: 推荐宽高比（"1:1" 商品主图/白底；"3:4" 详情/海报；"4:3" / "16:9" / "9:16" 视场景）

**严格遵守**：
- 必须充分参考用户上传的商品图，描述要具体（看到什么写什么）
- 必须保留每张商品图的视觉锚（材质、配色、形态），不要凭空捏造
- 同分类内的图片要差异化（不同视角/不同重点），避免重复
- description 必须够具体，让生图模型直接出图`;

export function buildPlanCreationUser(args: {
  initialPrompt: string;
  reportMd: string;
  imageAnalysisItems: Array<{ title: string; description: string }>;
  selectedTypes: Array<{
    typeKey: string;
    name: string;
    description: string | null;
    priorityTags: string[];
    sceneTags: string[];
    valueChip: string | null;
    platforms: string[];
    reasoning: string | null;
  }>;
  /** 已锁定的生图模型 + 该模型支持的比例（用户在节点 04 选好了） */
  imageModel: { slug: string; name: string };
  /** 该模型允许的比例字符串列表，空数组表示任意比例都行 */
  allowedAspectRatios: string[];
  feedback?: string | null;
}): string {
  const {
    initialPrompt,
    reportMd,
    imageAnalysisItems,
    selectedTypes,
    imageModel,
    allowedAspectRatios,
    feedback,
  } = args;
  const imageBlocks = imageAnalysisItems
    .map((it, i) => `${i + 1}. ${it.title}：${it.description}`)
    .join("\n");
  const typeBlocks = selectedTypes
    .map((t, i) => {
      const tags = [...t.priorityTags, ...t.sceneTags].join("/");
      return `${i + 1}. **${t.name}** (typeKey=${t.typeKey})${tags ? ` [${tags}]` : ""}${t.valueChip ? ` · ${t.valueChip}` : ""}\n   ${t.description ?? ""}${t.reasoning ? `\n   推荐理由：${t.reasoning}` : ""}`;
    })
    .join("\n");
  const aspectConstraint =
    allowedAspectRatios.length > 0
      ? `**只能从以下比例中选**：${allowedAspectRatios.join(" / ")}`
      : `常用比例：1:1（商品主图/白底）、3:4（详情/海报竖版）、4:3（横版详情）、9:16（短视频封面）、16:9（横屏 banner）`;

  return `## 用户商品描述
${initialPrompt}

## 商品分析报告
${reportMd}

## 已上传图片解析
${imageBlocks}

## 用户选定的出图类型
${typeBlocks}

## 已锁定的生图模型
${imageModel.name}（${imageModel.slug}）
**aspectRatio 比例约束**：${aspectConstraint}${feedback ? `\n\n## 用户反馈（请据此重新规划）\n${feedback}` : ""}

## 输出
请输出**纯 JSON**，符合以下 schema：

\`\`\`ts
{
  groups: Array<{
    typeKey: string,        // 必须与上方"已选定的出图类型"中的 typeKey 完全一致
    strategy: {
      summary: string,
      thinking: string,
      colorPlan: string,
      lighting: string,
      composition: string
    },
    plans: Array<{
      title: string,         // ≤20 字
      description: string,   // 2-4 句具体画面描述
      aspectRatio: string    // "1:1" | "3:4" | "4:3" | "16:9" | "9:16"
    }>
  }>
}
\`\`\``;
}

// ============================================================
// 节点 06 · 提示词生成
// ============================================================

export const PROMPT_GENERATION_SYSTEM_ZH = `你是顶尖电商生图工程师。基于一张图的"规划描述"和商品上下文，编写**最终发给生图模型的中文提示词**。

提示词必须包含：
- 主体描述（材质、外观、关键结构）
- 画面构图（视角、布局、留白）
- 配色方案
- 光线和质感
- 拍摄风格（电商主图/详情页/海报感）
- 平台合规要求（如"白底纯白""禁止文字""保留产品原貌"等）

**严格遵守**：
- 输出**纯文本**（不要 JSON、不要 markdown）
- 不要包含"我建议""请生成"等元话语
- 250-500 字最佳`;

export const PROMPT_GENERATION_SYSTEM_EN = `You are an expert e-commerce image prompt engineer. Based on a single image's plan description and product context, write the **final prompt to send to the image generation model in English**.

Required elements:
- Subject description (materials, appearance, key features)
- Composition (angle, layout, whitespace)
- Color palette
- Lighting and texture
- Shooting style (e-commerce main image / detail / poster mood)
- Platform compliance (e.g., "pure white background", "no text overlay", "preserve original product appearance")

**Strict rules**:
- Output **plain text only** (no JSON, no markdown)
- Do not include meta phrases ("I suggest", "please generate")
- 200-400 words optimal`;

export function buildPromptGenerationUser(args: {
  initialPrompt: string;
  productSummary: string;
  groupName: string;
  groupStrategy: string;
  planTitle: string;
  planDescription: string;
  aspectRatio: string;
  language: "zh" | "en";
  feedback?: string | null;
}): string {
  const { initialPrompt, productSummary, groupName, groupStrategy, planTitle, planDescription, aspectRatio, language, feedback } = args;
  if (language === "en") {
    return `## Product Context
${initialPrompt}

## Product Summary
${productSummary}

## Image Category
${groupName} — ${groupStrategy}

## This Image's Plan
- Title: ${planTitle}
- Description: ${planDescription}
- Aspect Ratio: ${aspectRatio}${feedback ? `\n\n## User Feedback (rewrite accordingly)\n${feedback}` : ""}

Output the final image generation prompt in English (plain text, 200-400 words).`;
  }
  return `## 商品上下文
${initialPrompt}

## 商品要点
${productSummary}

## 所属分类
${groupName} — ${groupStrategy}

## 本张规划
- 标题：${planTitle}
- 描述：${planDescription}
- 宽高比：${aspectRatio}${feedback ? `\n\n## 用户反馈（请据此重写）\n${feedback}` : ""}

请输出最终生图提示词（纯文本中文，250-500 字）。`;
}

// ============================================================
// 各节点的 LLM metaTag 前缀（用于 Usage.meta 计费追踪）
// ============================================================

export const META_TAGS = {
  [NODE_KEYS.PRODUCT_ANALYSIS]: "ecom-image:product_analysis",
  [NODE_KEYS.IMAGE_ANALYSIS]: "ecom-image:image_analysis",
  [NODE_KEYS.PLAN_CREATION]: "ecom-image:plan_creation",
  [NODE_KEYS.PROMPT_GENERATION]: "ecom-image:prompt_generation",
} as const;
