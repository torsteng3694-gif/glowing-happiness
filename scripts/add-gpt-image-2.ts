import { prisma } from "../src/lib/db";

/**
 * 新增 / 更新「GPT Image 2.0」图像模型。
 *
 * provider = xingye（星爷ai），slug = gpt-image-2-all
 * 对应上游 ai6700.com /v1/media/generate 异步任务。
 *
 * 参数约束（来自星爷ai 文档）：
 *   - size  : 必填 enum，支持 "1024x1024" / "1536x1024" / "1024x1536"
 *   - images: 可选 array，最多 10 张参考图（用于图生图）
 */
async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: "xingye" },
    update: { name: "星爷ai", logo: "⭐" },
    create: { slug: "xingye", name: "星爷ai", logo: "⭐" },
  });

  const model = await prisma.model.upsert({
    where: { slug: "gpt-image-2-all" },
    update: {
      name: "GPT Image 2.0",
      type: "image",
      description:
        "OpenAI 最新一代图像生成模型，语义理解与细节表现更强，支持文生图与图生图（由星爷ai 聚合提供）。",
      tags: "推荐,OpenAI,文生图,图生图",
      unitPrice: 0.25,
      unit: "image",
      enabled: true,
      providerId: provider.id,
    },
    create: {
      slug: "gpt-image-2-all",
      name: "GPT Image 2.0",
      type: "image",
      description:
        "OpenAI 最新一代图像生成模型，语义理解与细节表现更强，支持文生图与图生图（由星爷ai 聚合提供）。",
      tags: "推荐,OpenAI,文生图,图生图",
      unitPrice: 0.25,
      unit: "image",
      enabled: true,
      providerId: provider.id,
    },
  });

  console.log("✅ 已写入模型:");
  console.log({
    provider: { slug: provider.slug, name: provider.name },
    model: {
      id: model.id,
      slug: model.slug,
      name: model.name,
      unitPrice: model.unitPrice,
      enabled: model.enabled,
    },
  });
  console.log(
    "\nℹ️  模型本身已就绪。记得去 /admin/models 或 /admin/upstream-keys 给它配一条指向 ai6700 的渠道，否则前台会用默认 mock。",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
