/**
 * 生图模型 · 尺寸/比例适配表
 *
 * 每个生图模型对宽高、像素、比例的约束都不一样。
 * 这个文件集中维护"用户给个 aspectRatio → 输出该模型能接受的最优 size"的逻辑。
 *
 * 数据来源：
 *   - gpt-image-2 / gpt-image-2-all：上游报错 "size 总像素不能小于 655360"
 *     → 实测 minPixels=655360；用 1024 做长边比较稳
 *   - gemini-3-pro-image-preview (Nano Banana Pro)：参数走 imageSize: "1K"|"2K"|"4K" + aspectRatio
 *     → 不强制 size，只看 aspectRatio
 *   - gemini-3.1-flash-image-preview (Nano Banana 2)：同上，但支持极端比例 1:4/4:1/1:8/8:1
 *   - mj_imagine (Midjourney)：botType + aspectRatio，不接受 size，只接受 1:1/3:4/4:3/9:16/16:9 等常见比例
 *   - grok-4.2-image：接受 size 字符串，19 种固定尺寸
 *
 * 调用入口：
 *   - getModelSpec(slug) 拿 spec
 *   - resolveImageParams(slug, aspectRatio) 直接返回 { size?, rawParamsExtra? }
 */

export interface ImageModelSpec {
  /** 内部名（仅日志/调试用） */
  family: "openai" | "nano-banana" | "midjourney" | "grok" | "generic";

  /** 是否需要传 size（OpenAI 风格 "WIDTHxHEIGHT"） */
  needsSize: boolean;

  /** 总像素下限（仅当 needsSize=true 时生效） */
  minPixels: number;
  /** 总像素上限 */
  maxPixels: number;
  /** 短边下限 */
  minShort: number;
  /** 长边上限 */
  maxLong: number;
  /** 对齐倍数 */
  align: number;

  /**
   * 该模型支持的"原生比例字符串"。
   * 比例不在此列表 → 选择最接近的一个回退（避免传上游不认的）。
   * 空数组 = 不限制（比如 OpenAI/grok 是 size 控制）
   */
  supportedAspectRatios: string[];

  /** rawParams 中如何传 aspectRatio（key 名） */
  aspectKey?: "aspectRatio" | "aspect_ratio" | "both";

  /** 默认 imageSize / quality 等额外参数（如 Nano Banana 系列） */
  defaultExtraParams?: Record<string, unknown>;

  /**
   * 垫图（"以图改图"）传给上游时使用的字段名。
   * - "image_array" → rawParams.image = [url1, url2, ...]（OpenAI gpt-image-2 / DALL-E edit 接受数组）
   * - "image_single" → rawParams.image = url1（只取第一张）
   * - "images_array" → rawParams.images = [url1, ...]
   * - "image_url"   → rawParams.image_url = url1
   * - "all"         → 同时塞 image / images / image_url（最大兼容）
   * - "none"        → 不支持垫图
   */
  referenceImageKey: "image_array" | "image_single" | "images_array" | "image_url" | "all" | "none";

  /** 单次最多接受几张垫图（默认 4） */
  maxReferenceImages: number;
}

const DEFAULT_SPEC: ImageModelSpec = {
  family: "generic",
  needsSize: true,
  minPixels: 524_288, // 1024×512
  maxPixels: 4_194_304, // 2048×2048
  minShort: 768,
  maxLong: 2048,
  align: 16, // 多数 diffusion / OpenAI 系列模型都要求 16 的倍数，安全默认
  supportedAspectRatios: [],
  aspectKey: "both",
  referenceImageKey: "all", // 默认最大兼容
  maxReferenceImages: 4,
};

