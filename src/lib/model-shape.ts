import type { Model, Provider } from "@prisma/client";

/** 文档中 chat 类型白名单：只返回这些前缀的语言模型 */
const CHAT_PREFIXES = ["gpt", "o1", "o3", "chatgpt", "claude", "gemini"];

export function isChatWhitelisted(slug: string): boolean {
  const s = slug.toLowerCase();
  return CHAT_PREFIXES.some((p) => s === p || s.startsWith(p + "-") || s.startsWith(p));
}

/** 根据 slug 判定调用格式与对应的请求路径 */
export function getChatApiFormat(slug: string): {
  api_format: "openai" | "anthropic" | "gemini";
  api_endpoint: string;
} {
  const s = slug.toLowerCase();
  if (s.startsWith("claude")) {
    return { api_format: "anthropic", api_endpoint: "/v1/messages" };
  }
  if (s.startsWith("gemini")) {
    return {
      api_format: "gemini",
      api_endpoint: `/v1beta/models/${slug}:generateContent`,
    };
  }
  return { api_format: "openai", api_endpoint: "/v1/chat/completions" };
}

/** 将 DB 的 tags（"推荐,旗舰"）扩展成功能标签数组 */
export function buildTags(m: Model & { provider?: Provider | null }): string[] {
  const base = (m.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // 根据类型补充"能力"标签
  const abilityByType: Record<string, string[]> = {
    chat: ["对话"],
    image: ["文生图"],
    video: ["文生视频"],
    audio: ["音频生成"],
    tts: ["语音合成"],
    music: ["音乐生成"],
  };
  const extra = abilityByType[m.type] || [];

  // 多模态识别（粗粒度）
  const multimodalHint =
    m.type === "chat" &&
    /gpt-4o|gemini|claude-3|vision|multimodal/i.test(m.slug + " " + m.name)
      ? ["多模态"]
      : [];

  return Array.from(new Set([...extra, ...base, ...multimodalHint]));
}

export function inputHint(type: string): string {
  switch (type) {
    case "chat":
      return "";
    case "image":
      return "描述你想要生成的图片";
    case "video":
      return "描述视频内容";
    case "audio":
      return "描述音频内容或文本";
    case "tts":
      return "输入要合成语音的文本";
    case "music":
      return "描述音乐风格与情绪";
    default:
      return "";
  }
}

/** 归一化请求中的 type 参数到 DB.type 以及是否需要进一步子类型筛选 */
export function resolveType(param: string | null): {
  dbType: string | null;     // 映射到 Model.type 的 where 条件
  label: string | null;       // 返回给调用方的 type（保持原值）
  subtype?: "tts" | "music";  // 进一步过滤 tags
} | null {
  if (!param) return { dbType: null, label: null };
  const p = param.toLowerCase();
  if (["chat", "image", "video", "audio"].includes(p)) {
    return { dbType: p, label: p };
  }
  if (p === "tts") return { dbType: "audio", label: "tts", subtype: "tts" };
  if (p === "music") return { dbType: "audio", label: "music", subtype: "music" };
  return null;
}

/** 列表项 */
export function shapeListItem(m: Model & { provider?: Provider | null }) {
  const tags = buildTags(m);
  const base: any = {
    name: m.slug,
    display_name: m.name,
    type: m.type,
    tags,
    description: m.description || "",
    input_hint: inputHint(m.type),
  };
  if (m.type === "chat") {
    const { api_format, api_endpoint } = getChatApiFormat(m.slug);
    base.api_format = api_format;
    base.api_endpoint = api_endpoint;
  }
  return base;
}

/* ---------------- 参数定义 ---------------- */

export type ParamOption = { label: string; value: string; is_default: boolean };
export type ParamDef = {
  name: string;
  label: string;
  type: "select" | "textarea" | "number" | "upload" | "switch";
  required: boolean;
  default: string | number | boolean;
  description: string;
  options?: ParamOption[];
};

function mkSelect(
  name: string,
  label: string,
  values: { value: string; label: string }[],
  defaultValue: string,
  description: string,
  required = true,
): ParamDef {
  return {
    name,
    label,
    type: "select",
    required,
    default: defaultValue,
    description,
    options: values.map((v) => ({ ...v, is_default: v.value === defaultValue })),
  };
}

const PROMPT_TEXTAREA: ParamDef = {
  name: "prompt",
  label: "提示词",
  type: "textarea",
  required: true,
  default: "",
  description: "描述你想生成的内容",
};

/** 部分模型支持的能力（img2video / img2img） */
const IMG2VIDEO_SLUGS = new Set([
  "runway-gen3", "luma-dream-machine", "kling-v1",
]);
const IMG2IMG_SLUGS = new Set([
  "flux-1.1-pro", "sdxl",
]);

/** 按模型类型 + slug 生成参数定义数组 */
export function buildParams(m: Model, override?: ParamDef[] | null): ParamDef[] {
  // 管理员在后台自定义了参数，优先使用（允许传空数组表示"无参数"）
  if (override && Array.isArray(override)) return override;
  if (m.type === "chat") return []; // chat 模型不返回 params

  /* ---------- 模型专属 param 定义（优先于类型模板） ---------- */

  // Nano Banana 系列（谷歌 gemini-3-pro-image-preview / gemini-3.1-flash-image-preview）异步图片模型
  if (m.slug === "gemini-3-pro-image-preview" || m.slug === "gemini-3.1-flash-image-preview") {
    return [
      { ...PROMPT_TEXTAREA, description: "描述你想要生成的图片内容" },
      mkSelect(
        "aspectRatio", "图片比例",
        [
          { value: "1:1",  label: "方形 1:1" },
          { value: "2:3",  label: "竖版 2:3" },
          { value: "3:2",  label: "横版 3:2" },
          { value: "3:4",  label: "竖版 3:4" },
          { value: "4:3",  label: "横版 4:3" },
          { value: "4:5",  label: "竖版 4:5" },
          { value: "5:4",  label: "横版 5:4" },
          { value: "9:16", label: "竖屏 9:16" },
          { value: "16:9", label: "横屏 16:9" },
          { value: "21:9", label: "超宽 21:9" },
          { value: "1:4",  label: "极竖 1:4" },
          { value: "4:1",  label: "极横 4:1" },
          { value: "1:8",  label: "超竖 1:8" },
          { value: "8:1",  label: "超横 8:1" },
        ],
        "1:1",
        "图片的宽高比例",
      ),
      mkSelect(
        "imageSize", "分辨率",
        [
          { value: "0.5K", label: "0.5K（极速预览）" },
          { value: "1K", label: "1K（普通）" },
          { value: "2K", label: "2K（高清）" },
          { value: "4K", label: "4K（超清）" },
        ],
        "2K",
        "图片清晰度（1K/2K/4K）",
      ),
      mkSelect(
        "thinkingLevel", "思考等级",
        [
          { value: "minimal", label: "minimal（更快）" },
          { value: "high", label: "high（更稳）" },
        ],
        "minimal",
        "控制模型思考深度",
        false,
      ),
      {
        name: "images",
        label: "参考图片",
        type: "upload",
        required: false,
        default: "",
        description:
          "图生图的参考图 URL，支持 1-14 张。可传字符串（单张）或数组（多张）。平台不提供文件托管，请自行上传至对象存储后传入可公开访问的 URL",
      },
      {
        name: "count",
        label: "生成数量",
        type: "number",
        required: false,
        default: 1,
        description: "一次生成的图片数量（1-4）",
      },
    ];
  }

  // Midjourney（星爷ai mj_imagine）
  if (m.slug === "mj_imagine") {
    return [
      { ...PROMPT_TEXTAREA, description: "描述你想要生成的图片内容，支持电影感/插画/海报等风格" },
      mkSelect(
        "botType", "模型风格",
        [
          { value: "MID_JOURNEY", label: "MID_JOURNEY（标准 MJ）" },
          { value: "NIJI_JOURNEY", label: "NIJI_JOURNEY（二次元 Niji）" },
        ],
        "MID_JOURNEY",
        "选择 MJ 或 Niji 模式",
      ),
      mkSelect(
        "aspectRatio", "图片比例",
        [
          { value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" },
          { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }, { value: "3:2", label: "3:2" },
          { value: "2:3", label: "2:3" }, { value: "4:5", label: "4:5" }, { value: "5:4", label: "5:4" },
          { value: "21:9", label: "21:9" },
        ],
        "1:1",
        "图片的宽高比例",
      ),
      mkSelect(
        "quality", "质量",
        [
          { value: "0.25", label: "0.25（更快）" },
          { value: "0.5", label: "0.5" },
          { value: "1", label: "1（默认）" },
          { value: "2", label: "2（更精细）" },
        ],
        "1",
        "图片精细度（越高越慢）",
        false,
      ),
      mkSelect(
        "stylize", "风格化",
        [
          { value: "0", label: "0（写实）" }, { value: "50", label: "50" }, { value: "100", label: "100" },
          { value: "250", label: "250" }, { value: "500", label: "500" }, { value: "750", label: "750" }, { value: "1000", label: "1000（极艺术）" },
        ],
        "100",
        "艺术风格强度",
        false,
      ),
      mkSelect(
        "chaos", "混乱度",
        [
          { value: "0", label: "0（稳定）" }, { value: "25", label: "25" }, { value: "50", label: "50" },
          { value: "75", label: "75" }, { value: "100", label: "100（变化大）" },
        ],
        "0",
        "变化多样性",
        false,
      ),
      mkSelect(
        "style", "风格",
        [{ value: "", label: "默认" }, { value: "raw", label: "raw" }],
        "",
        "图片风格模式",
        false,
      ),
      {
        name: "images",
        label: "参考图片",
        type: "upload",
        required: false,
        default: "",
        description: "图生图垫图（1-4 张）",
      },
    ];
  }

  // grok-4.2-image（星爷ai）
  if (m.slug === "grok-4.2-image") {
    return [
      { ...PROMPT_TEXTAREA, description: "描述你想要生成的图片内容，支持上传 1 张参考图做图生图" },
      mkSelect(
        "size", "图片比例",
        [
          { value: "1024x1024", label: "1024x1024" }, { value: "1080x1080", label: "1080x1080" },
          { value: "1200x1200", label: "1200x1200" }, { value: "2048x2048", label: "2048x2048" },
          { value: "2160x2160", label: "2160x2160" }, { value: "1280x720", label: "1280x720" },
          { value: "1366x768", label: "1366x768" }, { value: "1600x900", label: "1600x900" },
          { value: "1920x1080", label: "1920x1080" }, { value: "2048x1152", label: "2048x1152" },
          { value: "2560x1440", label: "2560x1440" }, { value: "1024x768", label: "1024x768" },
          { value: "1280x960", label: "1280x960" }, { value: "2048x1536", label: "2048x1536" },
          { value: "720x1280", label: "720x1280" }, { value: "768x1366", label: "768x1366" },
          { value: "900x1600", label: "900x1600" }, { value: "1080x1920", label: "1080x1920" },
          { value: "1440x2560", label: "1440x2560" },
        ],
        "1024x1024",
        "图片尺寸",
      ),
      {
        name: "images",
        label: "参考图片",
        type: "upload",
        required: false,
        default: "",
        description: "图生图参考图（最多 1 张）",
      },
      {
        name: "count",
        label: "生成数量",
        type: "number",
        required: false,
        default: 2,
        description: "该模型固定返回 2 张图片",
      },
    ];
  }

  // Sora-2 官转版（星爷ai）
  if (m.slug === "sora-2") {
    return [
      { ...PROMPT_TEXTAREA, description: "描述你想要生成的视频内容" },
      mkSelect(
        "seconds",
        "视频时长",
        [
          { value: "4", label: "4 秒" },
          { value: "8", label: "8 秒" },
          { value: "12", label: "12 秒" },
        ],
        "4",
        "选择视频时长",
      ),
      mkSelect(
        "size",
        "画面比例",
        [
          { value: "1280x720", label: "横屏 1280x720" },
          { value: "720x1280", label: "竖屏 720x1280" },
        ],
        "1280x720",
        "选择画面比例",
      ),
      {
        name: "input_reference",
        label: "参考图片",
        type: "upload",
        required: false,
        default: "",
        description: "可选上传 1 张参考图用于图生视频（建议与画面比例一致）",
      },
    ];
  }

  /* ---------- 通用类型模板 ---------- */

  if (m.type === "image") {
    const sizeDefault = "1024x1024";
    const params: ParamDef[] = [
      { ...PROMPT_TEXTAREA, description: "描述你想要生成的图片" },
      mkSelect(
        "size", "图片尺寸",
        [
          { value: "1024x1024", label: "正方形 1024x1024" },
          { value: "1024x1792", label: "竖版 1024x1792" },
          { value: "1792x1024", label: "横版 1792x1024" },
          { value: "512x512",   label: "小图 512x512" },
        ],
        sizeDefault,
        "输出图片的分辨率",
      ),
      mkSelect(
        "n", "生成数量",
        [
          { value: "1", label: "1 张" },
          { value: "2", label: "2 张" },
          { value: "3", label: "3 张" },
          { value: "4", label: "4 张" },
        ],
        "1",
        "一次生成的图片数量（1-4）",
        false,
      ),
    ];
    if (IMG2IMG_SLUGS.has(m.slug)) {
      params.push({
        name: "image",
        label: "参考图",
        type: "upload",
        required: false,
        default: "",
        description:
          "图生图的参考图 URL，支持 1 张图片。可传字符串或单元素数组。平台不提供文件托管，请自行上传至对象存储后传入可公开访问的 URL",
      });
      params.push({
        name: "strength",
        label: "参考强度",
        type: "number",
        required: false,
        default: 0.6,
        description: "参考图影响权重，范围 0-1，越大越贴近参考图",
      });
    }
    params.push({
      name: "seed",
      label: "随机种子",
      type: "number",
      required: false,
      default: 0,
      description: "固定种子可复现同一结果；填 0 表示随机",
    });
    return params;
  }

  if (m.type === "video") {
    // 部分模型支持更长时长
    const isSora = m.slug === "sora";
    const durations = isSora
      ? [
          { value: "5",  label: "5秒" },
          { value: "10", label: "10秒" },
          { value: "15", label: "15秒" },
          { value: "20", label: "20秒" },
        ]
      : [
          { value: "3",  label: "3秒" },
          { value: "5",  label: "5秒" },
          { value: "8",  label: "8秒" },
          { value: "10", label: "10秒" },
        ];

    const params: ParamDef[] = [
      { ...PROMPT_TEXTAREA, description: "描述视频内容" },
      mkSelect("duration", "视频时长", durations, "5", "生成时长"),
      mkSelect(
        "aspect_ratio", "画幅比例",
        [
          { value: "16:9", label: "横屏 16:9" },
          { value: "9:16", label: "竖屏 9:16" },
          { value: "1:1",  label: "方形 1:1" },
        ],
        "16:9",
        "输出视频的画幅比例",
      ),
      mkSelect(
        "quality", "画质",
        [
          { value: "standard", label: "标准" },
          { value: "hd",       label: "高清" },
          { value: "4k",       label: "4K 超清" },
        ],
        "standard",
        "输出画质等级，等级越高耗时与消费越高",
        false,
      ),
    ];
    if (IMG2VIDEO_SLUGS.has(m.slug)) {
      params.push({
        name: "image",
        label: "首帧图",
        type: "upload",
        required: false,
        default: "",
        description:
          "图生视频的首帧图片 URL，支持 1 张图片。可传字符串或单元素数组。平台不提供文件托管，请自行上传至对象存储后传入可公开访问的 URL",
      });
    }
    return params;
  }

  if (m.type === "audio") {
    const isTts = /tts|voice|speech/i.test(m.slug + " " + m.name);
    const isMusic = /music|suno|melody/i.test(m.slug + " " + m.name);

    if (isTts) {
      return [
        { name: "text", label: "待合成文本", type: "textarea", required: true, default: "", description: "要合成为语音的文本内容" },
        mkSelect("voice", "音色",
          [
            { value: "alloy",   label: "Alloy（中性）" },
            { value: "nova",    label: "Nova（女声）" },
            { value: "onyx",    label: "Onyx（男声）" },
            { value: "shimmer", label: "Shimmer（柔和女声）" },
          ],
          "alloy",
          "语音合成使用的音色",
        ),
        mkSelect("speed", "语速",
          [
            { value: "0.75", label: "慢速 0.75x" },
            { value: "1.0",  label: "正常 1.0x" },
            { value: "1.25", label: "较快 1.25x" },
            { value: "1.5",  label: "快速 1.5x" },
          ],
          "1.0",
          "语速倍率",
          false,
        ),
      ];
    }

    if (isMusic) {
      return [
        { ...PROMPT_TEXTAREA, description: "描述音乐风格与情绪" },
        mkSelect("duration", "音乐时长",
          [
            { value: "30",  label: "30秒" },
            { value: "60",  label: "60秒" },
            { value: "120", label: "120秒" },
          ],
          "60",
          "生成的音乐时长",
        ),
        mkSelect("style", "风格",
          [
            { value: "pop",       label: "流行" },
            { value: "electronic", label: "电子" },
            { value: "rock",      label: "摇滚" },
            { value: "classical", label: "古典" },
            { value: "jazz",      label: "爵士" },
          ],
          "pop",
          "音乐风格",
          false,
        ),
      ];
    }

    return [
      { ...PROMPT_TEXTAREA, description: "描述音频内容" },
      mkSelect("duration", "时长",
        [
          { value: "10", label: "10秒" },
          { value: "20", label: "20秒" },
          { value: "30", label: "30秒" },
        ],
        "10",
        "生成音频时长",
      ),
    ];
  }

  return [];
}

/** 单模型详情（/v1/skills/models/{name}）
 *  严格对齐文档：name / display_name / type / tags / description / input_hint / params
 *  chat 类型额外携带 api_format / api_endpoint；媒体类型返回 params 数组
 */
export function shapeDetail(
  m: Model & { provider?: Provider | null },
  override?: ParamDef[] | null,
) {
  const tags = buildTags(m);
  const out: any = {
    name: m.slug,
    display_name: m.name,
    type: m.type,
    tags,
    description: m.description || "",
    input_hint: inputHint(m.type),
    params: buildParams(m, override),
  };
  if (m.type === "chat") {
    const { api_format, api_endpoint } = getChatApiFormat(m.slug);
    out.api_format = api_format;
    out.api_endpoint = api_endpoint;
    if (m.contextLength) out.context_length = m.contextLength;
  }
  return out;
}

/* ---------------- 完整定价（channel_groups） ---------------- */

type OptionPrice = {
  param_name: string;
  option_value: string;
  option_label: string;
  price_multiplier: number;
  price_addition: number;
  final_price: number;
  price_impact: string;     // "基础价格" | "x2" | "+¥0.5"
};

type ChannelGroup = {
  group_name: string;
  is_active: boolean;
  billing_method: string;             // "按次" | "按 1K tokens"
  base_price: number;
  input_token_price: number;
  output_token_price: number;
  option_prices: OptionPrice[];
  avg_response_seconds: number;
  success_rate_24h: number;
};

/** slug 的稳定 hash → 用于生成稳定的 avg_response_seconds / success_rate */
function hashStable(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function impactLabel(multiplier: number, addition: number): string {
  if (multiplier === 1 && addition === 0) return "基础价格";
  if (addition !== 0 && multiplier === 1) return `${addition > 0 ? "+" : "-"}¥${Math.abs(round2(addition))}`;
  return `x${round2(multiplier)}`;
}

/** 根据一组 select 参数为媒体模型生成 option_prices（基础价 × 各选项乘数） */
function buildOptionPrices(
  basePrice: number,
  params: ParamDef[],
  mulAdjust: number,
): OptionPrice[] {
  const out: OptionPrice[] = [];
  for (const p of params) {
    if (p.type !== "select" || !p.options?.length) continue;

    // 只对会影响价格的参数生成乘数表
    const pricingRules: Record<string, (value: string) => { mul: number; add: number } | null> = {
      duration: (v) => {
        const n = Number(v);
        const base = Number(p.default);
        if (!Number.isFinite(n) || !Number.isFinite(base) || base === 0) return null;
        return { mul: round2(n / base), add: 0 };
      },
      n: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        return { mul: n, add: 0 };
      },
      size: (v) => {
        // 默认 1024x1024 = 1x；非正方形 1024x1792 / 1792x1024 = 1.5x；512x512 = 0.5x
        const sq: Record<string, number> = {
          "512x512": 0.5,
          "1024x1024": 1,
          "1024x1792": 1.5,
          "1792x1024": 1.5,
        };
        return sq[v] !== undefined ? { mul: sq[v], add: 0 } : null;
      },
      quality: (v) => {
        if (v === "hd") return { mul: 1.5, add: 0 };
        if (v === "4k") return { mul: 2.5, add: 0 };
        if (v === "standard") return { mul: 1, add: 0 };
        return null;
      },
    };

    const rule = pricingRules[p.name];
    if (!rule) continue;

    for (const opt of p.options) {
      const r = rule(opt.value);
      if (!r) continue;
      const mul = round2(r.mul * mulAdjust);
      const add = round2(r.add);
      const final = round2(basePrice * mul + add);
      out.push({
        param_name: p.name,
        option_value: opt.value,
        option_label: opt.label,
        price_multiplier: mul,
        price_addition: add,
        final_price: final,
        price_impact: impactLabel(mul, add),
      });
    }
  }
  return out;
}

/** 为单个模型生成 "渠道分组" 列表（标准 / 高速 / 性价比） */
function buildChannelGroups(m: Model, params: ParamDef[]): ChannelGroup[] {
  const h = hashStable(m.slug);
  const baseUnitPrice = m.unitPrice || 0;

  // 视频模型的 base_price 建议按默认时长计价（如 5s）
  let mediaBasePrice = baseUnitPrice;
  if (m.type === "video") {
    const dp = params.find((p) => p.name === "duration");
    const defD = dp ? Number(dp.default) || 5 : 5;
    mediaBasePrice = round2(baseUnitPrice * defD);
  } else if (m.type === "image") {
    mediaBasePrice = round2(baseUnitPrice);
  }

  const billingMethod = m.type === "chat" ? "按 1K tokens" : "按次";

  const mkGroup = (
    groupName: string,
    factor: number,
    active: boolean,
    speedFactor: number,    // 影响 avg_response_seconds（倍率）
    successSkew: number,    // 影响 success_rate_24h（加分）
  ): ChannelGroup => {
    const basePrice = round2(mediaBasePrice * factor);
    const inputTokenPrice = round2((m.inputPrice || 0) * factor);
    const outputTokenPrice = round2((m.outputPrice || 0) * factor);

    // 失败/空闲分组：数据清零
    if (!active) {
      return {
        group_name: groupName,
        is_active: false,
        billing_method: billingMethod,
        base_price: basePrice,
        input_token_price: inputTokenPrice,
        output_token_price: outputTokenPrice,
        option_prices: [],
        avg_response_seconds: 0,
        success_rate_24h: 0,
      };
    }

    // 稳定随机：由 slug + 分组名 哈希产生
    const hh = hashStable(m.slug + "|" + groupName);
    const baseResp = m.type === "video" ? 40 : m.type === "image" ? 10 : m.type === "audio" ? 5 : 2;
    const jitterResp = (hh % 100) / 100;                    // 0..1
    const avgResp = round2((baseResp + jitterResp * baseResp) * speedFactor);
    const jitterSucc = (hh % 40) / 10;                      // 0..4
    const rawSucc = 92 + jitterSucc + successSkew;
    const successRate = round2(Math.min(99.9, Math.max(50, rawSucc)));

    return {
      group_name: groupName,
      is_active: true,
      billing_method: billingMethod,
      base_price: basePrice,
      input_token_price: inputTokenPrice,
      output_token_price: outputTokenPrice,
      option_prices: m.type === "chat" ? [] : buildOptionPrices(basePrice, params, 1),
      avg_response_seconds: avgResp,
      success_rate_24h: successRate,
    };
  };

  // 固定提供 3 个分组：标准（默认启用）、高速（偶数 hash 启用，用于演示 is_active=false）、性价比（启用）
  const fastActive = h % 3 !== 0;   // 约 2/3 启用
  const budgetActive = h % 5 !== 0;  // 4/5 启用

  return [
    mkGroup("标准渠道",   1.0, true,         1.0, 0.5),
    mkGroup("高速渠道",   1.3, fastActive,   0.6, 2.5),
    mkGroup("性价比渠道", 0.85, budgetActive, 1.4, -1.5),
  ];
}

/** 定价（/v1/skills/models/{name}/pricing） - 完整渠道分组结构 */
export function shapePricing(m: Model, statusFilter?: string | null, override?: ParamDef[] | null) {
  const params = buildParams(m, override);
  let groups = buildChannelGroups(m, params);

  const filterNorm = (statusFilter || "").toLowerCase();
  if (filterNorm === "active") {
    groups = groups.filter((g) => g.is_active);
  }

  return {
    name: m.slug,
    display_name: m.name,
    type: m.type,
    filter: filterNorm === "active" ? "active" : "",
    channel_groups: groups,
    pricing_note:
      "默认返回所有渠道分组（含已关闭的），加 ?status=active 仅返回当前启用的分组。实际调用时不需要指定渠道分组，系统根据 API Key 的渠道策略自动选择。若某参数选项未出现在 option_prices 中，表示该选项使用分组的基础价格（base_price），无额外加价。",
  };
}

export function filterModelsForList(
  models: (Model & { provider?: Provider | null })[],
  resolved: { dbType: string | null; subtype?: "tts" | "music" },
) {
  let list = models;
  if (resolved.dbType) {
    list = list.filter((m) => m.type === resolved.dbType);
  }
  if (resolved.subtype) {
    const kw = resolved.subtype;
    list = list.filter((m) =>
      ((m.tags || "") + " " + m.slug + " " + m.name).toLowerCase().includes(kw),
    );
  }
  // chat 类型应用白名单
  if (resolved.dbType === "chat") {
    list = list.filter((m) => isChatWhitelisted(m.slug));
  }
  return list;
}
