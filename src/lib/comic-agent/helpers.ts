/**
 * runner 共用工具：
 *   - callLLM      非流式调一次 LLM，自动选渠道、自动计费、返回完整文本与 token 数
 *   - callImage    单张图片生成（按渠道选项价计费）
 *   - callVideo    图生/文生视频（已等到上游同步返回 URL，复用 routeVideo）
 *   - parseJSON    宽容地从模型输出中提取 JSON（容错 ```json fence 等）
 */

import { prisma } from "@/lib/db";
import { routeChat, routeImage, routeVideo } from "@/lib/providers";
import { chargeUsage } from "@/lib/billing";
import { getChannelsForModel, pickChannel } from "@/lib/channels";
import { resolveEffectivePriceFromLoaded } from "@/lib/channel-option-pricing";
import { saveMediaAssets } from "@/lib/media-assets";
import { isCosEnabled, cosUploadFromUrl } from "@/lib/cos";
import type { ChatMessage } from "@/lib/providers/types";
import { snapDuration } from "@/lib/video-duration";

export type CallResult<T> = {
  data: T;
  cost: number;
  realCost: number;
  modelSlug: string;
  channelId: string | null;
  latencyMs: number;
  meta?: Record<string, unknown>;
};

/* =================== LLM =================== */

export async function callLLM(opts: {
  userId: string;
  modelSlug: string;
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  metaTag?: string; // 写入 Usage.meta 的来源标识，比如 "comic-agent:story_analysis"
}): Promise<CallResult<{ text: string; inputTokens: number; outputTokens: number }>> {
  const model = await prisma.model.findUnique({
    where: { slug: opts.modelSlug },
    include: { provider: true },
  });
  if (!model) throw new Error(`LLM 模型不存在: ${opts.modelSlug}`);
  if (model.type !== "chat") throw new Error(`模型 ${opts.modelSlug} 不是 chat 类型`);

  const channel = await pickChannel(model.id, null);
  const fallbacks = channel ? await getChannelsForModel(model.id) : [];

  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const start = Date.now();
  let buf = "";
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const gen = routeChat(
      {
        model: model.slug,
        messages,
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens,
        stream: true,
      },
      model.provider.slug,
      channel,
      fallbacks,
    );
    for await (const chunk of gen) {
      if (chunk.delta) buf += chunk.delta;
      if (chunk.done) {
        inputTokens = chunk.inputTokens || 0;
        outputTokens = chunk.outputTokens || 0;
      }
    }
  } catch (e) {
    throw new Error(`LLM 调用失败：${e instanceof Error ? e.message : String(e)}`);
  }

  const latencyMs = Date.now() - start;
  const billing = await chargeUsage({
    userId: opts.userId,
    modelId: model.id,
    channelId: channel?.id ?? null,
    type: "chat",
    inputTokens,
    outputTokens,
    latencyMs,
    meta: { source: opts.metaTag },
  });

  return {
    data: { text: buf.trim(), inputTokens, outputTokens },
    cost: billing.cost,
    realCost: billing.realCost,
    modelSlug: model.slug,
    channelId: channel?.id ?? null,
    latencyMs,
  };
}

/* =================== Image =================== */

