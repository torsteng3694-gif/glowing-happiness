/**
 * 电商一键出图 · 视觉模型调用
 *
 * 直接走聚合上游（ai6700 等）的 OpenAI 兼容 /v1/chat/completions 接口，
 * 自己拼多模态 messages（content 数组形式）。
 *
 * 不复用 v2 callLLM —— 因为 ChatMessage.content 是 string，不支持图片。
 * 但仍复用：pickChannel / getChannelsForModel / chargeUsage / Model 表。
 *
 * 使用：
 *   const out = await callVisionJson({
 *     userId, modelSlug: "gpt-4o",
 *     system: "你是商品分析专家...",
 *     userText: "请分析这些商品图...",
 *     imageUrls: ["https://...", "https://..."],
 *     schema: ProductAnalysisOutputSchema,
 *     metaTag: "ecom-image:product_analysis",
 *   });
 */

import type { z } from "zod";
import { prisma } from "@/lib/db";
import { chargeUsage } from "@/lib/billing";
import { getChannelsForModel, pickChannel } from "@/lib/channels";
import { toUpstreamConfig } from "@/lib/upstream";
import { parseLooseJSON } from "@/lib/comic-agent/helpers";

// ============================================================
// 多模态 message 类型（OpenAI 兼容）
// ============================================================

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

interface VisionMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

// ============================================================
// 直接调上游的工具
// ============================================================

interface UpstreamCallOpts {
  baseUrl: string;
  apiKey: string;
  model: string; // 上游 model slug（可能与 db 里的不同，已应用 channel 覆盖）
  messages: VisionMessage[];
  temperature?: number;
  maxTokens?: number;
}

