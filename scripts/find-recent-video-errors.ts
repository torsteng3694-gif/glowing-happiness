/** 用法：npx tsx scripts/find-recent-video-errors.ts */
import { prisma } from "../src/lib/db";

async function main() {
  console.log("=== 最近 30 分钟所有项目状态 ===");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentSteps = await prisma.comicProjectStep.findMany({
    where: { updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { project: { select: { id: true, title: true, mode: true } } },
  });
  for (const s of recentSteps) {
    if (s.stepKey === "video_gen" || s.stepKey === "keyframes" || s.stepKey === "video_compose" || s.status === "failed") {
      console.log(
        `${s.updatedAt.toISOString()}  ${s.stepKey.padEnd(20)} ${s.status.padEnd(10)} proj=${s.projectId} ${s.errorMessage ? "ERR: " + s.errorMessage.slice(0, 200) : ""}`,
      );
    }
  }

  console.log("\n=== 最近视频相关 Usage（含失败）===");
  // 视频相关 usage
  const videoModels = await prisma.model.findMany({ where: { type: "video" } });
  const ids = videoModels.map((m) => m.id);
  const recentUsage = await prisma.usage.findMany({
    where: {
      modelId: { in: ids },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { model: { select: { slug: true } } },
  });
  for (const u of recentUsage) {
    let metaInfo = "";
    if (u.meta) {
      try {
        const m = JSON.parse(u.meta);
        metaInfo = JSON.stringify(m).slice(0, 250);
      } catch {}
    }
    console.log(
      `${u.createdAt.toISOString()}  ${u.model?.slug}  units=${u.units}  cost=¥${u.cost}  meta=${metaInfo}`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