export async function callImage(opts: {
  userId: string;
  modelSlug: string;
  prompt: string;
  size?: string;
  n?: number;
  rawParams?: Record<string, unknown>;
  metaTag?: string;
  /** 传入则自动写入 MediaAsset（"我的作品"） */
  saveAs?: {
    projectId: string;
    /** 来源分类：subject（角色立绘）/ keyframe（分镜图） */
    category: "subject" | "keyframe";
    /** 角色名（subject）或 shotIndex（keyframe） */
    label?: string;
  };
}): Promise<CallResult<{ urls: string[] }>> {
  const model = await prisma.model.findUnique({
    where: { slug: opts.modelSlug },
    include: { provider: true },
  });
  if (!model || model.type !== "image") throw new Error(`图像模型不可用: ${opts.modelSlug}`);

  const channel = await pickChannel(model.id, null);
  const fallbacks = channel ? await getChannelsForModel(model.id) : [];
  const primaryWithOverrides = channel
    ? await prisma.channel.findUnique({
        where: { id: channel.id },
        include: { optionPrices: true },
      })
    : null;

  // 兼容性：Nano Banana 系列（gemini-3-pro-image-preview / gemini-3.1-flash-image-preview）
  // 强制要求 imageSize + aspectRatio 字段。如果调用方没传，自动补默认值。
  // 同样兜底 size = 1024x1024，保证 OpenAI 风格上游也能识别。
  const rawParams: Record<string, unknown> = { ...(opts.rawParams || {}) };
  const isNanoBanana =
    opts.modelSlug === "gemini-3-pro-image-preview" ||
    opts.modelSlug === "gemini-3.1-flash-image-preview";
  if (isNanoBanana) {
    if (
      rawParams.imageSize === undefined &&
      rawParams.image_size === undefined &&
      rawParams.size === undefined
    ) {
      rawParams.imageSize = "1K";
    }
    if (rawParams.aspectRatio === undefined && rawParams.aspect_ratio === undefined) {
      rawParams.aspectRatio = "1:1";
    }
  }
  if (opts.modelSlug === "mj_imagine") {
    if (rawParams.botType === undefined) rawParams.botType = "MID_JOURNEY";
    if (rawParams.aspectRatio === undefined && rawParams.aspect_ratio === undefined) {
      rawParams.aspectRatio = "1:1";
    }
  }
  if (opts.modelSlug === "grok-4.2-image") {
    if (rawParams.size === undefined) rawParams.size = opts.size || "1024x1024";
  }
  const finalN = opts.modelSlug === "grok-4.2-image" ? 2 : (opts.n ?? 1);
  const finalSize = opts.size || "1024x1024";

  const start = Date.now();
  const result = await routeImage(
    {
      model: model.slug,
      prompt: opts.prompt,
      size: finalSize,
      n: finalN,
      rawParams,
    },
    model.provider.slug,
    channel,
    fallbacks,
  );

  const servedChannelId =
    typeof result.meta?.served_channel_id === "string"
      ? (result.meta.served_channel_id as string)
      : channel?.id ?? null;

  let effective = primaryWithOverrides
    ? resolveEffectivePriceFromLoaded(primaryWithOverrides, rawParams)
    : { costUnitPrice: 0, sellUnitPrice: model.unitPrice, matched: null as null | string };
  if (servedChannelId && servedChannelId !== channel?.id) {
    const served = await prisma.channel.findUnique({
      where: { id: servedChannelId },
      include: { optionPrices: true },
    });
    if (served) effective = resolveEffectivePriceFromLoaded(served, rawParams);
  }

  const billing = await chargeUsage({
    userId: opts.userId,
    modelId: model.id,
    channelId: servedChannelId,
    type: "image",
    units: result.images.length,
    latencyMs: Date.now() - start,
    meta: { source: opts.metaTag, prompt: opts.prompt.slice(0, 200) },
    priceOverride: effective.matched
      ? { costUnitPrice: effective.costUnitPrice, sellUnitPrice: effective.sellUnitPrice }
      : null,
  });

  let urls = result.images.map((i) => i.url);

  // 优先把上游临时图床 URL 转存到 COS，避免过期
  if (isCosEnabled() && urls.length > 0) {
    const persisted = await Promise.all(
      urls.map(async (u) => {
        try {
          const cosUrl = await cosUploadFromUrl(u, { dir: `ai-hub/${opts.saveAs?.category || "image"}` });
          return cosUrl || u;
        } catch {
          return u;
        }
      }),
    );
    urls = persisted;
  }

  // 自动入库到「我的作品」
  if (opts.saveAs) {
    saveMediaAssets({
      userId: opts.userId,
      modelId: model.id,
      type: "image",
      urls,
      prompt: opts.prompt,
      params: {
        source: "comic-agent",
        projectId: opts.saveAs.projectId,
        category: opts.saveAs.category,
        label: opts.saveAs.label,
        ...rawParams,
      },
      totalCost: billing.cost,
    }).catch((e) => console.error("[comic-agent] saveMediaAssets image failed:", e));
  }

  return {
    data: { urls },
    cost: billing.cost,
    realCost: billing.realCost,
    modelSlug: model.slug,
    channelId: servedChannelId,
    latencyMs: Date.now() - start,
  };
}

/* =================== Video =================== */

