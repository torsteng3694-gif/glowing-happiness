/**
 * 一次性脚本：把所有 ComicStepV3 中 status=running 但已经超过 10 分钟没更新的 step 强制改为 failed。
 * 配合 ComicProjectV3.runLockId 解锁。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  // 把超时的 step 切到 failed
  const stuckSteps = await prisma.comicStepV3.findMany({
    where: {
      status: "running",
      updatedAt: { lt: tenMinutesAgo },
    },
    include: { project: { select: { title: true } } },
  });

  console.log(`\n找到 ${stuckSteps.length} 个超过 10 分钟没动的 running step：\n`);
  for (const s of stuckSteps) {
    console.log(`- [${s.projectId.slice(0, 8)}] ${s.project.title.slice(0, 25)} · ${s.stepKey}`);
    await prisma.comicStepV3.update({
      where: { id: s.id },
      data: {
        status: "failed",
        errorMessage: "运行进程已退出（超时强制标记），可点重跑此步重新执行",
      },
    });
    await prisma.comicProjectV3.update({
      where: { id: s.projectId },
      data: {
        status: "failed",
        errorMessage: `[${s.stepKey}] 运行进程已退出（超时强制标记）`,
      },
    });
  }

  // 同时清空所有项目的 runLock（让它们可以再次抢锁）
  const lockedProjects = await prisma.comicProjectV3.findMany({
    where: { runLockId: { not: null } },
    select: { id: true, title: true, runLockExpiresAt: true },
  });
  console.log(`\n找到 ${lockedProjects.length} 个项目有 runLock：\n`);
  for (const p of lockedProjects) {
    const expired = !p.runLockExpiresAt || p.runLockExpiresAt < now;
    if (expired) {
      console.log(`- [${p.id.slice(0, 8)}] ${p.title.slice(0, 25)} · 锁已过期，清理`);
      await prisma.comicProjectV3.update({
        where: { id: p.id },
        data: { runLockId: null, runLockExpiresAt: null },
      });
    } else {
      console.log(`- [${p.id.slice(0, 8)}] ${p.title.slice(0, 25)} · 锁仍有效，保留`);
    }
  }

  console.log("\n完成。");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
