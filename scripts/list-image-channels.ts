import { prisma } from "../src/lib/db";

async function main() {
  const ups = await prisma.upstream.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true, baseUrl: true, enabled: true },
  });
  console.log("\n========== 上游账号 Upstreams ==========");
  for (const u of ups) {
    console.log(`  [${u.enabled ? "✅" : "⛔"}] ${u.slug.padEnd(14)}  ${u.name.padEnd(14)}  ${u.baseUrl}`);
  }

  const models = await prisma.model.findMany({
    where: { type: "image" },
    include: {
      provider: true,
      channels: {
        include: { upstream: true },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n========== 图像模型 & 渠道 ==========");
  for (const m of models) {
    console.log(`\n  ${m.provider.logo || ""} ${m.name}  (slug=${m.slug}, ${m.enabled ? "启用" : "停用"})`);
    if (m.channels.length === 0) {
      console.log("    └─ (暂无渠道)");
      continue;
    }
    for (const c of m.channels) {
      console.log(
        `    └─ [${c.enabled ? "✅" : "⛔"}] 档位=${c.tier.padEnd(9)} 名称=${c.name.padEnd(10)} ` +
        `上游=${(c.upstream?.name || "?").padEnd(10)} 成本=¥${c.costUnitPrice} 售价=¥${c.sellUnitPrice} ` +
        `优先级=${c.priority}`
      );
    }
  }
  console.log("");
}

main().catch(console.error).finally(() => prisma.$disconnect());
