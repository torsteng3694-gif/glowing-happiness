/**
 * 新增 / 更新「vidu-audio-clone」音色复刻模型
 * provider = vidu，slug = vidu-audio-clone
 *
 * 复用 slug=vidu-cn 的 Upstream（如果还没有，请先跑 add-vidu-explain-comic.ts）
 *
 * 计费：Vidu 文档没明示复刻单价，这里先按"一次复刻 5 元"占位（同步接口 + 7 天保留），
 *       请管理员到 /admin/models 或 /admin/upstreams 按真实定价调整。
 *
 * 用法：npx tsx scripts/add-vidu-audio-clone.ts
 */

import { prisma } from "../src/lib/db";

async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: "vidu" },
    update: { name: "Vidu", logo: "🎬" },
    create: { slug: "vidu", name: "Vidu", logo: "🎬" },
  });

  const desc =
    "Vidu 音色复刻：上传 10s~5min 真人音频，同步返回自定义 voice_id（7 天内首次合成激活后永久保留）。可选传 text 拿试听音频。";

  const model = await prisma.model.upsert({
    where: { slug: "vidu-audio-clone" },
    update: {
      name: "Vidu 音色复刻",
      type: "audio",
      description: desc,
      tags: "音色复刻,同步,7天保留",
      unitPrice: 5.0,
      unit: "clone",
      enabled: true,
      providerId: provider.id,
    },
    create: {
      slug: "vidu-audio-clone",
      name: "Vidu 音色复刻",
      type: "audio",
      description: desc,
      tags: "音色复刻,同步,7天保留",
      unitPrice: 5.0,
      unit: "clone",
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
        costUnitPrice: 3.0,
        sellInputPrice: 0,
        sellOutputPrice: 0,
        sellUnitPrice: 5.0,
        priority: 100,
        enabled: true,
        enableFallback: true,
        notes: "Vidu audio-clone · 一次复刻定价（占位，待核对）",
      },
    });
    console.log("✅ 已创建『国内线路』渠道");
  } else {
    console.log("ℹ️  『国内线路』渠道已存在，跳过");
  }

  console.log("\n✅ Vidu 音色复刻模型就绪：");
  console.log({
    model: { slug: model.slug, name: model.name, unitPrice: model.unitPrice, unit: model.unit },
    upstream: { slug: upstream.slug, baseUrl: upstream.baseUrl, keyConfigured: !!upstream.apiKey },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
