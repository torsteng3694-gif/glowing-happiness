import { prisma } from "../src/lib/db";

async function main() {
  console.log("=== 上游账号 (Upstream 表) ===");
  const upstreams = await prisma.upstream.findMany({
    include: { _count: { select: { channels: true } } },
    orderBy: { priority: "asc" },
  });
  if (upstreams.length === 0) {
    console.log("  (空) 请先到 /admin/upstreams 新建上游账号，或执行 npm run db:seed");
  }
  for (const u of upstreams) {
    const shown = u.apiKey ? u.apiKey.slice(0, 6) + "…(" + u.apiKey.length + " chars)" : "(未配置)";
    console.log(`  [${u.slug}] ${u.name}  base=${u.baseUrl}  apiKey=${shown}  enabled=${u.enabled}  channels=${u._count.channels}`);
  }

  console.log("\n=== 旧 Setting 上游配置（兼容字段）===");
  const rows = await prisma.setting.findMany({
    where: { key: { in: ["upstream_base_url", "upstream_api_key", "upstream_enabled"] } },
  });
  if (rows.length === 0) {
    console.log("  (无) 已全部迁移到 Upstream 表");
  }
  rows.forEach((r) => {
    const shown = r.key === "upstream_api_key" && r.value
      ? r.value.slice(0, 6) + "…(" + r.value.length + " chars)"
      : r.value;
    console.log("  " + r.key + " = " + shown);
  });

  console.log("\n=== 最低利润率 ===");
  const rates = await prisma.setting.findMany({
    where: { key: { in: ["min_profit_rate_chat", "min_profit_rate_image", "min_profit_rate_video"] } },
  });
  if (rates.length === 0) {
    console.log("  (未配置，默认 20%) 访问 /admin/pricing 调整");
  }
  for (const r of rates) console.log(`  ${r.key} = ${r.value}`);

  console.log("\n=== 渠道统计 ===");
  const [chTotal, chEnabled, pending, lowProfit] = await Promise.all([
    prisma.channel.count(),
    prisma.channel.count({ where: { enabled: true } }),
    prisma.channel.count({ where: { notes: { contains: "待核对" } } }),
    prisma.channel.count({
      where: {
        enabled: true,
        OR: [
          { AND: [{ costInputPrice: { gt: 0 } }, { sellInputPrice: { lt: 0.0001 } }] },
          { AND: [{ costOutputPrice: { gt: 0 } }, { sellOutputPrice: { lt: 0.0001 } }] },
          { AND: [{ costUnitPrice: { gt: 0 } }, { sellUnitPrice: { lt: 0.0001 } }] },
        ],
      },
    }),
  ]);
  console.log(`  总渠道: ${chTotal} (已启用 ${chEnabled})`);
  console.log(`  成本待核对: ${pending}`);
  console.log(`  售价低于成本: ${lowProfit}`);

  console.log("\n=== Nano Banana Pro 模型 ===");
  const m = await prisma.model.findUnique({
    where: { slug: "gemini-3-pro-image-preview" },
    include: {
      provider: true,
      channels: { include: { upstream: { select: { slug: true, name: true } } } },
    },
  });
  if (!m) {
    console.log("  未找到");
  } else {
    console.log({
      id: m.id,
      name: m.name,
      slug: m.slug,
      type: m.type,
      provider: m.provider.name,
      enabled: m.enabled,
      channelCount: m.channels.length,
    });
    for (const c of m.channels) {
      console.log(`    · [${c.tier}] ${c.name}  via ${c.upstream.slug}  cost=${c.costUnitPrice} / sell=${c.sellUnitPrice}  enabled=${c.enabled}`);
    }
  }

  console.log("\n=== 图像模型总数 ===");
  const count = await prisma.model.count({ where: { type: "image", enabled: true } });
  console.log("  enabled image models: " + count);
}

main().finally(() => prisma.$disconnect());