/**
 * 上游 ai6700 / lingkeapi 等不同视频模型对 params 的要求差异极大，
 * 经过实测探针整理出如下规则：
 *
 *   - veo3 / veo3.1 / veo3.1-lite / veo3.1-4k：必传 generation_mode，
 *     合法值是 ai6700 后端定义的几种档位：fast / pro / 标准 / components。
 *     duration 仅支持 8（int），非 8 会被强转为 8。
 *     图生视频字段名是 image_urls（数组，最多 3 张）。
 *
 *   - grok-video-3 / grok-video-3-plus：参数宽松，几乎所有字段名都接受。
 *     duration 支持 6/10 秒（int）。
 *
 *   - kling / kling-* / 可灵-*：image / image_url 任一，duration int。
 *
 *   - viduq3 / viduq3-cankaosheng / vidu-*：image / images 数组，
 *     duration 4-16 int。
 *
 *   - pixverse-* / wan2.* / hailuo-* / doubao-seedance-* / kwvideo-* /
 *     sora / sora-2 / sora-2-2：兜底用全字段广播（image / image_url / images /
 *     image_urls / first_frame_image），上游忽略不识别的字段。
 *
 * 通用约定：
 *   - duration 一律为 number（int），不要传字符串
 *   - aspect_ratio 用 string（"16:9" / "9:16" 等）
 *   - frameUrls 来自调用方（图生视频时的关键帧公网 URL）
 */
