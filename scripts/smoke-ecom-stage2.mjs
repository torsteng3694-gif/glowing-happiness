// 阶段 2 端到端 smoke
//
// 验证节点 01 → 02 → 03 → 04 → 05 → 06 全部跑通
//
// 使用 picsum 占位图（claude-sonnet-4-6 已实测能识别）

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("没有 user");

  // 1. 创建项目
  const { createMockProject } = await import("../src/lib/ecom-image/mock-engine.ts");
  const { placeholderImage } = await import("../src/lib/ecom-image/fixtures.ts");
  const proj = await createMockProject({
    userId: user.id,
    initialPrompt:
      "我有一款不锈钢真空保温杯，500ml，主打 24 小时保温，外观磨砂质感，目标人群是户外通勤白领。需要做电商主图、白底图和详情页海报。",
    title: "保温杯出图 stage2",
    sourceImageUrls: [placeholderImage("不锈钢保温杯", 200), placeholderImage("保温杯侧面", 220)],
  });
  console.log(`[stage2] project: ${proj.id}`);

  const engine = await import("../src/lib/ecom-image/engine.ts");
  const visionModel = "gemini-3-flash-preview";

  // 2. 节点 01
  console.log("[stage2] 节点 01 商品分析...");
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "product_analysis",
    modelSlug: visionModel,
  });
  // 自动选前 2 类
  const types = await prisma.ecomImageType.findMany({
    where: { projectId: proj.id },
    orderBy: { orderIdx: "asc" },
    take: 2,
  });
  await prisma.ecomImageType.updateMany({
    where: { id: { in: types.map((t) => t.id) } },
    data: { selected: true },
  });
  console.log(`[stage2] 节点 01 OK，自动选了 ${types.length} 类`);
  await engine.confirmNode(proj.id, "product_analysis");

  // 3. 节点 02 永远 skip（confirm 时被自动 run，手动 confirm 一下）
  await engine.runNode({ projectId: proj.id, userId: user.id, nodeKey: "supplement_info" });
  await engine.confirmNode(proj.id, "supplement_info");
  console.log("[stage2] 节点 02 skip OK");

  // 4. 节点 03
  console.log("[stage2] 节点 03 图片分析...");
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "image_analysis",
    modelSlug: visionModel,
  });
  const imgs = await prisma.ecomSourceImage.findMany({ where: { projectId: proj.id } });
  console.log(
    `[stage2] 节点 03 OK，${imgs.filter((i) => i.analyzeStatus === "done").length}/${imgs.length} 张已解析`,
  );
  await engine.confirmNode(proj.id, "image_analysis");

  // 5. 节点 04 出图方案
  console.log("[stage2] 节点 04 方案规划...");
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "plan_creation",
    modelSlug: visionModel,
  });
  const plans = await prisma.ecomImagePlan.findMany({ where: { projectId: proj.id } });
  console.log(`[stage2] 节点 04 OK，生成 ${plans.length} 张图规划`);
  await engine.confirmNode(proj.id, "plan_creation");

  // 6. 节点 05 模型选择（已被 confirm 04 时自动 run，直接 confirm）
  const node05 = await prisma.ecomProjectNode.findUnique({
    where: { projectId_nodeKey: { projectId: proj.id, nodeKey: "model_selection" } },
  });
  if (node05?.status !== "awaiting_review") {
    await engine.runNode({ projectId: proj.id, userId: user.id, nodeKey: "model_selection" });
  }
  const node05After = await prisma.ecomProjectNode.findUnique({
    where: { projectId_nodeKey: { projectId: proj.id, nodeKey: "model_selection" } },
  });
  const out05 = JSON.parse(node05After.output);
  console.log(
    `[stage2] 节点 05 OK，可选 ${out05.availableModels.length} 个生图模型，默认 ${out05.selectedSlug}`,
  );
  await engine.confirmNode(proj.id, "model_selection");

  // 7. 节点 06 提示词生成
  console.log("[stage2] 节点 06 提示词生成...");
  await engine.runNode({
    projectId: proj.id,
    userId: user.id,
    nodeKey: "prompt_generation",
    modelSlug: visionModel,
  });
  const promptedPlans = await prisma.ecomImagePlan.findMany({
    where: { projectId: proj.id, prompt: { not: null } },
  });
  console.log(`[stage2] 节点 06 OK，${promptedPlans.length}/${plans.length} 条提示词已生成`);
  if (promptedPlans[0]) {
    console.log(`        示例: ${promptedPlans[0].title}`);
    console.log(`        prompt 头: ${promptedPlans[0].prompt?.slice(0, 120)}...`);
  }
  await engine.confirmNode(proj.id, "prompt_generation");

  console.log("\n[stage2] 全部 OK ✓");
  console.log("[stage2] 清理...");
  await prisma.ecomProject.delete({ where: { id: proj.id } });
}

main()
  .catch((e) => {
    console.error("[stage2] FAIL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
