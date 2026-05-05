/**
 * 数据迁移：从"单例 upstream + Model 自带价格"切换到 "Upstream + Channel" 架构。
 *
 * 1. 读取 Setting 表里的 upstream_* → 创建 Upstream("default")
 * 2. 为每个已启用 Model 创建一条默认 Channel，绑定到 default upstream
 *    - 售价 = Model 现有 *Price
 *    - 成本价 = 售价 × 0.5（占位，管理员需核对）
 *    - notes = "迁移生成 · 成本待核对"
 * 3. 写入 Setting 默认最低利润率（chat/image/video 各 0.2）
 *
 * 幂等：重复执行不会报错。已存在的记录会跳过。
 */
import { prisma } from "../src/lib/db";

async function main() {
  console.log("开始迁移到 Upstream + Channel 架构…");

  // -------- 1. 创建 default Upstream --------
  const settings = await prisma.setting.findMany({
    where: { key: { in: ["upstream_base_url", "upstream_api_key", "upstream_enabled"] } },
  });
  const settingMap = new Map(settings.map((s) => [s.key, s.value]));
  const baseUrl =
    settingMap.get("upstream_base_url") ||
    process.env.UPSTREAM_BASE_URL ||
    "https://api.ai6700.com";
  const apiKey = settingMap.get("upstream_api_key") || process.env.UPSTREAM_API_KEY || "";
  const enabledVal = settingMap.get("upstream_enabled") ?? "true";
  const enabled = enabledVal !== "false";

  const defaultUpstream = await prisma.upstream.upsert({
    where: { slug: "default" },
    update: {
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey,
      enabled,
    },
    create: {
      slug: "default",
      name: "默认上游",
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey,
      enabled,
      priority: 0,
    },
  });
  console.log(
    `  ✓ Upstream 'default' 已就绪 (baseUrl=${defaultUpstream.baseUrl}, key=${apiKey ? apiKey.slice(0, 6) + "…" : "(空)"}, enabled=${defaultUpstream.enabled})`,
  );

  // -------- 2. 为每个 Model 创建默认 Channel --------
  const models = await prisma.model.findMany({ include: { channels: true } });
  let created = 0;
  let skipped = 0;
  for (const m of models) {
    if (m.channels.length > 0) {
      skipped++;
      continue;
    }
    await prisma.channel.create({
      data: {
        modelId: m.id,
        upstreamId: defaultUpstream.id,
        name: "默认",
        tier: "standard",
        upstreamModelSlug: null,
        costInputPrice: Math.round(m.inputPrice * 0.5 * 10000) / 10000,
        costOutputPrice: Math.round(m.outputPrice * 0.5 * 10000) / 10000,
        costUnitPrice: Math.round(m.unitPrice * 0.5 * 10000) / 10000,
        sellInputPrice: m.inputPrice,
        sellOutputPrice: m.outputPrice,
        sellUnitPrice: m.unitPrice,
        priority: 100,
        enabled: m.enabled,
        enableFallback: true,
        notes: "迁移生成 · 成本待核对",
      },
    });
    created++;
  }
  console.log(`  ✓ Channel 迁移完成：新建 ${created} 条，跳过 ${skipped} 条（已有渠道）`);

  // -------- 3. 默认最低利润率 --------
  const defaults: [string, string][] = [
    ["min_profit_rate_chat", "0.2"],
    ["min_profit_rate_image", "0.2"],
    ["min_profit_rate_video", "0.2"],
  ];
  for (const [k, v] of defaults) {
    await prisma.setting.upsert({
      where: { key: k },
      update: {},
      create: { key: k, value: v },
    });
  }
  console.log("  ✓ 默认最低利润率已写入 Setting（chat/image/video = 0.2）");

  // -------- 汇总 --------
  const chCount = await prisma.channel.count();
  const upCount = await prisma.upstream.count();
  console.log(`\n迁移完成：Upstream ${upCount} 条，Channel ${chCount} 条。`);
  console.log("提醒：迁移生成的渠道成本默认取售价 × 0.5，请进入 /admin/models 核对修正。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
