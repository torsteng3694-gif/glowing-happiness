/** 用法：npx tsx scripts/test-shot-video.ts [projectId] [shotIndex]
 * 手动触发一个 shot 的图生视频，把完整错误打出来 */

// 加载 .env
import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      const k = m[1];
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

import { prisma } from "../src/lib/db";
import { regenerateShotVideo } from "../src/lib/comic-agent/shot-helpers";

async function main() {
  const projectId = process.argv[2];
  const shotIndex = parseInt(process.argv[3] || "1", 10);

  let pid = projectId;
  if (!pid) {
    const p = await prisma.comicProject.findFirst({
      where: { steps: { some: { stepKey: "keyframes", status: "succeeded" } } },
      orderBy: { updatedAt: "desc" },
    });
    if (!p) {
      console.error("没找到任何 keyframes succeeded 的项目");
      process.exit(1);
    }
    pid = p.id;
  }
  const project = await prisma.comicProject.findUnique({ where: { id: pid } });
  if (!project) {
    console.error("项目不存在");
    process.exit(1);
  }
  console.log(`使用项目 ${project.id}  ${project.title}  videoSlug=${project.videoSlug}`);
  console.log(`shotIndex=${shotIndex}`);

  try {
    const r = await regenerateShotVideo({
      userId: project.userId,
      projectId: project.id,
      shotIndex,
    });
    console.log("✅ 成功:", r);
  } catch (e) {
    console.error("❌ 失败:", e instanceof Error ? e.message : String(e));
    if (e instanceof Error && e.stack) console.error(e.stack.split("\n").slice(0, 8).join("\n"));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