interface UpstreamCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** 一次性调上游（非流式，简化），返回完整文本 */
async function upstreamChatOnce(opts: UpstreamCallOpts): Promise<UpstreamCallResult> {
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 4000,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upstream vision ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  return {
    text,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

// ============================================================
// 公开 API：callText（纯文本 in/out，不调图，不强制 JSON）
// ============================================================

export interface TextCallOpts {
  userId: string;
  modelSlug: string;
  system?: string;
  userText: string;
  temperature?: number;
  maxTokens?: number;
  metaTag: string;
}

export async function callText(opts: TextCallOpts): Promise<VisionCallResult> {
  return callVision({
    userId: opts.userId,
    modelSlug: opts.modelSlug,
    system: opts.system,
    userText: opts.userText,
    imageUrls: [],
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    metaTag: opts.metaTag,
  });
}

// ============================================================
// 公开 API：callVision（纯文本 reply）
// ============================================================

export interface VisionCallOpts {
  userId: string;
  modelSlug: string;
  system?: string;
  userText: string;
  imageUrls: string[];
  /** 图片质量提示，OpenAI 用 */
  imageDetail?: "low" | "high" | "auto";
  temperature?: number;
  maxTokens?: number;
  metaTag: string;
}

export interface VisionCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  realCost: number;
  modelSlug: string;
  channelId: string | null;
  latencyMs: number;
}

export async function callVision(opts: VisionCallOpts): Promise<VisionCallResult> {
  const model = await prisma.model.findUnique({
    where: { slug: opts.modelSlug },
    include: { provider: true },
  });
  if (!model) throw new Error(`视觉模型不存在: ${opts.modelSlug}`);
  if (model.type !== "chat") throw new Error(`模型 ${opts.modelSlug} 不是 chat 类型`);

  const channel = await pickChannel(model.id, null);
  if (!channel) throw new Error(`模型 ${opts.modelSlug} 没有可用渠道`);

  // 渠道自带 key 优先于上游默认 key
  const upstream = toUpstreamConfig(channel.upstream);
  const apiKey = (channel.apiKey?.trim() || upstream.apiKey).trim();
  const upstreamModel = channel.upstreamModelSlug?.trim() || model.slug;

  // 拼多模态 messages
  const userParts: ContentPart[] = [
    { type: "text", text: opts.userText },
    ...opts.imageUrls.map(
      (url): ContentPart => ({
        type: "image_url",
        image_url: { url, detail: opts.imageDetail ?? "auto" },
      }),
    ),
  ];
  const messages: VisionMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: userParts });

  const start = Date.now();
  let r: UpstreamCallResult;
  try {
    r = await upstreamChatOnce({
      baseUrl: upstream.baseUrl,
      apiKey,
      model: upstreamModel,
      messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
  } catch (e) {
    // 单次失败不再 fallback（视觉调用对 prompt 敏感，多次重试由调用方控制）
    throw new Error(
      `视觉模型调用失败：${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const latencyMs = Date.now() - start;

  const billing = await chargeUsage({
    userId: opts.userId,
    modelId: model.id,
    channelId: channel.id,
    type: "chat",
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    latencyMs,
    meta: { source: opts.metaTag, vision: true, imageCount: opts.imageUrls.length },
  });

  return {
    text: r.text.trim(),
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cost: billing.cost,
    realCost: billing.realCost,
    modelSlug: model.slug,
    channelId: channel.id,
    latencyMs,
  };
}

// ============================================================
// callVisionJson：附带 JSON parse + zod 校验
// ============================================================

export interface VisionJsonOpts<T> extends VisionCallOpts {
  schema: z.ZodType<T>;
}

export interface VisionJsonResult<T> extends VisionCallResult {
  data: T;
  rawText: string;
}

export async function callVisionJson<T>(opts: VisionJsonOpts<T>): Promise<VisionJsonResult<T>> {
  // 第 1 次调用
  const r1 = await callVision({
    ...opts,
    system:
      (opts.system ?? "") +
      "\n\n严格输出**纯 JSON**，不要任何额外文本、注释、Markdown 围栏。",
  });

  let parsed: unknown;
  try {
    parsed = parseLooseJSON(r1.text);
  } catch (firstErr) {
    // 第 2 次：让 LLM 修一遍
    const fixSystem =
      (opts.system ?? "") +
      "\n\n你上一次返回的内容不是有效 JSON。请重新输出**纯 JSON**，不要任何额外文本、注释、Markdown 围栏。";
    const fixUser = `上一次的输出：\n${r1.text.slice(0, 1500)}\n\n请重新输出纯 JSON，严格遵循之前要求的 schema。`;
    const r2 = await callVision({
      ...opts,
      system: fixSystem,
      userText: fixUser,
      imageUrls: [], // 修复阶段不必再带图，省 token
      temperature: 0.2,
      metaTag: opts.metaTag + ":fix-json",
    });
    try {
      parsed = parseLooseJSON(r2.text);
    } catch {
      throw new Error(
        `视觉模型返回非 JSON：${firstErr instanceof Error ? firstErr.message : String(firstErr)}`,
      );
    }
    // 累加成本
    return await finalize<T>(opts, r1, parsed, r1.text + "\n\n[fix]\n" + r2.text, r2);
  }

  return await finalize<T>(opts, r1, parsed, r1.text, null);
}

async function finalize<T>(
  opts: VisionJsonOpts<T>,
  base: VisionCallResult,
  parsed: unknown,
  rawText: string,
  extra: VisionCallResult | null,
): Promise<VisionJsonResult<T>> {
  let check = opts.schema.safeParse(parsed);
  let extraCost = extra;

  // 如果一次性 schema 校验失败，再让 LLM 看错误改一遍
  if (!check.success) {
    const errors = check.error.errors
      .slice(0, 5)
      .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
      .join("; ");
    const fixSystem =
      (opts.system ?? "") +
      "\n\n你上次返回的 JSON 不符合要求的 schema。请严格按 schema 重新输出**纯 JSON**。";
    const fixUser = `上次输出有以下错误：\n${errors}\n\n上次原始内容：\n${rawText.slice(0, 1500)}\n\n请修正后重新输出纯 JSON。`;
    const r3 = await callVision({
      ...opts,
      system: fixSystem,
      userText: fixUser,
      imageUrls: [],
      temperature: 0.2,
      metaTag: opts.metaTag + ":fix-schema",
    });
    try {
      const parsed2 = parseLooseJSON(r3.text);
      check = opts.schema.safeParse(parsed2);
    } catch {
      /* fallthrough */
    }
    extraCost = {
      text: r3.text,
      inputTokens: (extraCost?.inputTokens ?? 0) + r3.inputTokens,
      outputTokens: (extraCost?.outputTokens ?? 0) + r3.outputTokens,
      cost: (extraCost?.cost ?? 0) + r3.cost,
      realCost: (extraCost?.realCost ?? 0) + r3.realCost,
      modelSlug: r3.modelSlug,
      channelId: r3.channelId,
      latencyMs: (extraCost?.latencyMs ?? 0) + r3.latencyMs,
    };
    if (!check.success) {
      throw new Error(
        `视觉模型输出不符合 schema（已重试）：${check.error.errors
          .slice(0, 3)
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; ")}`,
      );
    }
  }
  const extra2 = extraCost;
  const cost = base.cost + (extra2?.cost ?? 0);
  const realCost = base.realCost + (extra2?.realCost ?? 0);
  return {
    data: check.data,
    rawText,
    text: base.text,
    inputTokens: base.inputTokens + (extra2?.inputTokens ?? 0),
    outputTokens: base.outputTokens + (extra2?.outputTokens ?? 0),
    cost,
    realCost,
    modelSlug: base.modelSlug,
    channelId: base.channelId,
    latencyMs: base.latencyMs + (extra2?.latencyMs ?? 0),
  };
}
