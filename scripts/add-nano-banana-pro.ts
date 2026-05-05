import { prisma } from "../src/lib/db";

/**
 * 新增 / 更新「Nano Banana Pro」图像模型
 * provider = xingye（星爷ai），slug = gemini-3-pro-image-preview
 * 对应上游 ai6700.com /v1/media/generate 异步任务。
 */
async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: "xingye" },
    update: { name: "星爷ai", logo: "⭐" },
    create: { slug: "xingye", name: "星爷ai", logo: "⭐" },
  });

  const model = await prisma.model.upsert({
    where: { slug: "gemini-3-pro-image-preview" },
    update: {
      name: "Nano Banana Pro",
      type: "image",
      description:
        "谷歌 2025 最新超高清图像模型，最强文字渲染，擅长 8K 微距、皮肤质感与复杂排版（由星爷ai 聚合提供）。",
      tags: "推荐,旗舰,4K,文字渲染",
      unitPrice: 0.3,
      unit: "image",
      enabled: true,
      providerId: provider.id,
    },
    create: {
      slug: "gemini-3-pro-image-preview",
      name: "Nano Banana Pro",
      type: "image",
      description:
        "谷歌 2025 最新超高清图像模型，最强文字渲染，擅长 8K 微距、皮肤质感与复杂排版（由星爷ai 聚合提供）。",
      tags: "推荐,旗舰,4K,文字渲染",
      unitPrice: 0.3,
      unit: "image",
      enabled: true,
      providerId: provider.id,
    },
  });

  console.log("✅ 已写入模型:");
  console.log({
    provider: { slug: provider.slug, name: provider.name },
    model: { id: model.id, slug: model.slug, name: model.name, unitPrice: model.unitPrice },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
