import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type SeedModel = {
  slug: string;
  name: string;
  type: "chat" | "image" | "video" | "audio";
  description: string;
  contextLength?: number;
  tags?: string;
  inputPrice?: number;
  outputPrice?: number;
  unitPrice?: number;
  unit?: string;
};

const PROVIDERS: { slug: string; name: string; logo: string; models: SeedModel[] }[] = [
  {
    slug: "openai",
    name: "OpenAI",
    logo: "🟢",
    models: [
      { slug: "gpt-4o", name: "GPT-4o", type: "chat", description: "OpenAI 旗舰多模态模型", contextLength: 128000, tags: "推荐,旗舰", inputPrice: 0.018, outputPrice: 0.072, unit: "1K tokens" },
      { slug: "gpt-4o-mini", name: "GPT-4o mini", type: "chat", description: "性价比之选，响应迅速", contextLength: 128000, tags: "性价比", inputPrice: 0.0011, outputPrice: 0.0043, unit: "1K tokens" },
      { slug: "o1-preview", name: "o1-preview", type: "chat", description: "深度推理模型", contextLength: 128000, tags: "推理", inputPrice: 0.108, outputPrice: 0.432, unit: "1K tokens" },
      { slug: "dall-e-3", name: "DALL·E 3", type: "image", description: "OpenAI 图像生成", tags: "高质量", unitPrice: 0.29, unit: "image" },
      { slug: "sora", name: "Sora", type: "video", description: "OpenAI 文生视频", tags: "旗舰", unitPrice: 2.8, unit: "second" },
      {
        // 开放 API 官转 sora-2，文生视频 / 图生视频，参考图走 input_reference
        // 上游是按次/按任务计费、价格较高，这里按"每秒单价 3.2"挂一个保守值
        slug: "sora-2",
        name: "Sora-2 官转版",
        type: "video",
        description:
          "OpenAI Sora-2 稳定版，官方接口直连，价格稍高但基本保证 100% 成功率且质量更高。支持 4/8/12 秒、720×1280 竖屏 / 1280×720 横屏，可选 1 张参考图。",
        tags: "旗舰,稳定,官转",
        unitPrice: 3.2,
        unit: "second",
      },
    ],
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    logo: "🟠",
    models: [
      { slug: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", type: "chat", description: "Anthropic 平衡旗舰", contextLength: 200000, tags: "推荐,旗舰", inputPrice: 0.022, outputPrice: 0.108, unit: "1K tokens" },
      { slug: "claude-3-5-haiku", name: "Claude 3.5 Haiku", type: "chat", description: "快速轻量", contextLength: 200000, tags: "快速", inputPrice: 0.0072, outputPrice: 0.036, unit: "1K tokens" },
      { slug: "claude-3-opus", name: "Claude 3 Opus", type: "chat", description: "顶级推理质量", contextLength: 200000, tags: "旗舰", inputPrice: 0.108, outputPrice: 0.54, unit: "1K tokens" },
    ],
  },
  {
    slug: "google",
    name: "Google",
    logo: "🔵",
    models: [
      { slug: "gemini-1.5-pro", name: "Gemini 1.5 Pro", type: "chat", description: "Google 多模态大模型", contextLength: 2000000, tags: "长上下文", inputPrice: 0.009, outputPrice: 0.036, unit: "1K tokens" },
      { slug: "gemini-1.5-flash", name: "Gemini 1.5 Flash", type: "chat", description: "低延迟高吞吐", contextLength: 1000000, tags: "快速,性价比", inputPrice: 0.0005, outputPrice: 0.002, unit: "1K tokens" },
      {
        slug: "gemini-3.1-flash-image-preview",
        name: "Nano Banana 2",
        type: "image",
        description:
          "谷歌高效图像模型（Nano Banana Pro 高速版），支持文生图/图生图、0.5K~4K、多种超宽比例（1:4/4:1/1:8/8:1）",
        tags: "文生图,图生图,4k,高清,香蕉,高速",
        unitPrice: 0.16,
        unit: "image",
      },
      { slug: "imagen-3", name: "Imagen 3", type: "image", description: "Google 图像生成", unitPrice: 0.22, unit: "image" },
      { slug: "veo-2", name: "Veo 2", type: "video", description: "Google 文生视频", tags: "旗舰", unitPrice: 3.5, unit: "second" },
    ],
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    logo: "🐋",
    models: [
      { slug: "deepseek-chat", name: "DeepSeek V3", type: "chat", description: "国产开源强模型", contextLength: 64000, tags: "性价比", inputPrice: 0.001, outputPrice: 0.002, unit: "1K tokens" },
      { slug: "deepseek-reasoner", name: "DeepSeek R1", type: "chat", description: "国产推理模型", contextLength: 64000, tags: "推理", inputPrice: 0.004, outputPrice: 0.016, unit: "1K tokens" },
    ],
  },
  {
    slug: "replicate",
    name: "Replicate",
    logo: "🎨",
    models: [
      { slug: "flux-1.1-pro", name: "FLUX 1.1 Pro", type: "image", description: "Black Forest Labs 旗舰", tags: "推荐", unitPrice: 0.28, unit: "image" },
      { slug: "sdxl", name: "Stable Diffusion XL", type: "image", description: "开源主力", tags: "开源", unitPrice: 0.05, unit: "image" },
      {
        slug: "mj_imagine",
        name: "Midjourney",
        type: "image",
        description: "Midjourney 图像生成（星爷ai），支持文生图与最多 4 张垫图参考",
        tags: "文生图,图生图,艺术,海报",
        unitPrice: 0.2,
        unit: "image",
      },
      { slug: "midjourney-v6", name: "Midjourney v6", type: "image", description: "艺术风格顶流", tags: "旗舰", unitPrice: 0.35, unit: "image" },
    ],
  },
  {
    slug: "xai",
    name: "xAI",
    logo: "🧠",
    models: [
      {
        slug: "grok-4.2-image",
        name: "grok-4.2-image",
        type: "image",
        description:
          "xAI 新一代图像生成模型，支持文生图/图生图，固定返回 2 张图片，支持 19 种尺寸。",
        tags: "文生图,图生图,grok",
        unitPrice: 0.24,
        unit: "image",
      },
    ],
  },
  {
    slug: "runway",
    name: "Runway",
    logo: "🎬",
    models: [
      { slug: "runway-gen3", name: "Runway Gen-3", type: "video", description: "电影级视频生成", tags: "推荐", unitPrice: 2.4, unit: "second" },
    ],
  },
  {
    slug: "luma",
    name: "Luma",
    logo: "✨",
    models: [
      { slug: "luma-dream-machine", name: "Luma Dream Machine", type: "video", description: "高质量文生视频", unitPrice: 1.8, unit: "second" },
    ],
  },
  {
    slug: "kling",
    name: "Kling",
    logo: "🎥",
    models: [
      { slug: "kling-v1", name: "可灵 v1", type: "video", description: "快手可灵视频", tags: "国产", unitPrice: 1.2, unit: "second" },
    ],
  },
  {
    // 星爷ai 上游 · 字节跳动即梦（Seedance 2.0）
    // 和 kling 分开挂一条 provider，方便后台按 provider 做渠道管理。
    slug: "bytedance",
    name: "字节跳动即梦",
    logo: "🎞️",
    models: [
      {
        slug: "kwvideo-v2-ref",
        name: "SD 2.0 参考生",
        type: "video",
        description:
          "即梦 Seedance 2.0 旗舰视频模型：支持 1~9 张参考图，智能融合风格/元素/构图生成新视频，自动有声，4~15s 灵活时长。",
        tags: "旗舰,参考生,720p,有声",
        // 平均估价：标准版约 1.5/秒，快速版约 0.8/秒 — 取中位挂 1.2
        unitPrice: 1.2,
        unit: "second",
      },
    ],
  },
  {
    // MiniMax 海螺语音（星爷ai 文档 model=speech-2.8）
    slug: "minimax",
    name: "MiniMax 海螺",
    logo: "🐚",
    models: [
      {
        slug: "speech-2.8",
        name: "海螺 语音克隆 2.8",
        type: "audio",
        description:
          "MiniMax 海螺语音克隆：先通过 /v1/skills/voices/clone 创建专属音色，再在合成请求里传 params.voice_id。支持 HD / Turbo、语速 / 语调 / 情绪 / 音效。克隆约 0.1 元/次，首次使用该音色合成另有激活费，之后按秒计费。",
        tags: "语音克隆,旗舰,多语言,情绪控制",
        unitPrice: 0.02,
        unit: "second",
      },
    ],
  },
  {
    // 语音合成 TTS / 音乐 / 音效：统一挂一个 provider 方便后台管理
    // 真实的上游模型名请在管理后台 ·「上游密钥池」里补对应的 upstreamModelSlug
    slug: "audio",
    name: "语音 / 音频",
    logo: "🎙️",
    models: [
      {
        slug: "tts-1",
        name: "OpenAI TTS",
        type: "audio",
        description:
          "OpenAI TTS 语音合成：支持 alloy / nova / onyx / shimmer 等多种音色，擅长通用口语旁白，按音频秒数计费。",
        tags: "TTS,语音合成,多音色",
        unitPrice: 0.008,
        unit: "second",
      },
      {
        slug: "tts-1-hd",
        name: "OpenAI TTS HD",
        type: "audio",
        description: "OpenAI TTS 高清版，音质更细腻，适合有声书/专业旁白。",
        tags: "TTS,HD,高清",
        unitPrice: 0.016,
        unit: "second",
      },
      {
        slug: "minimax-speech-02",
        name: "MiniMax Speech-02",
        type: "audio",
        description:
          "MiniMax 中文语音合成，支持丰富中文音色、情绪与语速控制，国内团队产品，对中文表达更自然。",
        tags: "TTS,中文,情绪控制",
        unitPrice: 0.012,
        unit: "second",
      },
      {
        slug: "suno-v4",
        name: "Suno v4 音乐生成",
        type: "audio",
        description:
          "Suno v4 文生音乐：根据文本描述生成带旋律和人声的完整歌曲，30~120 秒可选，多风格可控。",
        tags: "音乐,Suno,旗舰",
        unitPrice: 0.05,
        unit: "second",
      },
    ],
  },
];

async function main() {
  console.log("🌱 正在写入种子数据...");

  // 默认上游账号（兼容老配置/现有渠道）
  const defaultUpstream = await prisma.upstream.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      slug: "default",
      name: "默认上游",
      baseUrl: process.env.UPSTREAM_BASE_URL || "https://api.ai6700.com",
      apiKey: process.env.UPSTREAM_API_KEY || "",
      enabled: true,
      priority: 100,
    },
  });

  // 预置中转站上游（独立分类使用）：jmpb-szb
  // 仅写入基础地址，不覆盖管理员已配置的 apiKey。
  await prisma.upstream.upsert({
    where: { slug: "jmpb-szb" },
    update: {
      name: "中转站 · jmpb-szb",
      baseUrl: "https://jmpb-szb.com",
      enabled: true,
      priority: 120,
    },
    create: {
      slug: "jmpb-szb",
      name: "中转站 · jmpb-szb",
      baseUrl: "https://jmpb-szb.com",
      apiKey: "",
      enabled: true,
      priority: 120,
    },
  });

  const round4 = (n: number) => Math.round(n * 10000) / 10000;

  for (const p of PROVIDERS) {
    const provider = await prisma.provider.upsert({
      where: { slug: p.slug },
      update: { name: p.name, logo: p.logo },
      create: { slug: p.slug, name: p.name, logo: p.logo },
    });
    for (const m of p.models) {
      // 先查模型是否已经存在：只有"本次新建"的模型才会补一条默认渠道，
      // 避免管理员重命名 / 删除过的老模型渠道被 seed 反复重建。
      const priorModel = await prisma.model.findUnique({
        where: { slug: m.slug },
        select: { id: true },
      });
      const isNewModel = !priorModel;

      const model = await prisma.model.upsert({
        where: { slug: m.slug },
        update: {
          name: m.name, type: m.type, description: m.description,
          contextLength: m.contextLength, tags: m.tags,
          inputPrice: m.inputPrice ?? 0, outputPrice: m.outputPrice ?? 0,
          unitPrice: m.unitPrice ?? 0, unit: m.unit,
          providerId: provider.id,
        },
        create: {
          slug: m.slug, name: m.name, type: m.type, description: m.description,
          contextLength: m.contextLength, tags: m.tags,
          inputPrice: m.inputPrice ?? 0, outputPrice: m.outputPrice ?? 0,
          unitPrice: m.unitPrice ?? 0, unit: m.unit,
          providerId: provider.id,
        },
      });

      // 注意：只对"首次新建"的模型自动挂一条默认渠道。
      // 老模型就算没有名为"默认"的渠道也绝不再补，避免 seed 覆盖管理员手工改过 / 删过的数据。
      if (isNewModel) {
        await prisma.channel.create({
          data: {
            modelId: model.id,
            upstreamId: defaultUpstream.id,
            name: "默认",
            tier: "standard",
            upstreamModelSlug: null,
            costInputPrice: round4((m.inputPrice ?? 0) * 0.5),
            costOutputPrice: round4((m.outputPrice ?? 0) * 0.5),
            costUnitPrice: round4((m.unitPrice ?? 0) * 0.5),
            sellInputPrice: m.inputPrice ?? 0,
            sellOutputPrice: m.outputPrice ?? 0,
            sellUnitPrice: m.unitPrice ?? 0,
            priority: 100,
            enabled: true,
            enableFallback: true,
            notes: "种子数据 · 成本待核对",
          },
        });
      }

      // Nano Banana 系列：预置 imageSize 分级价格（后台可直接看到/编辑）
      if (m.slug === "gemini-3.1-flash-image-preview" || m.slug === "gemini-3-pro-image-preview") {
        const defaultChannel = await prisma.channel.findFirst({
          where: { modelId: model.id, name: "默认" },
          orderBy: { priority: "asc" },
        });
        if (defaultChannel) {
          // 以 2K 为基础价，其他规格做阶梯
          const sizePrices: Array<{ size: string; sell: number }> = [
            { size: "0.5K", sell: round4((m.unitPrice ?? 0) * 0.5) },
            { size: "1K", sell: round4((m.unitPrice ?? 0) * 0.75) },
            { size: "2K", sell: round4(m.unitPrice ?? 0) },
            { size: "4K", sell: round4((m.unitPrice ?? 0) * 1.8) },
          ];
          for (const sp of sizePrices) {
            await prisma.channelOptionPrice.upsert({
              where: {
                channelId_paramKey_optionValue: {
                  channelId: defaultChannel.id,
                  paramKey: "imageSize",
                  optionValue: sp.size,
                },
              },
              update: {
                sellUnitPrice: sp.sell,
                costUnitPrice: round4(sp.sell * 0.5),
                enabled: true,
                note: "种子预置 · Nano Banana 分级价",
              },
              create: {
                channelId: defaultChannel.id,
                paramKey: "imageSize",
                optionValue: sp.size,
                sellUnitPrice: sp.sell,
                costUnitPrice: round4(sp.sell * 0.5),
                enabled: true,
                note: "种子预置 · Nano Banana 分级价",
              },
            });
          }
        }
      }
    }
  }

  // 默认管理员账号：admin@ai-hub.local / admin123
  const adminEmail = process.env.ADMIN_EMAIL || "admin@ai-hub.local";
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash("admin123", 10),
        name: "平台管理员",
        role: "admin",
        balance: 10000,
        referralCode: "ADMIN0000",
      },
    });
    console.log(`✅ 已创建管理员账号: ${adminEmail} / admin123`);
  }

  // 默认配置
  await prisma.setting.upsert({
    where: { key: "referral_rate" },
    update: { value: "0.1" },
    create: { key: "referral_rate", value: "0.1" },
  });
  await prisma.setting.upsert({
    where: { key: "signup_bonus" },
    update: { value: "5" },
    create: { key: "signup_bonus", value: "5" },
  });

  // 最低利润率（用于渠道保存校验）
  for (const key of ["min_profit_rate_chat", "min_profit_rate_image", "min_profit_rate_video", "min_profit_rate_audio"]) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: "0.2" },
    });
  }

  console.log("✅ 种子数据写入完成");
}

main().finally(() => prisma.$disconnect());
