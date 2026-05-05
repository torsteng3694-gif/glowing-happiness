/** 用法：npx tsx scripts/find-video-failures.ts */
import { prisma } from "../src/lib/db";

async function main() {
  const failed = await prisma.comicProjectStep.findMany({
    where: {
      stepKey: { in: ["video_gen", "keyframes"] },
      status: "failed",
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      project: { select: { id: true, title: true, status: true, mode: true } },
    },
  });

  if (failed.length === 0) {
    console.log("没有失败的视频/关键帧步骤");
  }
  for (const f of failed) {
    console.log("=".repeat(80));
    console.log(`项目: ${f.project.id}  ${f.project.title}  status=${f.project.status}`);
    console.log(`  step=${f.stepKey}  status=${f.status}  updatedAt=${f.updatedAt.toISOString()}`);
    console.log(`  errorMessage: ${f.errorMessage}`);
    console.log(`  output:`);
    if (f.output) {
      try {
        const o = JSON.parse(f.output);
        console.log(JSON.stringify(o, null, 2).slice(0, 4000));
      } catch {
        console.log(f.output.slice(0, 1000));
      }
    } else {
      console.log("  (空)");
    }
  }

  console.log("\n\n=== 最近 5 个 succeeded 的 keyframes 看 url ===");
  const succList = await prisma.comicProjectStep.findMany({
    where: { stepKey: "keyframes", status: "succeeded" },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  for (const succ of succList) {
    console.log(`-- ${succ.updatedAt.toISOString()} project=${succ.projectId}`);
    if (succ.output) {
      try {
        const o = JSON.parse(succ.output);
        const items = (o as { items?: Array<{ url?: string }> }).items ?? [];
        for (const it of items.slice(0, 2)) {
          console.log(`   ${it.url}`);
        }
      } catch {}
    }
  }

  console.log("\n\n=== 最近 video_gen 步骤 ===");
  const vids = await prisma.comicProjectStep.findMany({
    where: { stepKey: "video_gen" },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  for (const v of vids) {
    console.log(`-- ${v.updatedAt.toISOString()} project=${v.projectId} status=${v.status}`);
    console.log(`   err: ${v.errorMessage}`);
    if (v.output) {
      try {
        const o = JSON.parse(v.output);
        console.log(`   output: ${JSON.stringify(o).slice(0, 800)}`);
      } catch {}
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
