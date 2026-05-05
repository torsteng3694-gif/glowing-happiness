import { prisma } from "../src/lib/db";

/**
 * 只清理「没有任何 Usage 账单」的模型、渠道、厂商。有账单的一律保留。
 *
 * 步骤：
 *   1) 从 Usage 里找出"被用过"的 modelId 集合
 *   2) 删除所有 unused 模型的渠道（实际上 Channel.modelId 是 Cascade，会随模型走，但显式删更直观）
 *   3) 删除所有 unused 模型
 *   4) 删除"已经没有任何模型挂着"的 Provider
 *   5) Task / MediaAsset 里指向被删模型的 modelId 已是 nullable，保留记录并自动置为 NULL 由 DB 完成
 *      —— 但 SQLite 在 Prisma 默认关系下不会级联 SET NULL，所以我们主动先解耦
 */

async function main() {
  const [providerCount, modelCount, channelCount, usageCount, taskCount, mediaCount] =
    await Promise.all([
      prisma.provider.count(),
      prisma.model.count(),
      prisma.channel.count(),
      prisma.usage.count(),
      prisma.task.count(),
      prisma.mediaAsset.count(),
    ]);

  console.log("\n========== 当前数据库统计 ==========");
  console.log(`  Provider  (厂商)     : ${providerCount}`);
  console.log(`  Model     (模型)     : ${modelCount}`);
  console.log(`  Channel   (渠道)     : ${channelCount}`);
  console.log(`  Usage     (账单)     : ${usageCount}`);
  console.log(`  Task      (异步任务) : ${taskCount}`);
  console.log(`  MediaAsset(作品)     : ${mediaCount}`);
  console.log("=====================================\n");

  if (modelCount === 0 && providerCount === 0) {
    console.log("✨ 已经是空的。");
    return;
  }

  // 1) 找出被 Usage 引用的 model id
  const usedModelRows = await prisma.usage.groupBy({
    by: ["modelId"],
    _count: { modelId: true },
  });
  const usedModelIds = new Set(usedModelRows.map((r) => r.modelId).filter((x): x is string => Boolean(x)));
  console.log(`🔒 保留 ${usedModelIds.size} 个有账单记录的模型`);

  const allModels = await prisma.model.findMany({
    select: { id: true, name: true, slug: true, providerId: true },
  });
  const unusedModels = allModels.filter((m) => !usedModelIds.has(m.id));
  const unusedModelIds = unusedModels.map((m) => m.id);
  console.log(`🗑️  将要删除 ${unusedModelIds.length} 个未使用的模型`);

  if (unusedModelIds.length === 0) {
    console.log("📭 没有可以删除的模型。结束。");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Task 和 MediaAsset 的 modelId 是 nullable，先把引用"未使用模型"的行解耦
    const tUnset = await tx.task.updateMany({
      where: { modelId: { in: unusedModelIds } },
      data: { modelId: null },
    });
    if (tUnset.count) console.log(`   ✂️  Task 解除 modelId 关联 ${tUnset.count} 条`);

    const mUnset = await tx.mediaAsset.updateMany({
      where: { modelId: { in: unusedModelIds } },
      data: { modelId: null },
    });
    if (mUnset.count) console.log(`   ✂️  MediaAsset 解除 modelId 关联 ${mUnset.count} 条`);

    // Channel 通过 Cascade 会自动被删；为了拿到数量这里显式 deleteMany
    const chDel = await tx.channel.deleteMany({ where: { modelId: { in: unusedModelIds } } });
    console.log(`   🗑️  删除 Channel ${chDel.count} 条`);

    const mDel = await tx.model.deleteMany({ where: { id: { in: unusedModelIds } } });
    console.log(`   🗑️  删除 Model ${mDel.count} 条`);

    // 4) 删除没有任何模型挂着的 Provider
    const remainingProviderIds = new Set(
      (await tx.model.findMany({ select: { providerId: true } })).map((m) => m.providerId),
    );
    const orphanProviders = (await tx.provider.findMany({ select: { id: true, name: true } }))
      .filter((p) => !remainingProviderIds.has(p.id));
    if (orphanProviders.length) {
      const ids = orphanProviders.map((p) => p.id);
      const del = await tx.provider.deleteMany({ where: { id: { in: ids } } });
      console.log(`   🗑️  删除孤儿 Provider ${del.count} 条：${orphanProviders.map((p) => p.name).join(", ")}`);
    }
  });

  const [p2, m2, c2] = await Promise.all([
    prisma.provider.count(),
    prisma.model.count(),
    prisma.channel.count(),
  ]);
  console.log(`\n✅ 完成。剩余 Provider=${p2}, Model=${m2}, Channel=${c2}`);
  console.log(`   上游账号（Upstream）未动。\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
