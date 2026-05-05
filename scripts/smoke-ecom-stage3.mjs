// 阶段 3 端到端 smoke
//
// 接住阶段 2 跑完的项目，再跑节点 07 真实生图

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("没有 user");

  // 确认有 image 模型可用
  const imageModels = await prisma.model.findMany({
    where: {
      type: "image",
      enabled: true,
      channels: { some: { enabled: true } },
    },
    select: { slug: true, name: true },
    take: 5,
  });
  console.log(`[stage3] 可用 image 模型: ${imageModels.map((m) => m.slug).join(", ")}`);
  if (imageModels.length === 0) {
    console.log("[stage3] 没有可用 image 模型，跳过");
    process.exit(0);
  }
  const targetImageModel = imageModels[0].slug;

  // 创建项目 + 走完阶段 1/2
  const { createMockProject } = await import("../src/lib/ecom-image/mock-engine.ts");
  const { placeholderImage } = await import("../src/lib/ecom-image/fixtures.ts");
  const proj = await createMockProject({
    userId: user.id,
    initialPrompt: "保温杯，500ml，磨砂质感，户外通勤场景。",
    title: "stage3 smoke",
    sourceImageUrls: [placeholderImage("保温杯", 100)],
  });
  console.log(`[stage3] project: ${proj.id}`);

  const engine = await import("../src/lib/ecom-image/engine.ts");
  const visionModel = "gemini-3-flash-preview";

  // 节点 01
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "product_analysis",
    modelSlug: visionModel,
  });
  // 自动选第一类
  const types = await prisma.ecomImageType.findMany({
    where: { projectId: proj.id },
    orderBy: { orderIdx: "asc" },
    take: 1,
  });
  await prisma.ecomImageType.updateMany({
    where: { id: { in: types.map((t) => t.id) } },
    data: { selected: true },
  });
  await engine.confirmNode(proj.id, "product_analysis");
  console.log("[stage3] 节点 01 OK");

  // 节点 02
  await engine.runNode({ projectId: proj.id, userId: user.id, nodeKey: "supplement_info" });
  await engine.confirmNode(proj.id, "supplement_info");

  // 节点 03
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "image_analysis",
    modelSlug: visionModel,
  });
  await engine.confirmNode(proj.id, "image_analysis");
  console.log("[stage3] 节点 03 OK");

  // 节点 04 = 模型选择（新顺序）
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "model_selection",
  });
  await prisma.ecomProject.update({
    where: { id: proj.id },
    data: { imageModelSlug: targetImageModel, imagesPerPlan: 1 },
  });
  await engine.confirmNode(proj.id, "model_selection");
  console.log(`[stage3] 节点 04 OK，锁定生图模型: ${targetImageModel}, 每方案 1 张`);

  // 节点 05 = 方案规划（新顺序，已知模型限制下规划）
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "plan_creation",
    modelSlug: visionModel,
  });
  // 缩减 plans 到 2 张以加速 smoke
  const plans = await prisma.ecomImagePlan.findMany({
    where: { projectId: proj.id },
    orderBy: { orderIdx: "asc" },
  });
  if (plans.length > 2) {
    const keep = plans.slice(0, 2);
    const drop = plans.slice(2);
    await prisma.ecomImagePlan.deleteMany({ where: { id: { in: drop.map((p) => p.id) } } });
    console.log(`[stage3] 缩减 plans: ${plans.length} → ${keep.length}`);
  }
  console.log(`[stage3] 节点 05 OK，生成的 aspectRatio:`, plans.map((p) => p.aspectRatio));
  console.log(
    `[stage3] 节点 05 referenceIds 自动绑定情况:`,
    plans.map((p) => {
      const refs = JSON.parse(p.referenceIds || "[]");
      return `plan ${p.idx}: ${refs.length} 张垫图`;
    }),
  );
  await engine.confirmNode(proj.id, "plan_creation");

  // 节点 06
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "prompt_generation",
    modelSlug: visionModel,
  });
  await engine.confirmNode(proj.id, "prompt_generation");
  console.log("[stage3] 节点 06 OK");

  // 节点 07：核心
  console.log("[stage3] 节点 07 开始批量生成...");
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "image_generation",
  });

  // 轮询直到调度器结束（节点状态从 running → awaiting_review）
  const start = Date.now();
  const MAX_WAIT = 5 * 60 * 1000; // 5 分钟
  while (true) {
    if (Date.now() - start > MAX_WAIT) {
      throw new Error("节点 07 超时");
    }
    await new Promise((r) => setTimeout(r, 3000));
    const node = await prisma.ecomProjectNode.findUnique({
      where: { projectId_nodeKey: { projectId: proj.id, nodeKey: "image_generation" } },
    });
    const stats = await prisma.ecomGeneratedImage.groupBy({
      by: ["status"],
      where: { projectId: proj.id },
      _count: true,
    });
    const statsMap = Object.fromEntries(stats.map((s) => [s.status, s._count]));
    console.log(
      `[stage3] node 07 status=${node?.status} progress=${node?.progress}%`,
      statsMap,
    );
    if (node?.status !== "running") break;
  }

  const finalImages = await prisma.ecomGeneratedImage.findMany({
    where: { projectId: proj.id },
  });
  console.log(`\n[stage3] 节点 07 完成`);
  for (const img of finalImages) {
    console.log(
      `  ${img.id} status=${img.status} runCount=${img.runCount} url=${img.url?.slice(0, 80) ?? "(空)"}`,
    );
  }

  console.log("\n[stage3] 清理...");
  await prisma.ecomProject.delete({ where: { id: proj.id } });
  console.log("[stage3] OK ✓");
}

main()
  .catch((e) => {
    console.error("[stage3] FAIL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
