// 电商一键出图 · 数据层 smoke test
// 目的：跳过 HTTP/auth，直接验证 mock-engine + snapshot 在 sqlite 上端到端跑通。
//
// 用法：
//   node scripts/smoke-ecom-image.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 找任意一个 user 作为 owner
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error("数据库里没有 user，请先注册一个账号");
  }
  console.log(`[smoke] 使用 user: ${user.email} (${user.id})`);

  // 动态 import 业务代码
  const { createDemoProject } = await import("../src/lib/ecom-image/mock-engine.ts");
  const { loadProjectSnapshot } = await import("../src/lib/ecom-image/snapshot.ts");

  console.log("[smoke] 创建 demo 项目...");
  const project = await createDemoProject(user.id);
  console.log(`[smoke] 创建成功: id=${project.id} title=${project.title}`);

  console.log("[smoke] 拉取 snapshot...");
  const snapshot = await loadProjectSnapshot(project.id);
  if (!snapshot) throw new Error("snapshot 为 null");

  console.log("\n=== Snapshot 概览 ===");
  console.log(`  project.status         = ${snapshot.project.status}`);
  console.log(`  project.currentNode    = ${snapshot.project.currentNode}`);
  console.log(`  project.progress       = ${snapshot.project.progress}`);
  console.log(`  nodes count            = ${snapshot.nodes.length} (期望 7)`);
  console.log(`  sourceImages count     = ${snapshot.sourceImages.length}`);
  console.log(`  imageTypes count       = ${snapshot.imageTypes.length}`);
  console.log(`  imagePlans count       = ${snapshot.imagePlans.length} (期望 12)`);
  console.log(`  generatedImages count  = ${snapshot.generatedImages.length} (期望 24)`);

  console.log("\n=== 节点状态 ===");
  for (const n of snapshot.nodes) {
    console.log(`  ${n.index} ${n.key.padEnd(20)} status=${n.status.padEnd(15)} runCount=${n.runCount}`);
  }

  console.log("\n=== 节点 04 分类组 ===");
  const node04 = snapshot.nodes.find((n) => n.key === "plan_creation");
  if (node04?.output) {
    const out = node04.output;
    console.log(`  totalGroups=${out.totalGroups} totalImages=${out.totalImages}`);
    for (const g of out.groups) {
      console.log(`  - ${g.typeName} (${g.plans.length} 张) priority=${g.priorityTags.join(",")}`);
    }
  }

  console.log("\n=== 候选图状态 ===");
  const byStatus = {};
  for (const g of snapshot.generatedImages) {
    byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;
  }
  console.log("  ", byStatus);

  console.log("\n=== picked 候选 ===");
  console.log(`  picked=${snapshot.generatedImages.filter((g) => g.picked).length}`);

  console.log("\n[smoke] 清理：删除 demo 项目...");
  await prisma.ecomProject.delete({ where: { id: project.id } });
  console.log("[smoke] OK");
}

main()
  .catch((e) => {
    console.error("[smoke] FAIL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
