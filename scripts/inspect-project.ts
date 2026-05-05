/**
 * 一次性：详细输出某项目的所有 step 状态
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const projectId = process.argv[2];
if (!projectId) {
  console.error("用法：npx tsx scripts/inspect-project.ts <projectId>");
  process.exit(1);
}

async function main() {
  const project = await prisma.comicProjectV3.findUnique({
    where: { id: projectId },
    include: {
      steps: { orderBy: { stepIndex: "asc" } },
    },
  });
  if (!project) {
    console.log("项目不存在");
    return;
  }
  console.log(`\n项目：${project.title}`);
  console.log(`ID：${project.id}`);
  console.log(`status：${project.status}`);
  console.log(`currentStep：${project.currentStep}`);
  console.log(`imageSlug：${project.imageSlug}`);
  console.log(`runLockId：${project.runLockId}`);
  console.log(`runLockExpiresAt：${project.runLockExpiresAt}`);
  console.log(`errorMessage：${project.errorMessage}\n`);

  console.log("=== Steps ===");
  for (const s of project.steps) {
    console.log(
      `[${s.stepIndex}] ${s.stepKey.padEnd(15)} ${s.status.padEnd(15)} progress=${s.progress}  cost=¥${s.cost.toFixed(2)}  err=${(s.errorMessage || "").slice(0, 60)}`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