export function buildVideoRawParams(opts: {
  modelSlug: string;
  frameUrls: string[];
  duration?: number;
  /** 调用方传入的额外覆盖参数（最高优先级），用于传递 aspect_ratio / negative_prompt / seed 等 */
  override?: Record<string, unknown>;
}): { params: Record<string, unknown>; effectiveDuration: number } {
  const slug = opts.modelSlug.toLowerCase();
  const params: Record<string, unknown> = {};

  // ─────── VEO3 系列 ───────
  // veo3 / veo3.1 / veo3.1-lite / veo3.1-4k / veo-3 / veo3-fast / veo3-pro
  const isVeo3 =
    /^veo[-]?3(\.\d+)?(-(lite|fast|pro|quality|4k|frames|components))?$/.test(slug);
  if (isVeo3) {
    const eff = snapDuration(slug, opts.duration ?? 8); // VEO3 固定 8 秒
    // 实测合法 generation_mode：fast / pro / 标准 / components
    // 未来如果上游加了 frames 模式，可以扩展这里
    const wantMode = (opts.override?.generation_mode as string | undefined) || "fast";
    params.generation_mode = wantMode;
    if (opts.frameUrls.length > 0) {
      params.image_urls = opts.frameUrls.slice(0, 3);
    }
    return {
      params: stripUndefined({ ...params, ...(opts.override || {}) }),
      effectiveDuration: eff,
    };
  }

  // ─────── Vidu 系列 ───────
  // Vidu Q3 / Q3 参考生：duration 仅支持枚举 [4, 8]（实测，其他值会报"参数 duration 的值 X 不合法"）。
  // 其他 Vidu 子模型保持原 4-16 区间。
  // Vidu 系列（含 Vidu Q3 参考生）
  // 接口约定（POST /v1/media/generate）：params 必填 {
  //   model_version: "viduq3" | "viduq3-mix",
  //   images:        string[1..7],
  //   resolution:    "540p" | "720p" | "1080p",
  //   duration:      4 | 8 | 12 | 16,
  //   aspect_ratio:  "auto" | "16:9" | "9:16" | "4:3" | "3:4" | "1:1",
  //   off_peak?:     boolean
  // }
  if (/^vidu/i.test(slug) || /viduq[0-9]/.test(slug)) {
    const ov = (opts.override || {}) as Record<string, unknown>;
    const isViduQ3 = /^viduq3(\b|-)/.test(slug);

    // images：必填，1-7 张
    const images = opts.frameUrls.slice(0, 7);
    if (images.length > 0) {
      params.images = images;
      // 部分历史变体也认 image / image_url，留作兼容
      params.image = images[0];
    }

    // model_version：默认按当前 slug 取，可以被 override 显式覆盖
    if (isViduQ3) {
      const wantVer = typeof ov.model_version === "string" ? ov.model_version.toLowerCase() : "";
      const allowedVer = ["viduq3", "viduq3-mix"];
      params.model_version = allowedVer.includes(wantVer) ? wantVer
        : (slug === "viduq3-mix" ? "viduq3-mix" : "viduq3");
    }

    // resolution：默认 720p
    const wantReso = typeof ov.resolution === "string" ? ov.resolution.toLowerCase() : "";
    const allowedReso = ["540p", "720p", "1080p"];
    params.resolution = allowedReso.includes(wantReso) ? wantReso : "720p";

    // aspect_ratio：默认 auto
    const wantAr = typeof ov.aspect_ratio === "string" ? ov.aspect_ratio
      : typeof ov.aspectRatio === "string" ? (ov.aspectRatio as string)
      : (opts as { aspectRatio?: string }).aspectRatio || "";
    const allowedAr = ["auto", "16:9", "9:16", "4:3", "3:4", "1:1"];
    params.aspect_ratio = allowedAr.includes(wantAr) ? wantAr : "auto";

    // duration：snap 到 {4,8,12,16}
    const eff = snapDuration(slug, opts.duration ?? 4);
    params.duration = eff;

    // off_peak：仅当 override 显式给了才透传
    if (typeof ov.off_peak === "boolean") {
      params.off_peak = ov.off_peak;
    }

    // 不要让 override 覆盖我们刚算好的 model_version / resolution / aspect_ratio / duration
    const ovClean = { ...ov };
    delete ovClean.model_version;
    delete ovClean.resolution;
    delete ovClean.aspect_ratio;
    delete ovClean.aspectRatio;
    delete ovClean.duration;
    delete ovClean.images;
    delete ovClean.image;
    delete ovClean.off_peak;

    return {
      params: stripUndefined({ ...ovClean, ...params }),
      effectiveDuration: eff,
    };
  }

  // ─────── Kling 系列 ───────
  if (/^kling/i.test(slug) || /kling-/.test(slug)) {
    if (opts.frameUrls.length > 0) {
      params.image = opts.frameUrls[0];
      params.image_url = opts.frameUrls[0];
      // 部分 kling 子模型支持多图
      params.images = opts.frameUrls.slice(0, 7);
    }
    return {
      params: stripUndefined({ ...params, ...(opts.override || {}) }),
      effectiveDuration: snapDuration(slug, opts.duration ?? 5),
    };
  }

  // ─────── 即梦 3.5 Pro（字节 Seedance） ───────
  // 实测 ai6700 渠道必填：resolution / generate_audio
  if (slug === "doubao-seedance-1-5-pro-251215") {
    if (opts.frameUrls.length > 0) {
      const u = opts.frameUrls[0];
      params.image = u;
      params.image_url = u;
      params.images = opts.frameUrls.slice(0, 9);
      params.first_frame_image = u;
    }
    const ov = opts.override || {};
    const resoRaw = typeof ov.resolution === "string" ? ov.resolution.toLowerCase() : "";
    params.resolution = resoRaw === "1080p" ? "1080p" : "720p";
    if (ov.generate_audio === undefined) params.generate_audio = true;
    return {
      params: stripUndefined({ ...params, ...ov }),
      effectiveDuration: snapDuration(slug, opts.duration ?? 5),
    };
  }

  // ─────── SD 2.0 参考生（kwvideo-v2-ref） ───────
  // 实测 ai6700 渠道常见必填：resolution
  if (slug === "kwvideo-v2-ref") {
    if (opts.frameUrls.length > 0) {
      params.images = opts.frameUrls.slice(0, 9);
      params.image = opts.frameUrls[0];
      params.image_url = opts.frameUrls[0];
      params.first_frame_image = opts.frameUrls[0];
    }
    const ov = opts.override || {};
    const resoRaw = typeof ov.resolution === "string" ? ov.resolution.toLowerCase() : "";
    params.resolution = resoRaw === "1080p" ? "1080p" : "720p";
    return {
      params: stripUndefined({ ...params, ...ov }),
      effectiveDuration: snapDuration(slug, opts.duration ?? 5),
    };
  }

  // ─────── Sora-2 官转版（sora-2 / sora-2-2） ───────
  // 文档要求：params.seconds(4/8/12) + params.size(1280x720/720x1280) + 可选 input_reference
  if (slug === "sora-2" || slug === "sora-2-2") {
    const ov = opts.override || {};
    const want = Number(ov.seconds ?? opts.duration ?? 4);
    const sec = String(snapDuration(slug, want));
    const sizeRaw = String(ov.size ?? "");
    const size = sizeRaw === "720x1280" || sizeRaw === "1280x720" ? sizeRaw : "1280x720";
    params.seconds = sec;
    params.size = size;
    if (opts.frameUrls.length > 0) {
      const u = opts.frameUrls[0];
      params.input_reference = u;
      // 兼容一些上游别名字段（即使不识别也会忽略）
      params.image = u;
      params.image_url = u;
      params.first_frame_image = u;
      params.images = [u];
    }
    return {
      params: stripUndefined({ ...ov, ...params }),
      effectiveDuration: Number(sec),
    };
  }

  // ─────── 通用兜底（grok / pixverse / wan / hailuo / sora / doubao 等） ───────
  if (opts.frameUrls.length > 0) {
    const u = opts.frameUrls[0];
    params.image = u;
    params.image_url = u;
    params.images = opts.frameUrls;
    params.image_urls = opts.frameUrls;
    params.first_frame_image = u;
  }
  return {
    params: stripUndefined({ ...params, ...(opts.override || {}) }),
    effectiveDuration: snapDuration(slug, opts.duration ?? 5),
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  const v = Math.round(n);
  return Math.max(min, Math.min(max, v));
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

export async function callVideo(opts: {
  userId: string;
  modelSlug: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  rawParams?: Record<string, unknown>;
  metaTag?: string;
  saveAs?: {
    projectId: string;
    /** shot（分镜片段）/ final（最终成片） */
    category: "shot" | "final";
    label?: string;
  };
}): Promise<CallResult<{ url: string; duration: number; coverUrl?: string }>> {
  const model = await prisma.model.findUnique({
    where: { slug: opts.modelSlug },
    include: { provider: true },
  });
  if (!model || model.type !== "video") throw new Error(`视频模型不可用: ${opts.modelSlug}`);

  const channel = await pickChannel(model.id, null);
  const fallbacks = channel ? await getChannelsForModel(model.id) : [];

  // 从原始 rawParams 抽出 frameUrls（兼容老调用方传 image / image_url / images / first_frame_image）
  const r = (opts.rawParams || {}) as Record<string, unknown>;
  const collected: string[] = [];
  const tryPushUrl = (v: unknown) => {
    if (typeof v === "string" && v && !collected.includes(v)) collected.push(v);
    else if (Array.isArray(v))
      for (const it of v)
        if (typeof it === "string" && it && !collected.includes(it)) collected.push(it);
  };
  tryPushUrl(r.image_urls);
  tryPushUrl(r.images);
  tryPushUrl(r.image);
  tryPushUrl(r.image_url);
  tryPushUrl(r.first_frame_image);

  // 用调用方原 rawParams 中的"非 URL 类"参数作为 override（如 negative_prompt / seed / resolution 等）
  const override: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (
      k === "image" ||
      k === "image_url" ||
      k === "images" ||
      k === "image_urls" ||
      k === "first_frame_image"
    )
      continue;
    override[k] = v;
  }

  const built = buildVideoRawParams({
    modelSlug: model.slug,
    frameUrls: collected,
    duration: opts.duration,
    override,
  });

  const start = Date.now();
  const result = await routeVideo(
    {
      model: model.slug,
      prompt: opts.prompt,
      duration: built.effectiveDuration,
      aspectRatio: opts.aspectRatio,
      rawParams: built.params,
    },
    model.provider.slug,
    channel,
    fallbacks,
  );

  const servedChannelId =
    typeof result.meta?.served_channel_id === "string"
      ? (result.meta.served_channel_id as string)
      : channel?.id ?? null;

  const billing = await chargeUsage({
    userId: opts.userId,
    modelId: model.id,
    channelId: servedChannelId,
    type: "video",
    units: result.duration || opts.duration || 5,
    latencyMs: Date.now() - start,
    meta: { source: opts.metaTag, prompt: opts.prompt.slice(0, 200) },
  });

  // 转存到 COS 避免过期
  let finalVideoUrl = result.videoUrl;
  let finalCoverUrl = result.coverUrl;
  if (isCosEnabled()) {
    try {
      const cv = await cosUploadFromUrl(result.videoUrl, {
        dir: `ai-hub/${opts.saveAs?.category || "video"}`,
      });
      if (cv) finalVideoUrl = cv;
    } catch {}
    if (result.coverUrl) {
      try {
        const cc = await cosUploadFromUrl(result.coverUrl, {
          dir: `ai-hub/${opts.saveAs?.category || "video"}-cover`,
        });
        if (cc) finalCoverUrl = cc;
      } catch {}
    }
  }

  if (opts.saveAs) {
    saveMediaAssets({
      userId: opts.userId,
      modelId: model.id,
      type: "video",
      urls: [finalVideoUrl],
      thumbnailUrl: finalCoverUrl,
      durationSec: result.duration,
      prompt: opts.prompt,
      params: {
        source: "comic-agent",
        projectId: opts.saveAs.projectId,
        category: opts.saveAs.category,
        label: opts.saveAs.label,
        aspectRatio: opts.aspectRatio,
        ...opts.rawParams,
      },
      totalCost: billing.cost,
    }).catch((e) => console.error("[comic-agent] saveMediaAssets video failed:", e));
  }

  return {
    data: { url: finalVideoUrl, duration: result.duration, coverUrl: finalCoverUrl },
    cost: billing.cost,
    realCost: billing.realCost,
    modelSlug: model.slug,
    channelId: servedChannelId,
    latencyMs: Date.now() - start,
  };
}

/* =================== JSON 容错解析 =================== */

/**
 * 模型可能返回：
 *   ```json\n{...}\n```
 *   "前置说明 ...\n{...}"
 *   纯 JSON
 *   字符串里夹未转义的中文/英文双引号
 * 这里尝试多种方式抽取并修复，直到 parse 通过。
 */
export function parseLooseJSON<T = unknown>(raw: string): T {
  if (!raw) throw new Error("LLM 返回空内容");
  const text = raw.trim();

  const candidates: string[] = [];
  candidates.push(text);

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) candidates.push(objMatch[0]);

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) candidates.push(arrMatch[0]);

  // 直接尝试
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {}
  }
  // 修复后再尝试
  for (const c of candidates) {
    const repaired = repairJSON(c);
    if (repaired !== c) {
      try {
        return JSON.parse(repaired) as T;
      } catch {}
    }
  }

  throw new Error(`LLM 输出不是有效 JSON：${text.slice(0, 240)}`);
}

