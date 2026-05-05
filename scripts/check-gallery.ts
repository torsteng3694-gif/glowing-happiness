import { PrismaClient } from "@prisma/client";
(async () => {
  const p = new PrismaClient();
  const user = await p.user.findFirst({ where: { email: "test@example.com" } });
  if (!user) { console.log("no user"); process.exit(1); }

  const [count, items, counts] = await Promise.all([
    p.mediaAsset.count({ where: { userId: user.id, deletedAt: null } }),
    p.mediaAsset.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" }, take: 10,
      include: { model: { select: { name: true } } },
    }),
    p.mediaAsset.groupBy({
      by: ["type"],
      where: { userId: user.id, deletedAt: null },
      _count: { _all: true }, _sum: { cost: true },
    }),
  ]);

  console.log(`用户: ${user.email}`);
  console.log(`我的作品总数: ${count}`);
  console.log("按类型:");
  for (const c of counts) {
    console.log(`  ${c.type}: ${c._count._all} 件, 累计 ¥${c._sum.cost?.toFixed(4) || 0}`);
  }
  console.log("\n最近 10 件:");
  for (const a of items) {
    console.log(`  [${a.type}] ${a.createdAt.toISOString()} task=${a.taskId} model=${a.model?.name} fav=${a.favorite}`);
    console.log(`    prompt: ${(a.prompt || "").slice(0, 50)}`);
    console.log(`    url:    ${a.url}`);
  }
  await p.$disconnect();
})();
