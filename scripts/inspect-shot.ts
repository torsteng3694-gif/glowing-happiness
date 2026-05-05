/** 用法：npx tsx scripts/inspect-shot.ts [projectId] [shotIndex] */

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
  console.log(`项目：${project.id}  ${project.title}`);
  console.log(`  imageSlug=${project.imageSlug}`);
  console.log(`  videoSlug=${project.videoSlug}`);
  console.log(`  aspectRatio=${project.aspectRatio}`);
  console.log(`  visualStyle=${project.visualStyle}`);

  // video model 的 channels
  const videoModel = await prisma.model.findUnique({
    where: { slug: project.videoSlug },
    include: { provider: true },
  });
  console.log(`\n  视频模型：${videoModel?.slug}  provider=${videoModel?.provider?.slug}`);

  if (videoModel) {
    const channels = await prisma.channel.findMany({
      where: { modelId: videoModel.id },
      include: { upstream: true },
    });
    console.log(`\n  视频模型所有 channels (${channels.length}):`);
    for (const c of channels) {
      console.log(`    [${c.id}] ${c.name}  enabled=${c.enabled}  upstream.enabled=${c.upstream?.enabled}  baseUrl=${c.upstream?.baseUrl}`);
    }
  }

  // 关键帧 URL
  const kf = await prisma.comicProjectStep.findUnique({
    where: { projectId_stepKey: { projectId: pid, stepKey: "keyframes" } },
  });
  if (kf?.output) {
    try {
      const o = JSON.parse(kf.output);
      const items = o.items || [];
      console.log(`\n  keyframes (${items.length}):`);
      for (const it of items.slice(0, 3)) {
        console.log(`    shot=${it.shotIndex}  url=${it.url}`);
      }
    } catch {}
  }

  // 分镜脚本
  const ss = await prisma.comicProjectStep.findUnique({
    where: { projectId_stepKey: { projectId: pid, stepKey: "storyboard_script" } },
  });
  if (ss?.output) {
    try {
      const o = JSON.parse(ss.output);
      const shot = (o.shots || []).find((s: { index: number }) => s.index === shotIndex);
      if (shot) {
        console.log(`\n  shot ${shotIndex}:`);
        console.log(`    motionPrompt: ${(shot.motionPrompt || "").slice(0, 150)}`);
        console.log(`    durationSec: ${shot.durationSec}`);
      }
    } catch {}
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
