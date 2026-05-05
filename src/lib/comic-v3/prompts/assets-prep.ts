/**
 * Step 5 准备阶段 prompt — 从 script.charactersPool / scenesPool
 * 推导每个 asset 的 imagePrompt + visualAnchor。
 *
 * 关键产物：
 *   - visualAnchor：一段紧凑、可复用的视觉锚定描述（供后续每张分镜图作为前缀）
 *   - imagePrompt：本次"error"使用的完整 prompt
 *
 * 这一步是文字→视觉的桥梁。如果 LLM 在这里输出"很有气质"这种主观词，
 * 后面图像模型就废了。所以 prompt 极其严格地要求"具体可见的视觉特征"。
 */

import { z } from "zod";
import { SYS_BASE } from "./system";
import type { ScriptOutput } from "../schemas";

export const ASSETS_PREP_SYSTEM = `${SYS_BASE}

你现在的角色：图像 Prompt 工程师。
你将把人物 / 场景描述转写为图像模型可理解的 prompt。

输出原则：
- 只描述**可见的视觉特征**：性别、年龄段、身材、面部特征、发型、穿衣（颜色+材质）、姿态、表情、光线、构图
- 严禁主观词："气质好""帅气""精明""有故事感"——这些词图像模型不认
- 输出**英文 prompt 也可以**（多数图像模型对英文 prompt 更稳定），但保持一致风格
- visualAnchor 必须**紧凑**（≤ 60 词），能作为后续每张分镜图的前缀复用`;

/* ========================================
 * 一次准备一批 assets 的 prompt（批量调用比逐个省 token）
 * ======================================== */

export const AssetPrepItemSchema = z.object({
  /** 与请求里 assets[i].name 完全一致，用来对位 */
  name: z.string().min(1),
  /** 紧凑视觉锚（建议 ≤ 50 词），后续每张分镜图都会拼这段 */
  visualAnchor: z.string().min(1).max(300),
  /** 本次立绘 / 概念图使用的完整 prompt（建议 ≤ 80 词） */
  imagePrompt: z.string().min(1).max(500),
  /** 可选：负面 prompt（避免不想要的元素），建议 ≤ 30 词 */
  negativePrompt: z.string().max(200).optional(),
});

export const AssetPrepBatchSchema = z.object({
  items: z.array(AssetPrepItemSchema).min(1),
});

export type AssetPrepBatch = z.infer<typeof AssetPrepBatchSchema>;

export function buildAssetsPrepUser(opts: {
  script: ScriptOutput;
  /** 项目级风格描述（如 "国风水墨" / "赛博朋克 80s" / null） */
  styleHint?: string | null;
  /** 画面比例（影响构图） */
  aspectRatio: string;
}): string {
  const characters = opts.script.charactersPool.map((c) => ({
    type: "character" as const,
    name: c.name,
    description: c.description,
    importance: c.importance,
  }));
  const scenes = (opts.script.scenesPool || []).map((s) => ({
    type: "scene" as const,
    name: s.name,
    description: s.description,
  }));
  const all = [...characters, ...scenes];

  return `把下列人物/场景描述转写为图像模型 prompt。

# 输入
${JSON.stringify(all, null, 2)}

# 全局风格
风格：${opts.styleHint || "未指定（用现实主义电影质感）"}
比例：${opts.aspectRatio}

# 输出 schema（保持紧凑，避免冗余！）
{
  "items": [
    {
      "name":           "必须等于上面输入的 name 字段（不能改）",
      "visualAnchor":   "≤ 50 英文词，描述核心可识别视觉特征（性别+年龄+发型+穿着+面部锚点）",
      "imagePrompt":    "≤ 80 英文词，含构图（如 'medium shot, three-quarter view'）+ 风格 + 光线",
      "negativePrompt": "可选，≤ 30 英文词（如 'blurry, deformed hands'）"
    }
  ]
}

要求：
- name 必须**严格匹配**输入里的 name
- 所有 visualAnchor 风格要协调（同一光影/年代/画风）
- 角色必须含面部锚定（"square jaw, prominent brow, almond eyes"）保证跨镜一致
- 场景必须含光线/色温/布景，避免空洞描述
- **严格控制长度，不要冗余形容词**——每个字段超长会导致截断
- 若输入空数组，items 也是空数组

请直接输出**纯 JSON 字符串**，不要任何 Markdown 围栏或注释。`;
}
