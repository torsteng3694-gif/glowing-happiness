/** 用管理员账号测试图生视频，全程跑 callVideo / regenerateShotVideo */
import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const c = fs.readFileSync(envPath, "utf-8");
  for (const line of c.split(/\r?\n/)) {
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
import { callVideo } from "../src/lib/comic-agent/helpers";

async function main() {
  // 1. 找管理员账号
  const admin = await prisma.user.findFirst({ where: { email: "admin@ai-hub.local" } });
  if (!admin) {
    console.error("未找到 admin@ai-hub.local 账号");
    process.exit(1);
  }
  console.log(`管理员账号: ${admin.id}  balance=${admin.balance}`);

  // 2. 找一个有 keyframes 的项目，并把 videoSlug 改为 grok-video-3
  const project = await prisma.comicProject.findFirst({
    where: { steps: { some: { stepKey: "keyframes", status: "succeeded" } } },
    orderBy: { updatedAt: "desc" },
  });
  if (!project) {
    console.error("没有可用项目");
    process.exit(1);
  }
  console.log(`项目: ${project.id}  ${project.title}  videoSlug=${project.videoSlug}`);

  // 切换到 grok-video-3
  if (project.videoSlug !== "grok-video-3") {
    await prisma.comicProject.update({
      where: { id: project.id },
      data: { videoSlug: "grok-video-3" },
    });
    console.log("已将 videoSlug 切换为 grok-video-3");
  }

  // 3. 直接走 regenerateShotVideo 路径
  console.log("\n=== 测试 1: regenerateShotVideo (模拟前端「重生成视频」按钮) ===");
  try {
    const r1 = await regenerateShotVideo({
      userId: project.userId,
      projectId: project.id,
      shotIndex: 1,
    });
    console.log("✅ 成功:", r1);
  } catch (e) {
    console.error("❌ 失败:", e instanceof Error ? e.message : String(e));
  }

  // 4. 单独测试 veo3.1 是否也修好了
  console.log("\n=== 测试 2: 直接调 callVideo + veo3.1 模型（验证 veo3 修复） ===");
  try {
    const kf = await prisma.comicProjectStep.findUnique({
      where: { projectId_stepKey: { projectId: project.id, stepKey: "keyframes" } },
    });
    const url = JSON.parse(kf?.output || "{}").items?.[0]?.url;
    const r2 = await callVideo({
      userId: project.userId,
      modelSlug: "veo3.1",
      prompt: "A cat walking gently in a sunny meadow, cinematic warm light",
      duration: 8,
      aspectRatio: "16:9",
      rawParams: { image: url, image_url: url, images: [url] },
      metaTag: "manual-test:veo3.1",
    });
    console.log("✅ veo3.1 成功:", { url: r2.data.url, duration: r2.data.duration, cost: r2.cost });
  } catch (e) {
    console.error("❌ veo3.1 失败:", e instanceof Error ? e.message : String(e));
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
