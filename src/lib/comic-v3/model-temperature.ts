/**
 * AI 漫剧 · S3.0 — 按模型 slug 分桶 temperature 配置
 *
 * 不同 LLM 对 temperature 的"敏感度"差异极大：
 *   - DeepSeek-Chat 0.4 已经偏发散
 *   - Qwen 系列 0.4 又偏死板
 *   - Claude 0.7 是它"自然写作"的甜蜜点
 *   - GPT 0.7 是经典默认
 *
 * 这里维护一张"按模型族归一化"的温度表：
 *   - stable    — 求稳（分析/拆解类）
 *   - creative  — 求发散（创意方向、剧本扩写）
 *
 * 未在表中的模型走 fallback。
 */

export type TempMode = "stable" | "creative";

type TempBucket = { stable: number; creative: number };

/** 模型族 → 温度。匹配规则：从前往后第一条 prefix 命中的 */
const TEMP_TABLE: Array<{ test: (slug: string) => boolean; bucket: TempBucket }> = [
  // === Claude（Anthropic 系列） ===
  {
    test: (s) => /^claude/i.test(s),
    bucket: { stable: 0.4, creative: 0.95 },
  },
  // === GPT / o-series ===
  {
    test: (s) => /^(gpt|o1|o3|o4|chatgpt)/i.test(s),
    bucket: { stable: 0.4, creative: 0.9 },
  },
  // === DeepSeek（对 temperature 敏感，发散性强） ===
  {
    test: (s) => /^deepseek/i.test(s),
    bucket: { stable: 0.3, creative: 0.85 },
  },
  // === Qwen / Tongyi（偏稳，需要更高温度才发散） ===
  {
    test: (s) => /^(qwen|tongyi)/i.test(s),
    bucket: { stable: 0.5, creative: 1.0 },
  },
  // === Doubao / 字节豆包 ===
  {
    test: (s) => /^doubao/i.test(s),
    bucket: { stable: 0.4, creative: 0.95 },
  },
  // === Grok ===
  {
    test: (s) => /^grok/i.test(s),
    bucket: { stable: 0.4, creative: 0.95 },
  },
  // === Gemini ===
  {
    test: (s) => /^gemini/i.test(s),
    bucket: { stable: 0.4, creative: 0.9 },
  },
  // === Kimi / Moonshot ===
  {
    test: (s) => /^(kimi|moonshot)/i.test(s),
    bucket: { stable: 0.4, creative: 0.9 },
  },
  // === GLM / 智谱 ===
  {
    test: (s) => /^(glm|chatglm)/i.test(s),
    bucket: { stable: 0.5, creative: 1.0 },
  },
];

/** 兜底（任何未识别的 slug） */
const FALLBACK: TempBucket = { stable: 0.4, creative: 0.9 };

/**
 * 根据 modelSlug + 模式取温度。
 */
export function resolveTemperature(modelSlug: string, mode: TempMode): number {
  const slug = modelSlug.toLowerCase();
  for (const row of TEMP_TABLE) {
    if (row.test(slug)) return row.bucket[mode];
  }
  return FALLBACK[mode];
}
