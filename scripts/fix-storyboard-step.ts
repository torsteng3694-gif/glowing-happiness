/**
 * 一次性：把指定项目的 storyboard step 强制切到 awaiting_user
 * 用于"shots 全部已 ready 但 step 仍是 running"的情况
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const projectId = process.argv[2];
if (!projectId) {
  console.error("用法：npx tsx scripts/fix-storyboard-step.ts <projectId>");
  process.exit(1);
}

async function main() {
  const shots = await prisma.comicShotV3.findMany({
    where: { projectId },
    orderBy: { shotIndex: "asc" },
  });
  const ready = shots.filter((s) => s.genStatus === "ready");
  console.log(`项目 ${projectId} 共 ${shots.length} 镜，${ready.length} 已 ready`);

  // 构造一个最简的 candidate（让确认按钮能点）
  const data = {
    shots: shots.map((s) => ({
      index: s.shotIndex,
      sceneIndex: s.sceneIndex,
      shotType: s.shotType,
      cameraMove: s.cameraMove,
      durationSec: s.durationSec,
      imagePrompt: s.imagePrompt,
      motionHint: s.motionHint || "",
      dialogue: s.dialogue || "",
      assetIds: s.assetIds ? JSON.parse(s.assetIds) : [],
      keyframeUrl: s.keyframeUrl,
    })),
  };
  const candidate = {
    id: "main",
    kind: "storyboard",
    data,
    mdSummary: `### 分镜脚本\n共 ${shots.length} 镜，${ready.length} 已就绪`,
  };

  await prisma.comicStepV3.update({
    where: { projectId_stepKey: { projectId, stepKey: "storyboard" } },
    data: {
      candidates: JSON.stringify([candidate]),
      pickedCandidateId: "main",
      status: "awaiting_user",
      progress: 80,
      errorMessage: null,
    },
  });
  // 释放项目锁 + 切到 awaiting_user
  await prisma.comicProjectV3.update({
    where: { id: projectId },
    data: {
      status: "awaiting_user",
      runLockId: null,
      runLockExpiresAt: null,
      errorMessage: null,
    },
  });

  console.log("已修复。前端刷新即可看到 storyboard step 为 awaiting_user 状态。");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