/** 已知模型规格表 */
const MODEL_SPECS: Record<string, Partial<ImageModelSpec>> = {
  // ====== OpenAI gpt-image-2 ======
  "gpt-image-2-all": {
    family: "openai",
    needsSize: true,
    minPixels: 655_360, // 上游硬限制
    maxPixels: 4_194_304,
    minShort: 832,
    maxLong: 2048,
    align: 16, // gpt-image-2 要求宽高都是 16 的倍数
    supportedAspectRatios: [],
    aspectKey: "both",
    // gpt-image-2 接受 image 数组（OpenAI Image Edit 风格）
    referenceImageKey: "image_array",
    maxReferenceImages: 9,
  },
  "gpt-image-2": {
    family: "openai",
    needsSize: true,
    minPixels: 655_360,
    maxPixels: 4_194_304,
    minShort: 832,
    maxLong: 2048,
    align: 16,
    supportedAspectRatios: [],
    aspectKey: "both",
    referenceImageKey: "image_array",
    maxReferenceImages: 9,
  },

  // ====== Nano Banana 系列（谷歌 Gemini Image）======
  "gemini-3-pro-image-preview": {
    family: "nano-banana",
    needsSize: false, // 不需要 size
    minPixels: 0,
    maxPixels: 0,
    minShort: 0,
    maxLong: 0,
    align: 1,
    supportedAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"],
    aspectKey: "both",
    defaultExtraParams: { imageSize: "2K" },
    // Nano Banana Pro 支持文生图 + 图生图，垫图字段 image / images
    referenceImageKey: "all",
    maxReferenceImages: 4,
  },
  "gemini-3.1-flash-image-preview": {
    family: "nano-banana",
    needsSize: false,
    minPixels: 0,
    maxPixels: 0,
    minShort: 0,
    maxLong: 0,
    align: 1,
    // Nano Banana 2 支持极端比例
    supportedAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "1:4", "4:1", "1:8", "8:1"],
    aspectKey: "both",
    defaultExtraParams: { imageSize: "1K" },
    referenceImageKey: "all",
    maxReferenceImages: 4,
  },

  // ====== Midjourney ======
  "mj_imagine": {
    family: "midjourney",
    needsSize: false,
    minPixels: 0,
    maxPixels: 0,
    minShort: 0,
    maxLong: 0,
    align: 1,
    supportedAspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"],
    aspectKey: "aspect_ratio",
    defaultExtraParams: { botType: "MID_JOURNEY" },
    // MJ 走 image_url 单图（垫图）
    referenceImageKey: "image_url",
    maxReferenceImages: 4,
  },

  // ====== Grok 4.2 Image ======
  "grok-4.2-image": {
    family: "grok",
    needsSize: true,
    minPixels: 524_288,
    maxPixels: 2_359_296, // 1536×1536
    minShort: 768,
    maxLong: 1536,
    align: 16,
    supportedAspectRatios: [],
    aspectKey: "both",
    referenceImageKey: "image_url",
    maxReferenceImages: 1,
  },
};

/** 拿模型 spec（找不到走 default） */
export function getModelSpec(slug: string): ImageModelSpec {
  const partial = MODEL_SPECS[slug];
  if (!partial) return { ...DEFAULT_SPEC };
  return { ...DEFAULT_SPEC, ...partial };
}

