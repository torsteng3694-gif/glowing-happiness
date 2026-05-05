/**
 * 一次性脚本：把所有 explain-comic / submitted|processing 的本地 Task
 * 主动调 Vidu 查询并写回 Task 表（含计费、媒资入库）。
 *
 * 用法：npx tsx scripts/refresh-vidu-tasks.ts
 */
import { prisma } from "../src/lib/db";
import { viduQueryTask } from "../src/lib/providers/vidu";
import { toUpstreamConfig } from "../src/lib/upstream";
import { settleExplainComic } from "../src/lib/explain-comic-settle";
import { isFinal } from "../src/lib/task-status";

async function main() {
  const tasks = await prisma.task.findMany({
    where: {
      type: "explain-comic",
      status: { notIn: ["success", "succeeded", "failed", "cancelled"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  console.log(`pending tasks: ${tasks.length}`);
  for (const task of tasks) {
    if (isFinal(task.status)) continue;
    if (!task.externalId || !task.channelId) {
      console.log(`#${task.id} skip: no externalId/channelId`);
      continue;
    }
    const channel = await prisma.channel.findUnique({
      where: { id: task.channelId },
      include: { upstream: true },
    });
    if (!channel) {
      console.log(`#${task.id} skip: channel not found`);
      continue;
    }
    const cfg = {
      ...toUpstreamConfig(channel.upstream),
      apiKey: (channel.apiKey && channel.apiKey.trim()) || channel.upstream.apiKey,
    };
    try {
      const r = await viduQueryTask(task.externalId, cfg);
      const after = await settleExplainComic({
        taskId: task.id,
        status: r.status,
        progress: r.progress,
        videoUrl: r.videoUrl,
        coverUrl: r.coverUrl,
        durationSec: r.durationSec,
        errorMessage: r.errorMessage,
      });
      console.log(
        `#${task.id} ext=${task.externalId} -> status=${after.status} cost=${after.cost} url=${(r.videoUrl || "").slice(0, 80)}...`,
      );
    } catch (e) {
      console.error(`#${task.id} refresh failed:`, e instanceof Error ? e.message : e);
    }
  }
  console.log("done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
