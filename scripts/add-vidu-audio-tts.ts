/**
 * 新增 / 更新「vidu-audio-tts」语音合成模型
 * provider = vidu，slug = vidu-audio-tts
 *
 * 复用 slug=vidu-cn 的 Upstream（如果还没有，请先跑 add-vidu-explain-comic.ts）
 *
 * 计费：按 Vidu 真实返回的 credits 计费 ——
 *   1 积分 = 0.10 元（和 explain-comic 保持同一映射）
 *   所以 sellUnitPrice 这里语义是"元 / 积分"。
 *   成本占位为售价的 60%（0.06 元/积分），管理员请按真实成本核对。
 *
 * 用法：npx tsx scripts/add-vidu-audio-tts.ts
 */

import { prisma } from "../src/lib/db";

async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: "vidu" },
    update: { name: "Vidu", logo: "🎬" },
    create: { slug: "vidu", name: "Vidu", logo: "🎬" },
  });

  const desc =
    "Vidu 语音合成（TTS）：输入文本 + 音色 id，同步返回音频 URL。支持复刻音色，配合「我的音色」首次合成即可激活变永久。";

  const model = await prisma.model.upsert({
    where: { slug: "vidu-audio-tts" },
    update: {
      name: "Vidu 语音合成",
      type: "audio",
      description: desc,
      tags: "TTS,语音合成,同步",
      unitPrice: 0.1,
      unit: "credit",
      enabled: true,
      providerId: provider.id,
    },
    create: {
      slug: "vidu-audio-tts",
      name: "Vidu 语音合成",
      type: "audio",
      description: desc,
      tags: "TTS,语音合成,同步",
      unitPrice: 0.1,
      unit: "credit",
      enabled: true,
      providerId: provider.id,
    },
  });

  const upstream = await prisma.upstream.findUnique({ where: { slug: "vidu-cn" } });
  if (!upstream) {
    console.error("❌ 未找到 slug=vidu-cn 的 Upstream，请先执行 npx tsx scripts/add-vidu-explain-comic.ts");
    process.exit(1);
  }

  const existing = await prisma.channel.findFirst({
    where: { modelId: model.id, upstreamId: upstream.id, name: "国内线路" },
  });
  if (!existing) {
    await prisma.channel.create({
      data: {
        modelId: model.id,
        upstreamId: upstream.id,
        name: "国内线路",
        tier: "standard",
        upstreamModelSlug: null,
        costInputPrice: 0,
        costOutputPrice: 0,
        costUnitPrice: 0.06,
        sellInputPrice: 0,
        sellOutputPrice: 0,
        sellUnitPrice: 0.1,
        priority: 100,
        enabled: true,
        enableFallback: true,
        notes: "Vidu audio-tts · 单价 = 元/积分（按 Vidu 真实 credits 返回值计费）",
      },
    });
    console.log("✅ 已创建『国内线路』渠道");
  } else {
    console.log("ℹ️  『国内线路』渠道已存在，跳过");
  }

  console.log("\n✅ Vidu 语音合成模型就绪：");
  console.log({
    model: { slug: model.slug, name: model.name, unitPrice: model.unitPrice, unit: model.unit },
    upstream: { slug: upstream.slug, baseUrl: upstream.baseUrl, keyConfigured: !!upstream.apiKey },
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