/** 解析 aspectRatio 字符串到 [w, h] 数字（默认 [1,1]） */
function parseAspect(ar: string): [number, number] {
  const m = ar.match(/^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return [1, 1];
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return [1, 1];
  return [w, h];
}

/** 找到 supportedAspectRatios 里跟 [w,h] 最接近的一个 */
function findClosestAspect(targetW: number, targetH: number, supported: string[]): string {
  const target = targetW / targetH;
  let best = supported[0];
  let bestDiff = Infinity;
  for (const s of supported) {
    const [sw, sh] = parseAspect(s);
    const diff = Math.abs(sw / sh - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

/**
 * 按比例 + 模型限制算出最优 size
 * （仅当 spec.needsSize=true 时调用）
 *
 * 算法：
 *   1. 起步：短边 = minShort，长边按比例算
 *   2. 像素不足 → 等比放大短边（直到达标 或 长边触顶）
 *   3. 长边触顶 → 等比缩短，但若像素不达标 → 强行抬高短边（牺牲比例严谨度，保证上游接受）
 *   4. 总像素超限 → 等比缩
 *   5. 对齐到 spec.align
 */
function calcSize(spec: ImageModelSpec, w: number, h: number): string {
  const ratio = Math.max(w, h) / Math.min(w, h);
  let short = spec.minShort;
  let long = short * ratio;

  // 像素不足 → 等比放大
  while (short * long < spec.minPixels) {
    short *= 1.05;
    long = short * ratio;
  }

  // 长边超限 → 等比缩
  if (long > spec.maxLong) {
    long = spec.maxLong;
    short = long / ratio;

    // 缩完像素不够 → 强行抬高短边到 minPixels / maxLong
    // 副作用：实际比例会不严格，但保证上游不报错
    if (short * long < spec.minPixels) {
      short = spec.minPixels / long;
    }
  }

  // 总像素超限 → 等比缩
  if (short * long > spec.maxPixels) {
    const k = Math.sqrt(spec.maxPixels / (short * long));
    short *= k;
    long *= k;
  }

  // 兜底：再次确保短边 ≥ minShort（极端情况下可能被上面强抬过）
  if (short < spec.minShort) short = spec.minShort;

  // 对齐到 spec.align 的倍数（用 ceil 而不是 round，避免对齐后跌破 minPixels）
  const alignUp = (n: number) => Math.max(spec.align, Math.ceil(n / spec.align) * spec.align);
  let sShort = alignUp(short);
  let sLong = alignUp(long);

  // 对齐后若总像素超过 maxPixels，则尝试向下对齐（仍保留 minPixels 兜底）
  if (sShort * sLong > spec.maxPixels) {
    const alignDown = (n: number) => Math.max(spec.align, Math.floor(n / spec.align) * spec.align);
    sShort = alignDown(short);
    sLong = alignDown(long);
    // 兜底：跌破 minPixels → 把短边再抬上去
    if (sShort * sLong < spec.minPixels) {
      sShort = alignUp(spec.minPixels / sLong);
    }
  }

  // 长边对齐后超过 maxLong → 强行截到 maxLong（向下对齐）
  if (sLong > spec.maxLong) {
    sLong = Math.floor(spec.maxLong / spec.align) * spec.align;
    if (sShort * sLong < spec.minPixels) {
      sShort = alignUp(spec.minPixels / sLong);
    }
  }

  const isLandscape = w >= h;
  return `${isLandscape ? sLong : sShort}x${isLandscape ? sShort : sLong}`;
}

/**
 * 把垫图 URL 列表按模型 spec 写到 rawParams 里。
 *   - 自动按 spec.maxReferenceImages 截断
 *   - 自动按 spec.referenceImageKey 选择字段名
 *   - 返回新的 rawParams（不修改入参）
 */
export function applyReferenceImages(
  modelSlug: string,
  rawParams: Record<string, unknown>,
  urls: string[],
): Record<string, unknown> {
  if (!urls || urls.length === 0) return rawParams;
  const spec = getModelSpec(modelSlug);
  if (spec.referenceImageKey === "none") return rawParams;

  const truncated = urls.slice(0, spec.maxReferenceImages);
  const next = { ...rawParams };
  switch (spec.referenceImageKey) {
    case "image_array":
      next.image = truncated;
      break;
    case "image_single":
      next.image = truncated[0];
      break;
    case "images_array":
      next.images = truncated;
      break;
    case "image_url":
      next.image_url = truncated[0];
      break;
    case "all":
    default:
      next.image = truncated[0];
      next.images = truncated;
      next.image_url = truncated[0];
      break;
  }
  return next;
}

/**
 * 根据 modelSlug 和用户给的 aspectRatio，返回最优 size + 额外 rawParams
 *
 * 输出：
 *   - size: OpenAI 风格 "WxH"（仅 needsSize=true 时）
 *   - aspectRatio: 调整后的比例（如果用户给了不被支持的比例，会回退到最接近的）
 *   - extraParams: 该模型必须的特殊参数（如 Nano Banana 的 imageSize=2K）
 */
export function resolveImageParams(
  modelSlug: string,
  userAspectRatio: string,
): {
  size?: string;
  aspectRatio: string;
  extraParams: Record<string, unknown>;
} {
  const spec = getModelSpec(modelSlug);
  let [w, h] = parseAspect(userAspectRatio);
  let finalAspect = userAspectRatio;

  // 如果模型有 supportedAspectRatios 限制，找最接近的
  if (spec.supportedAspectRatios.length > 0) {
    const closest = findClosestAspect(w, h, spec.supportedAspectRatios);
    if (closest !== userAspectRatio) {
      finalAspect = closest;
      [w, h] = parseAspect(closest);
    }
  }

  const result: ReturnType<typeof resolveImageParams> = {
    aspectRatio: finalAspect,
    extraParams: { ...(spec.defaultExtraParams ?? {}) },
  };

  if (spec.needsSize) {
    result.size = calcSize(spec, w, h);
  }
  return result;
}
