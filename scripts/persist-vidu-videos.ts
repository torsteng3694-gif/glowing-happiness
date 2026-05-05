/**
 * 把已经 success 的 explain-comic 任务里的临时 Vidu URL 转存到 COS，
 * 同步更新 Task.resultUrls 和对应 MediaAsset.url，避免 24h 过期。
 *
 * 用法：npx tsx scripts/persist-vidu-videos.ts
 */
import { prisma } from "../src/lib/db";
import { isCosEnabled, cosUploadFromUrl } from "../src/lib/cos";

async function main() {
  if (!isCosEnabled()) {
    console.error("COS 未启用，请先在 .env 配置 TENCENT_COS_*");
    process.exit(1);
  }

  const tasks = await prisma.task.findMany({
    where: {
      type: "explain-comic",
      status: "success",
      NOT: [{ resultUrls: null }],
    },
    orderBy: { id: "asc" },
  });
  console.log(`success tasks: ${tasks.length}`);

  for (const t of tasks) {
    const urls: string[] = (() => {
      try { return JSON.parse(t.resultUrls || "[]"); } catch { return []; }
    })();
    if (urls.length === 0) continue;
    const oldUrl = urls[0];
    if (oldUrl.includes("cos.") || oldUrl.includes("myqcloud.com") || !oldUrl.includes("amazonaws.com.cn")) {
      console.log(`#${t.id} skip: 已经是非临时链接`);
      continue;
    }
    try {
      const cos = await cosUploadFromUrl(oldUrl, {
        dir: `ai-hub/explain-comic/${t.userId}`,
      });
      if (!cos) {
        console.warn(`#${t.id} cos upload returned empty`);
        continue;
      }
      await prisma.task.update({
        where: { id: t.id },
        data: { resultUrls: JSON.stringify([cos]) },
      });
      // 同步媒资库（若有）
      await prisma.mediaAsset.updateMany({
        where: { taskId: t.id, type: "video", url: oldUrl },
        data: { url: cos },
      });
      console.log(`#${t.id} -> ${cos.slice(0, 80)}...`);
    } catch (e) {
      console.error(`#${t.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  console.log("done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
