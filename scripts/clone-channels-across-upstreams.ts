import { prisma } from "../src/lib/db";

/**
 * 把一个模型的现有渠道复制到其它启用的上游账号上，方便做多渠道 / 自动降级测试。
 *
 * 用法：
 *   npx tsx scripts/clone-channels-across-upstreams.ts [modelSlug]
 *
 * 不传参数时默认处理 Nano Banana Pro (`gemini-3-pro-image-preview`)。
 *
 * 规则：
 *   - 以「优先级最小」的已存在渠道作为模板；
 *   - 每个启用的上游各留/补一条渠道，命名为 `{upstream.name}`，tier=standard，priority 递增 10；
 *   - 已存在（modelId + upstreamId 相同）的渠道不动，避免覆盖用户修改过的价格。
 */

const DEFAULT_MODEL_SLUG = "gemini-3-pro-image-preview";

async function main() {
  const slug = process.argv[2] || DEFAULT_MODEL_SLUG;

  const model = await prisma.model.findUnique({
    where: { slug },
    include: {
      channels: {
        include: { upstream: true },
        orderBy: { priority: "asc" },
      },
    },
  });
  if (!model) {
    console.error(`❌ 找不到 slug=${slug} 的模型`);
    process.exit(1);
  }
  if (model.channels.length === 0) {
    console.error(`❌ 模型「${model.name}」还没有任何渠道作为模板，请先在 /admin/models 里建一条`);
    process.exit(1);
  }

  const template = model.channels[0];
  console.log(`\n🎯 目标模型: ${model.name} (slug=${model.slug})`);
  console.log(`📋 模板渠道: ${template.name} · 上游=${template.upstream.name} · 售价=¥${template.sellUnitPrice} · 成本=¥${template.costUnitPrice}\n`);

  const upstreams = await prisma.upstream.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
  });
  if (upstreams.length <= 1) {
    console.warn("⚠️  当前只有 ≤1 个启用的上游账号，无法做「多渠道降级」演示。");
    console.warn("   去 /admin/upstreams 再新建 1 个上游后重试。");
    return;
  }

  const existingByUpstream = new Map(model.channels.map((c) => [c.upstreamId, c]));
  let prio = Math.max(...model.channels.map((c) => c.priority)) + 10;

  for (const u of upstreams) {
    if (existingByUpstream.has(u.id)) {
      console.log(`   ℹ️  上游「${u.name}」已经挂了渠道（${existingByUpstream.get(u.id)!.name}），跳过`);
      continue;
    }
    const created = await prisma.channel.create({
      data: {
        modelId: model.id,
        upstreamId: u.id,
        name: u.name,
        tier: "standard",
        upstreamModelSlug: template.upstreamModelSlug,
        costInputPrice: template.costInputPrice,
        costOutputPrice: template.costOutputPrice,
        costUnitPrice: template.costUnitPrice,
        sellInputPrice: template.sellInputPrice,
        sellOutputPrice: template.sellOutputPrice,
        sellUnitPrice: template.sellUnitPrice,
        priority: prio,
        enabled: true,
        enableFallback: true,
        notes: `从「${template.name}」克隆，多上游自动降级演示`,
      },
    });
    prio += 10;
    console.log(`   ✅ 已为上游「${u.name}」创建渠道：${created.name} · priority=${created.priority}`);
  }

  const after = await prisma.channel.findMany({
    where: { modelId: model.id },
    include: { upstream: true },
    orderBy: { priority: "asc" },
  });
  console.log(`\n📊 完成后「${model.name}」共 ${after.length} 条渠道：`);
  for (const c of after) {
    console.log(`   [${c.enabled ? "✅" : "⛔"}] priority=${String(c.priority).padEnd(4)} ${c.name.padEnd(14)} → 上游 ${c.upstream.name}`);
  }
  console.log("\n完成。去 /dashboard/image 选 Nano Banana Pro，渠道档位里就能看到多条了。\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
