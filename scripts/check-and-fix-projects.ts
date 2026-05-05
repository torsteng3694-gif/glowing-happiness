/**
 * 一次性脚本：列出所有 ComicProjectV3 项目的 imageSlug 状态
 * 自动把不存在的 imageSlug 替换为系统默认 imageSlug
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.comicProjectV3.findMany({
    select: { id: true, title: true, imageSlug: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const allModels = await prisma.model.findMany({
    where: { type: "image", enabled: true },
    select: { slug: true, name: true },
  });
  const validSlugs = new Set(allModels.map((m) => m.slug));

  // 系统默认 imageSlug：从 Setting 表读
  const setting = await prisma.setting.findUnique({
    where: { key: "comic_pipeline_image_slug" },
  });
  const defaultSlug = setting?.value || allModels[0]?.slug;
  console.log(`\n系统默认 imageSlug = ${defaultSlug}\n`);

  console.log("=== ComicProjectV3 列表 ===");
  let fixedCount = 0;
  for (const p of projects) {
    const ok = validSlugs.has(p.imageSlug);
    const marker = ok ? "[✓]" : "[✗]";
    console.log(`${marker} ${p.id.slice(0, 8)}  ${p.imageSlug.padEnd(40)}  ${p.title.slice(0, 30)}`);
    if (!ok && defaultSlug) {
      await prisma.comicProjectV3.update({
        where: { id: p.id },
        data: { imageSlug: defaultSlug },
      });
      console.log(`        → 已修复为 ${defaultSlug}`);
      fixedCount++;
    }
  }

  console.log(`\n共 ${projects.length} 个项目，已修复 ${fixedCount} 个失效 imageSlug`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
