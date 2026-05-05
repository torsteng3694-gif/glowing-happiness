/**
 * 电商一键出图 · 单图生成调用
 *
 * 复用 v2 callImage，已自带：
 *   - channel 选择 + fallback 链
 *   - COS 转存（避免上游临时 URL 过期）
 *   - chargeUsage 计费 + Usage 落库
 *
 * 此层只负责把 ecom-image 的语义（plan + aspectRatio + 垫图）翻译成 callImage 入参。
 */

import { callImage as v2CallImage } from "@/lib/comic-agent/helpers";
import { applyReferenceImages, resolveImageParams } from "./image-model-specs";

export interface EcomImageGenOpts {
  userId: string;
  modelSlug: string;
  prompt: string;
  /** "1:1" / "3:4" 等；会同时传 aspectRatio + 推算 size */
  aspectRatio: string;
  /** 上游可达的图片 URL 列表（"以图改图"垫图） */
  referenceImageUrls?: string[];
  metaTag: string;
  /** 落 MediaAsset 用 */
  saveAs?: {
    projectId: string;
    label?: string;
  };
}

export interface EcomImageGenResult {
  /** 已落 COS 的永久 URL（COS 不可用时是上游临时 URL） */
  url: string;
  cost: number;
  realCost: number;
  modelSlug: string;
  channelId: string | null;
  latencyMs: number;
}

// aspectToSize 已迁移到 image-model-specs.ts（每模型独立适配）

export async function generateOneImage(opts: EcomImageGenOpts): Promise<EcomImageGenResult> {
  // 按模型规格解析参数（size / aspectRatio / 模型专属 extraParams）
  const resolved = resolveImageParams(opts.modelSlug, opts.aspectRatio);

  let rawParams: Record<string, unknown> = {
    ...resolved.extraParams,
    // 多模型把比例字段名混着用，都塞最大兼容
    aspectRatio: resolved.aspectRatio,
    aspect_ratio: resolved.aspectRatio,
  };

  // 垫图（以图改图）：按模型 spec 选择正确的字段名 + 自动截断到模型最大支持数
  if (opts.referenceImageUrls && opts.referenceImageUrls.length > 0) {
    rawParams = applyReferenceImages(opts.modelSlug, rawParams, opts.referenceImageUrls);
  }

  const r = await v2CallImage({
    userId: opts.userId,
    modelSlug: opts.modelSlug,
    prompt: opts.prompt,
    size: resolved.size, // 仅 needsSize 模型有值
    n: 1,
    rawParams,
    metaTag: opts.metaTag,
    saveAs: opts.saveAs
      ? {
          projectId: opts.saveAs.projectId,
          category: "keyframe",
          label: opts.saveAs.label,
        }
      : undefined,
  });

  const url = r.data.urls[0];
  if (!url) throw new Error("上游未返回图片 URL");

  return {
    url,
    cost: r.cost,
    realCost: r.realCost,
    modelSlug: r.modelSlug,
    channelId: r.channelId,
    latencyMs: r.latencyMs,
  };
}
