/**
 * AI 漫剧 · S3.0 — LLM 调用工具
 *
 * 封装策略：
 *   - 复用 v2 的 callLLM（已经稳定的计费 + 渠道选择 + fallback 链）
 *   - 复用 v2 的 parseLooseJSON（容错三道护栏）
 *   - 三层重试：
 *     1) JSON 解析失败 + 输出疑似被截断 → 翻倍 maxTokens 重试一次（治"输出截断"）
 *     2) JSON 解析失败 + 不像截断 → 让 LLM 看原始输出修一遍
 *     3) zod 校验不通过 → 让 LLM 看错误改一遍
 */

import type { z } from "zod";
import { callLLM as v2CallLLM, parseLooseJSON } from "@/lib/comic-agent/helpers";
import { resolveTemperature } from "./model-temperature";

export type LLMCallOpts<T> = {
  userId: string;
  modelSlug: string;
  /** 系统消息，会前置；建议放角色定位 + 输出契约 */
  system?: string;
  user: string;
  /** 期望温度；不传则按 modelSlug 在 model-temperature 里取分桶默认 */
  temperature?: number;
  maxTokens?: number;
  /** zod schema：解析后强校验。失败会自动让 LLM 看错误重试 1 次 */
  schema: z.ZodType<T>;
  /** 写 Usage.meta 的来源标识 */
  metaTag: string;
  /** 软层：希望让 LLM 输出更随机时，把 mode 设为 "creative"；默认 "stable" */
  mode?: "stable" | "creative";
};

export type LLMCallResult<T> = {
  data: T;
  rawText: string;
  cost: number;
  realCost: number;
  modelSlug: string;
  channelId: string | null;
  inputTokens: number;
  outputTokens: number;
};

/**
 * 检测 LLM 输出是否疑似被 maxTokens 截断。
 * 启发式：
 *   - 末尾不是 } 或 ]
 *   - 没有 ```json``` 围栏，但花括号 / 方括号不平衡
 */
function looksTruncated(raw: string): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;

  const last = trimmed.slice(-1);
  // 完整 JSON 一定以 } 或 ] 收尾（极少数 ```json...``` 围栏除外，下面会处理）
  if (last !== "}" && last !== "]" && last !== "`") return true;

  // 计算花括号 / 方括号是否平衡（容错版：不进 string 内部精算，但能抓 80% 的截断）
  let braces = 0;
  let brackets = 0;
  let inStr = false;
  let escape = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }
  return braces > 0 || brackets > 0 || inStr;
}

/**
 * 调用 LLM 并强校验产物。
 *
 * 失败重试链：
 *   1) JSON 解析失败 + looksTruncated → 翻倍 maxTokens 重试一次
 *   2) JSON 解析失败 + 不像截断 → 让 LLM 修一次
 *   3) zod 校验不通过 → 让 LLM 看错误改一次
 *
 * 最终仍失败：抛错。引擎会把这一步标 failed，用户可手动 retry。
 */
