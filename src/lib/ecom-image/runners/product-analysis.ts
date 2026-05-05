/**
 * 节点 01 · 商品智能分析 runner
 *
 * 输入：用户初始描述 + 已上传图片 URL
 * 输出（写入 EcomProjectNode.output）：{ projectTitle, reportMd, recommendedTypes }
 * 副作用：
 *   - 把 recommendedTypes 写入 EcomImageType 表（默认 selected=false，等用户勾）
 *   - 把 projectTitle 写到 EcomProject.title
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { NODE_KEYS } from "../nodes";
import { ProductAnalysisOutputSchema, RecommendedTypeSchema } from "../schemas";
import { callVisionJson } from "../vision";
import { PRODUCT_ANALYSIS_SYSTEM, buildProductAnalysisUser, META_TAGS } from "../prompts";

// 接受 LLM 返回的略宽 schema（容错）
const LLMOutputSchema = z.object({
  projectTitle: z.string().min(1),
  reportMd: z.string().min(1),
  recommendedTypes: z.array(RecommendedTypeSchema).min(1).max(15),
});

export interface RunProductAnalysisOpts {
  projectId: string;
  userId: string;
  modelSlug: string;
  feedback?: string | null;
}

export async function runProductAnalysis(opts: RunProductAnalysisOpts) {
  const { projectId, userId, modelSlug, feedback } = opts;

  // 1. 取项目 + 已上传图
  const project = await prisma.ecomProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("项目不存在");

  const sourceImages = await prisma.ecomSourceImage.findMany({
    where: { projectId },
    orderBy: { orderIdx: "asc" },
  });
  if (sourceImages.length === 0) {
    throw new Error("请先上传至少 1 张商品图");
  }

  // 2. 调视觉 LLM
  const result = await callVisionJson({
    userId,
    modelSlug,
    system: PRODUCT_ANALYSIS_SYSTEM,
    userText: buildProductAnalysisUser({
      initialPrompt: project.initialPrompt,
      imageCount: sourceImages.length,
      feedback,
    }),
    imageUrls: sourceImages.map((s) => s.url),
    imageDetail: "high",
    schema: LLMOutputSchema,
    metaTag: META_TAGS[NODE_KEYS.PRODUCT_ANALYSIS],
    maxTokens: 6000,
  });

  // 3. 把 projectTitle 写回项目（用户没改过 title 时才覆盖；简化起见每次都覆盖）
  await prisma.ecomProject.update({
    where: { id: projectId },
    data: { title: result.data.projectTitle.slice(0, 80) },
  });

  // 4. 写 EcomImageType（reject 重生时先清空旧的、再写新的）
  await prisma.ecomImageType.deleteMany({
    where: { projectId, origin: "ai_recommended" },
  });
  let order = 0;
  for (const t of result.data.recommendedTypes) {
    await prisma.ecomImageType.create({
      data: {
        projectId,
        typeKey: t.typeKey,
        name: t.name,
        description: t.description,
        priorityTags: JSON.stringify(t.priorityTags ?? []),
        sceneTags: JSON.stringify(t.sceneTags ?? []),
        valueChip: t.valueChip ?? null,
        platforms: JSON.stringify(t.platforms ?? []),
        reasoning: t.reasoning ?? null,
        rating: t.rating ?? null,
        origin: "ai_recommended",
        selected: false,
        orderIdx: order++,
      },
    });
  }

  // 5. 写节点 output（产物 = 与 recommendedTypes 同步的快照）
  const output = ProductAnalysisOutputSchema.parse({
    projectTitle: result.data.projectTitle,
    reportMd: result.data.reportMd,
    recommendedTypes: result.data.recommendedTypes,
  });
  await prisma.ecomProjectNode.update({
    where: { projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.PRODUCT_ANALYSIS } },
    data: { output: JSON.stringify(output) },
  });
}
