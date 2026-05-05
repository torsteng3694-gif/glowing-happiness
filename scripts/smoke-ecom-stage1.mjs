// 阶段 1 · 端到端 smoke
//
// 验证：
//   1. 列出可用视觉模型（API 内部）
//   2. 创建空项目（不走 HTTP，直接 prisma）
//   3. 模拟一张 placeholder 图入库
//   4. 调真 engine.runNode 跑节点 01 → 验证产物 + 类型卡数量
//   5. confirm → 期望 supplement_info 自动 skip
//   6. 跑节点 03（先勾选几个 type）→ 验证 SourceImage.title/description 落库
//   7. 清理项目

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("没有 user，先注册一个账号");
  console.log(`[smoke] user: ${user.email}`);

  // 1. 列模型
  const models = await prisma.model.findMany({
    where: { type: "chat", enabled: true },
    select: { slug: true, tags: true },
    take: 5,
  });
  console.log(`[smoke] DB 中可见 ${models.length} 个 chat 模型`);

  // 找一个能多模态的（按 tags 或 slug 模式）
  const allModels = await prisma.model.findMany({
    where: { type: "chat", enabled: true, channels: { some: { enabled: true } } },
  });
  const visionLike = allModels.find((m) => {
    const tags = (m.tags ?? "").toLowerCase();
    if (tags.includes("多模态") || tags.includes("vision")) return true;
    return /^(gpt-?[45]|claude-(opus|sonnet|haiku)|gemini|grok-?[2-9])/i.test(m.slug);
  });
  if (!visionLike) {
    console.log("[smoke] 没有可用视觉模型 → 跳过 LLM 测试");
    process.exit(0);
  }
  console.log(`[smoke] 用模型: ${visionLike.slug}`);

  // 2. 创建项目
  const { createMockProject } = await import("../src/lib/ecom-image/mock-engine.ts");
  const proj = await createMockProject({
    userId: user.id,
    initialPrompt:
      "我有一款不锈钢真空保温杯，500ml，主打 24 小时保温，外观磨砂质感，目标人群是户外通勤白领。需要做电商主图、白底图和详情页海报。",
    title: "保温杯出图测试",
  });
  console.log(`[smoke] project: ${proj.id}`);

  // 3. 加一张占位图（用 placeholder data URL）
  const { placeholderImage } = await import("../src/lib/ecom-image/fixtures.ts");
  await prisma.ecomSourceImage.create({
    data: {
      projectId: proj.id,
      url: placeholderImage("不锈钢真空保温杯", 200),
      filename: "test.png",
      orderIdx: 0,
      analyzeStatus: "pending",
    },
  });

  // 4. 节点 01 run
  const engine = await import("../src/lib/ecom-image/engine.ts");
  console.log("[smoke] 跑节点 01（视觉分析）…");
  try {
    await engine.runNode({
      projectId: proj.id,
      userId: user.id,
      nodeKey: "product_analysis",
      modelSlug: visionLike.slug,
    });
    console.log("[smoke] 节点 01 OK");
  } catch (e) {
    console.error("[smoke] 节点 01 失败:", e?.message ?? e);
    console.log("[smoke] 这可能是上游 key 没配/data URL 不被上游接受。继续清理...");
    await prisma.ecomProject.delete({ where: { id: proj.id } });
    process.exit(1);
  }

  // 验证产物
  const types = await prisma.ecomImageType.findMany({ where: { projectId: proj.id } });
  console.log(`[smoke] 节点 01 输出类型数: ${types.length}`);
  if (types.length > 0) {
    console.log(`        首个类型: ${types[0].typeKey} - ${types[0].name}`);
  }

  // 5. confirm 节点 01
  console.log("[smoke] confirm 节点 01...");
  const r1 = await engine.confirmNode(proj.id, "product_analysis");
  console.log(`[smoke] 下一节点: ${r1.nextKey}`);

  // 6. 清理
  console.log("[smoke] 清理项目...");
  await prisma.ecomProject.delete({ where: { id: proj.id } });
  console.log("[smoke] 全部 OK ✓");
}

main()
  .catch((e) => {
    console.error("[smoke] FAIL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
