/**
 * AI 漫剧 · S3.0 — 图像调用工具
 *
 * 封装：
 *   - 复用 v2 callImage（计费 + 渠道选择 + COS 转存 + 自动入库）
 *   - 包一层"逐张重试 + 容错"：N 张并发，部分失败不阻塞整体
 */

import { callImage as v2CallImage } from "@/lib/comic-agent/helpers";

export type ImageCallOpts = {
  userId: string;
  modelSlug: string;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  rawParams?: Record<string, unknown>;
  metaTag: string;
  saveAs?: {
    projectId: string;
    /** "subject" 用于 v2 ComicCharacter；v3 我们用 "asset_v3" */
    category: "subject" | "keyframe";
    label?: string;
  };
};

export type ImageCallResult = {
  url: string;
  cost: number;
  realCost: number;
  modelSlug: string;
  channelId: string | null;
};

/**
 * 单张图调用 + 单次重试。
 * 失败抛错由调用方决定怎么处理。
 */
export async function callImageOnce(opts: ImageCallOpts): Promise<ImageCallResult> {
  // size / aspectRatio 兜底
  const finalSize = opts.size || aspectToSize(opts.aspectRatio);
  const rawParams: Record<string, unknown> = { ...(opts.rawParams || {}) };
  if (opts.aspectRatio && rawParams.aspectRatio === undefined && rawParams.aspect_ratio === undefined) {
    rawParams.aspectRatio = opts.aspectRatio;
    rawParams.aspect_ratio = opts.aspectRatio;
  }

  const r = await v2CallImage({
    userId: opts.userId,
    modelSlug: opts.modelSlug,
    prompt: opts.prompt,
    size: finalSize,
    n: 1,
    rawParams,
    metaTag: opts.metaTag,
    saveAs: opts.saveAs,
  });

  if (!r.data.urls.length) {
    throw new Error("图像模型未返回任何图片");
  }
  return {
    url: r.data.urls[0],
    cost: r.cost,
    realCost: r.realCost,
    modelSlug: r.modelSlug,
    channelId: r.channelId,
  };
}

export type ImageMultiCallback = (event:
  | { type: "image"; index: number; total: number; url: string; cost: number; modelSlug: string }
  | { type: "error"; index: number; total: number; error: string }
) => void | Promise<void>;

/**
 * 单 prompt 多候选（同 prompt 跑 N 次，让图像模型用不同 seed 出 N 张）。
 *
 * 关键特性：
 *   - 串行执行（避免上游 deadlock）
 *   - **每出一张图就触发 onProgress 回调**，调用方可以立即写 DB / 推 SSE，不必等全部完成
 *   - 部分失败容忍：返回成功的 URL 数组 + 失败原因，永远不抛错
 */
export async function callImageMulti(opts: ImageCallOpts & {
  count: number;
  onProgress?: ImageMultiCallback;
}): Promise<{
  urls: string[];
  errors: string[];
  totalCost: number;
  totalRealCost: number;
  modelSlug: string;
  channelId: string | null;
}> {
  const total = opts.count;
  const results: Array<PromiseSettledResult<ImageCallResult>> = [];

  for (let i = 0; i < total; i++) {
    try {
      const r = await callImageOnce({
        ...opts,
        metaTag: `${opts.metaTag}:${i + 1}`,
      });
      results.push({ status: "fulfilled", value: r });
      if (opts.onProgress) {
        try {
          await opts.onProgress({
            type: "image",
            index: i,
            total,
            url: r.url,
            cost: r.cost,
            modelSlug: r.modelSlug,
          });
        } catch (cbErr) {
          console.warn("[callImageMulti] onProgress callback failed:", cbErr);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ status: "rejected", reason: e });
      if (opts.onProgress) {
        try {
          await opts.onProgress({ type: "error", index: i, total, error: msg });
        } catch {
          /* ignore */
        }
      }
    }
  }

  const urls: string[] = [];
  const errors: string[] = [];
  let totalCost = 0;
  let totalRealCost = 0;
  let modelSlug = opts.modelSlug;
  let channelId: string | null = null;

  for (const r of results) {
    if (r.status === "fulfilled") {
      urls.push(r.value.url);
      totalCost += r.value.cost;
      totalRealCost += r.value.realCost;
      modelSlug = r.value.modelSlug;
      channelId = r.value.channelId;
    } else {
      errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  return { urls, errors, totalCost, totalRealCost, modelSlug, channelId };
}

/**
 * 简单的并发池：在 limit 内并发执行 tasks，全部完成后返回 settled 结果数组（按入参顺序）。
 * 用于多个 asset 同时生图但又不打爆上游。
 */
export async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        const v = await tasks[i]();
        results[i] = { status: "fulfilled", value: v };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 把 "16:9" 这种 aspect 翻成最常见图像模型的 size 字符串。
 *
 * 兼容性两难：
 *   - 太小（< ~590K 像素）会被 dall-e-3 拒："below the current minimum pixel budget"
 *   - 太大（> 1024×1024 = 1.05M 像素）会被 gpt-image-2 / nano-banana 1K 模型拒：
 *     "1K 模型最大只允许 1048576 像素以内的 size"
 *
 * 折中方案：每个比例都选**总像素接近 1,000,000、长短边都 ≥ 768** 的尺寸。
 *   - 1024×1024 = 1,048,576（刚好 1K 上限，1:1 用这个）
 *   - 1280×768  =   983,040 （略低于 1K，安全；适合 16:9 / 4:3）
 *   - 768×1280  =   983,040 （竖图）
 */
function aspectToSize(aspect?: string): string {
  switch ((aspect || "16:9").trim()) {
    case "9:16":
      return "768x1280";
    case "1:1":
      return "1024x1024";
    case "4:3":
      return "1152x896";
    case "3:4":
      return "896x1152";
    case "21:9":
      return "1280x768";
    case "16:9":
    default:
      return "1280x768";
  }
}