export async function callLLMJson<T>(opts: LLMCallOpts<T>): Promise<LLMCallResult<T>> {
  const temp = opts.temperature ?? resolveTemperature(opts.modelSlug, opts.mode ?? "stable");
  const baseMaxTokens = opts.maxTokens ?? 4000;

  // —— 第 1 次调用 ——
  const r1 = await v2CallLLM({
    userId: opts.userId,
    modelSlug: opts.modelSlug,
    system: opts.system,
    user: opts.user,
    temperature: temp,
    maxTokens: baseMaxTokens,
    metaTag: opts.metaTag,
  });

  let parsed: unknown;
  let totalCost = r1.cost;
  let totalRealCost = r1.realCost;
  let totalInputTokens = r1.data.inputTokens;
  let totalOutputTokens = r1.data.outputTokens;
  let lastModelSlug = r1.modelSlug;
  let lastChannelId = r1.channelId;
  let lastRaw = r1.data.text;

  try {
    parsed = parseLooseJSON(r1.data.text);
  } catch (firstErr) {
    // —— 重试策略 A：疑似截断 → 翻倍 maxTokens 重发完整请求 ——
    if (looksTruncated(r1.data.text)) {
      const r1b = await v2CallLLM({
        userId: opts.userId,
        modelSlug: opts.modelSlug,
        system: opts.system,
        user: opts.user,
        temperature: temp,
        maxTokens: baseMaxTokens * 2,
        metaTag: opts.metaTag + ":retry-bigger",
      });
      totalCost += r1b.cost;
      totalRealCost += r1b.realCost;
      totalInputTokens += r1b.data.inputTokens;
      totalOutputTokens += r1b.data.outputTokens;
      lastModelSlug = r1b.modelSlug;
      lastChannelId = r1b.channelId;
      lastRaw = r1b.data.text;
      try {
        parsed = parseLooseJSON(r1b.data.text);
      } catch (secondErr) {
        const stillTrunc = looksTruncated(r1b.data.text);
        throw new Error(
          stillTrunc
            ? `LLM 输出仍被截断（建议拆分该步骤或换更大 context 模型）：${secondErr instanceof Error ? secondErr.message : String(secondErr)}`
            : `LLM 返回非 JSON：${secondErr instanceof Error ? secondErr.message : String(secondErr)}`,
        );
      }
    } else {
      // —— 重试策略 B：不是截断而是格式问题 → 让 LLM 看原始输出修一遍 ——
      const fixSystem =
        (opts.system ?? "") +
        "\n\n你上一次返回的内容不是有效 JSON。请重新输出**纯 JSON**，不要任何额外文本、注释、Markdown 围栏。";
      const fixUser = `上一次的输出（截断）：
${r1.data.text.slice(0, 1500)}

请重新输出纯 JSON，严格遵循之前要求的 schema。`;
      const rfix = await v2CallLLM({
        userId: opts.userId,
        modelSlug: opts.modelSlug,
        system: fixSystem,
        user: fixUser,
        temperature: 0.2,
        maxTokens: baseMaxTokens,
        metaTag: opts.metaTag + ":fix-json",
      });
      totalCost += rfix.cost;
      totalRealCost += rfix.realCost;
      totalInputTokens += rfix.data.inputTokens;
      totalOutputTokens += rfix.data.outputTokens;
      lastModelSlug = rfix.modelSlug;
      lastChannelId = rfix.channelId;
      lastRaw = rfix.data.text;
      try {
        parsed = parseLooseJSON(rfix.data.text);
      } catch (e) {
        throw new Error(
          `LLM 返回非 JSON：${firstErr instanceof Error ? firstErr.message : String(firstErr)}`,
        );
      }
    }
  }

  // —— Zod 校验 ——
  const check = opts.schema.safeParse(parsed);
  if (check.success) {
    return {
      data: check.data,
      rawText: lastRaw,
      cost: totalCost,
      realCost: totalRealCost,
      modelSlug: lastModelSlug,
      channelId: lastChannelId,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    };
  }

  // —— 重试策略 C：zod 校验失败 → 让 LLM 看错误改一遍 ——
  const issues = check.error.issues
    .slice(0, 5)
    .map((i) => `- 字段 ${i.path.join(".") || "(根)"}: ${i.message}`)
    .join("\n");
  const fixSystem =
    (opts.system ?? "") +
    "\n\n你上一次返回的 JSON 不符合校验规则。请仔细阅读以下错误，修正后重新输出**符合 schema 的 JSON**，不要任何额外文本。";
  const fixUser = `上一次的输出（截断）：
${lastRaw.slice(0, 1500)}

错误：
${issues}

请重新输出符合规则的 JSON。`;

  const r2 = await v2CallLLM({
    userId: opts.userId,
    modelSlug: opts.modelSlug,
    system: fixSystem,
    user: fixUser,
    temperature: 0.2,
    maxTokens: baseMaxTokens,
    metaTag: opts.metaTag + ":fix-schema",
  });
  totalCost += r2.cost;
  totalRealCost += r2.realCost;
  totalInputTokens += r2.data.inputTokens;
  totalOutputTokens += r2.data.outputTokens;
  lastModelSlug = r2.modelSlug;
  lastChannelId = r2.channelId;
  lastRaw = r2.data.text;

  let parsed2: unknown;
  try {
    parsed2 = parseLooseJSON(r2.data.text);
  } catch (e) {
    throw new Error(
      `LLM 修正后仍非 JSON：${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const check2 = opts.schema.safeParse(parsed2);
  if (!check2.success) {
    const moreIssues = check2.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(根)"}: ${i.message}`)
      .join("; ");
    throw new Error(`LLM 输出仍不符合 schema：${moreIssues}`);
  }

  return {
    data: check2.data,
    rawText: lastRaw,
    cost: totalCost,
    realCost: totalRealCost,
    modelSlug: lastModelSlug,
    channelId: lastChannelId,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