/**
 * 修复 LLM 常见的非法 JSON：
 *   1) 把全角中文双引号 “ ” 替换为 ASCII 双引号
 *   2) 字符串值内未转义的 ASCII 双引号自动转义
 *      —— 启发式实现：扫一遍，记录"是否在字符串里"，遇到字符串内的 " 但下一个非空白
 *      字符不是 , } ] : 时，认为是字符串内嵌引号，给它前面加 \
 *   3) 删除尾随逗号  ,}  ,]
 */
function repairJSON(s: string): string {
  // 全角引号 → ASCII
  let t = s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // 删除尾随逗号
  t = t.replace(/,(\s*[\]}])/g, "$1");

  // 转义字符串内未闭合的引号
  let out = "";
  let inStr = false;
  let escape = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (escape) {
      out += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      if (!inStr) {
        inStr = true;
        out += ch;
        continue;
      }
      // 已在字符串里，看下一个非空白字符
      let j = i + 1;
      while (j < t.length && /\s/.test(t[j])) j++;
      const next = t[j];
      if (next === undefined || next === "," || next === "}" || next === "]" || next === ":") {
        // 这是真正的闭合引号
        inStr = false;
        out += ch;
      } else {
        // 字符串里的内嵌引号，转义
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 项目预估总价：把 11 步的 estUnits × 平均单价 求和。
 * 这里给一个粗略上限，主要用于"创建项目时校验余额"和"前端展示"。
 */
export async function estimateProjectCost(input: {
  llmSlug: string;
  imageSlug: string;
  videoSlug: string;
}): Promise<{ total: number; breakdown: Record<string, number> }> {
  const [llm, img, vid] = await Promise.all([
    prisma.model.findUnique({ where: { slug: input.llmSlug } }),
    prisma.model.findUnique({ where: { slug: input.imageSlug } }),
    prisma.model.findUnique({ where: { slug: input.videoSlug } }),
  ]);

  // LLM 按 K tokens：估每步输出 1.5k token, 单价取 outputPrice
  const llmPerKOut = llm?.outputPrice ?? 0.01;
  // 7 个 LLM 步骤 + 估 ~16k 输出 token
  const llmCost = llmPerKOut * 16;

  // 图像：主体绑定 3 张 + 关键帧 8 张
  const imgUnit = img?.unitPrice ?? 0.5;
  const imgCost = imgUnit * 11;

  // 视频：8 镜 × 5s = 40s（图生视频按秒计费）
  const vidUnit = vid?.unitPrice ?? 0.5;
  const vidCost = vidUnit * 40;

  // 合成：再按视频单价 × 总秒数
  const composeCost = vidUnit * 40 * 0.3;

  const total = +(llmCost + imgCost + vidCost + composeCost).toFixed(2);
  return {
    total,
    breakdown: {
      llm: +llmCost.toFixed(2),
      image: +imgCost.toFixed(2),
      video: +vidCost.toFixed(2),
      compose: +composeCost.toFixed(2),
    },
  };
}
