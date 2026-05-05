import { prisma } from "../src/lib/db";

/**
 * 新增 / 更新「grok-video-3」视频模型
 * provider = heizhu（黑猪ai），slug = grok-video-3
 * 对应上游 ai6700.com /v1/media/generate 异步任务。
 *
 * 同时为其创建一条绑定到 slug=default 上游的默认渠道（若尚未存在）。
 */
async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: "heizhu" },
    update: { name: "黑猪ai", logo: "🐗" },
    create: { slug: "heizhu", name: "黑猪ai", logo: "🐗" },
  });

  const desc =
    "Grok 推出的首帧参考图视频模型，专注于图生视频（支持 720P / 1080P、6s / 10s），响应极快，适合短视频创作者快速验证灵感（由黑猪ai 聚合提供）。";

  const model = await prisma.model.upsert({
    where: { slug: "grok-video-3" },
    update: {
      name: "grok-video-3",
      type: "video",
      description: desc,
      tags: "首帧参考,1080p,图生视频",
      unitPrice: 0.8,
      unit: "video",
      enabled: true,
      providerId: provider.id,
    },
    create: {
      slug: "grok-video-3",
      name: "grok-video-3",
      type: "video",
      description: desc,
      tags: "首帧参考,1080p,图生视频",
      unitPrice: 0.8,
      unit: "video",
      enabled: true,
      providerId: provider.id,
    },
  });

  // 找到 default upstream；没有就直接报错提示（新库应该已经 seed 过）
  const defaultUpstream = await prisma.upstream.findUnique({ where: { slug: "default" } });
  if (!defaultUpstream) {
    console.error("❌ 未找到 slug=default 的 Upstream，请先执行 npm run db:seed 或到 /admin/upstreams 创建");
    process.exit(1);
  }

  // 为模型创建「默认」渠道（若不存在）
  const existing = await prisma.channel.findFirst({
    where: { modelId: model.id, upstreamId: defaultUpstream.id, name: "默认" },
  });
  if (!existing) {
    await prisma.channel.create({
      data: {
        modelId: model.id,
        upstreamId: defaultUpstream.id,
        name: "默认",
        tier: "standard",
        upstreamModelSlug: null, // 直接用 model.slug = "grok-video-3"
        // 成本待核对，先取售价的 50% 占位
        costInputPrice: 0,
        costOutputPrice: 0,
        costUnitPrice: 0.4,
        sellInputPrice: 0,
        sellOutputPrice: 0,
        sellUnitPrice: 0.8,
        priority: 100,
        enabled: true,
        enableFallback: true,
        notes: "黑猪ai · grok-video-3 · 成本待核对",
      },
    });
    console.log("✅ 已创建默认渠道");
  } else {
    console.log("ℹ️  默认渠道已存在，跳过创建");
  }

  console.log("✅ 模型就绪:");
  console.log({
    provider: { slug: provider.slug, name: provider.name },
    model: {
      id: model.id,
      slug: model.slug,
      name: model.name,
      unitPrice: model.unitPrice,
      unit: model.unit,
      enabled: model.enabled,
    },
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
