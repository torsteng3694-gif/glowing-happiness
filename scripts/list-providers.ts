import { prisma } from "../src/lib/db";

async function main() {
  const providers = await prisma.provider.findMany({
    include: {
      models: {
        select: {
          id: true, slug: true, name: true, type: true, enabled: true,
          _count: { select: { usages: true, tasks: true, channels: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n========== 剩余厂商 / 模型 / 渠道 ==========");
  for (const p of providers) {
    console.log(`\n${p.logo || ""} ${p.name}  (slug=${p.slug})  模型=${p.models.length}`);
    for (const m of p.models) {
      console.log(
        `  └─ [${m.enabled ? "✅" : "⛔"}] ${m.type.padEnd(6)} ${m.name}  ` +
        `(slug=${m.slug}) 渠道=${m._count.channels} 账单=${m._count.usages} 任务=${m._count.tasks}`
      );
    }
  }
  console.log("");
}

main().catch(console.error).finally(() => prisma.$disconnect());
