/**
 * 一次性：查看某项目的所有 shots
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const projectId = process.argv[2];
if (!projectId) {
  console.error("用法：npx tsx scripts/inspect-shots.ts <projectId>");
  process.exit(1);
}

async function main() {
  const shots = await prisma.comicShotV3.findMany({
    where: { projectId },
    orderBy: { shotIndex: "asc" },
  });
  console.log(`\n共 ${shots.length} 镜：\n`);
  for (const s of shots) {
    console.log(
      `[${String(s.shotIndex).padStart(2)}] ${s.genStatus.padEnd(12)} ${s.keyframeUrl ? "✓ " + s.keyframeUrl.slice(-30) : "无图"}  err=${(s.genError || "").slice(0, 50)}`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
