/**
 * 节点 04 · 出图方案规划 runner
 *
 * 输入：
 *   - 节点 01 的 reportMd
 *   - 节点 03 的 image analysis items
 *   - 用户在节点 01 勾选的 ImageType 列表
 *   - 已上传的商品图（用于多模态视觉参考）
 *
 * 输出：
 *   - 写每个 ImageType.strategy（JSON）
 *   - 删旧 plans，重新写 EcomImagePlan
 *   - 写节点 output（PlanCreationOutput schema）
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { NODE_KEYS } from "../nodes";
import {
  PlanCreationOutputSchema,
  PlanGroupStrategySchema,
  type PlanCreationOutput,
  safeParseJson,
} from "../schemas";
import { callVisionJson } from "../vision";
import {
  PLAN_CREATION_SYSTEM,
  buildPlanCreationUser,
  META_TAGS,
} from "../prompts";
import { getModelSpec, resolveImageParams } from "../image-model-specs";

// LLM 直接产物的 schema（仅 typeKey + strategy + plans，不含 typeId/typeName 等元数据）
const LLMOutputSchema = z.object({
  groups: z
    .array(
      z.object({
        typeKey: z.string(),
        strategy: PlanGroupStrategySchema,
        plans: z
          .array(
            z.object({
              title: z.string().min(1).max(40),
              description: z.string().min(5),
              aspectRatio: z.string().default("1:1"),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1),
});

export interface RunPlanCreationOpts {
  projectId: string;
  userId: string;
  modelSlug: string;
  feedback?: string | null;
}

export async function runPlanCreation(opts: RunPlanCreationOpts) {
  const { projectId, userId, modelSlug, feedback } = opts;

  // 1. 拉取上下文
  const [project, productNode, imageAnalysisNode, selectedTypes, sourceImages] = await Promise.all([
    prisma.ecomProject.findUnique({ where: { id: projectId } }),
    prisma.ecomProjectNode.findUnique({
      where: {
        projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.PRODUCT_ANALYSIS },
      },
    }),
    prisma.ecomProjectNode.findUnique({
      where: {
        projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.IMAGE_ANALYSIS },
      },
    }),
    prisma.ecomImageType.findMany({
      where: { projectId, selected: true },
      orderBy: { orderIdx: "asc" },
    }),
    prisma.ecomSourceImage.findMany({
      where: { projectId, analyzeStatus: { not: "excluded" } },
      orderBy: { orderIdx: "asc" },
    }),
  ]);

  if (!project) throw new Error("项目不存在");
  if (selectedTypes.length === 0) {
    throw new Error("请先在节点 01 勾选至少一种出图类型");
  }
  if (sourceImages.length === 0) {
    throw new Error("没有可用的商品图");
  }
  if (!project.imageModelSlug) {
    throw new Error("请先在节点 04 选择生图模型");
  }

  // 拉取已锁定生图模型 + 它支持的比例
  const imageModel = await prisma.model.findUnique({
    where: { slug: project.imageModelSlug },
    select: { slug: true, name: true },
  });
  if (!imageModel) {
    throw new Error(`已锁定的生图模型 ${project.imageModelSlug} 不存在`);
  }
  const imageModelSpec = getModelSpec(project.imageModelSlug);
  // 列举该模型支持的比例（needsSize 模型走通用列表，其他走 supportedAspectRatios）
  const allowedAspectRatios = imageModelSpec.supportedAspectRatios.length > 0
    ? imageModelSpec.supportedAspectRatios
    : ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"];

  const reportMd =
    safeParseJson<{ reportMd?: string }>(productNode?.output ?? null, {})?.reportMd ?? "";
  const imageAnalysisItems =
    safeParseJson<{ items?: Array<{ title: string; description: string }> }>(
      imageAnalysisNode?.output ?? null,
      {},
    )?.items ?? [];

  // 2. 调视觉 LLM
  const result = await callVisionJson({
    userId,
    modelSlug,
    system: PLAN_CREATION_SYSTEM,
    userText: buildPlanCreationUser({
      initialPrompt: project.initialPrompt,
      reportMd,
      imageAnalysisItems,
      selectedTypes: selectedTypes.map((t) => ({
        typeKey: t.typeKey,
        name: t.name,
        description: t.description,
        priorityTags: safeParseJson<string[]>(t.priorityTags, []),
        sceneTags: safeParseJson<string[]>(t.sceneTags, []),
        valueChip: t.valueChip,
        platforms: safeParseJson<string[]>(t.platforms, []),
        reasoning: t.reasoning,
      })),
      imageModel: { slug: imageModel.slug, name: imageModel.name },
      allowedAspectRatios,
      feedback,
    }),
    imageUrls: sourceImages.map((s) => s.url),
    imageDetail: "high",
    schema: LLMOutputSchema,
    metaTag: META_TAGS[NODE_KEYS.PLAN_CREATION],
    maxTokens: 6000,
  });

  // 3. 用 typeKey 关联回库行
  const typeMap = new Map(selectedTypes.map((t) => [t.typeKey, t]));
  const validGroups = result.data.groups.filter((g) => typeMap.has(g.typeKey));
  if (validGroups.length === 0) {
    throw new Error("LLM 未输出任何匹配的分类");
  }

  // 4. 删旧 plans + 旧 strategy
  await prisma.ecomImagePlan.deleteMany({ where: { projectId } });

  // ★ 默认把所有 done 状态的源图作为每个 plan 的"垫图"（图生图基础）
  // 这是电商出图的合理默认：用户上传的就是商品图，应该全部喂给模型保持商品视觉一致
  // 用户可在节点 07 单图操作中按需调整
  const defaultReferenceIds = sourceImages
    .filter((s) => s.analyzeStatus === "done")
    .map((s) => ({ type: "source" as const, id: s.id }));

  // 5. 写 strategy + 新 plans
  let planOrder = 0;
  const writtenGroups: PlanCreationOutput["groups"] = [];

  for (const g of validGroups) {
    const typeRow = typeMap.get(g.typeKey)!;
    await prisma.ecomImageType.update({
      where: { id: typeRow.id },
      data: {
        strategy: JSON.stringify(g.strategy),
        plannedCount: g.plans.length,
      },
    });

    const writtenPlans = [];
    for (let i = 0; i < g.plans.length; i++) {
      const p = g.plans[i];
      // 硬规整 aspectRatio：用 resolveImageParams 把 LLM 的输出对齐到模型支持的比例
      const resolved = resolveImageParams(project.imageModelSlug!, p.aspectRatio || "1:1");
      const finalAspect = resolved.aspectRatio;

      const created = await prisma.ecomImagePlan.create({
        data: {
          projectId,
          imageTypeId: typeRow.id,
          idx: i + 1,
          title: p.title,
          description: p.description,
          aspectRatio: finalAspect,
          referenceIds: JSON.stringify(defaultReferenceIds),
          origin: "auto",
          orderIdx: planOrder++,
        },
      });
      writtenPlans.push({
        planId: created.id,
        idx: i + 1,
        title: p.title,
        description: p.description,
        aspectRatio: finalAspect,
        referenceIds: defaultReferenceIds,
        origin: "auto" as const,
      });
    }

    writtenGroups.push({
      typeId: typeRow.id,
      typeKey: typeRow.typeKey,
      typeName: typeRow.name,
      description: typeRow.description ?? undefined,
      priorityTags: safeParseJson<string[]>(typeRow.priorityTags, []),
      sceneTags: safeParseJson<string[]>(typeRow.sceneTags, []),
      valueChip: typeRow.valueChip ?? undefined,
      platforms: safeParseJson<string[]>(typeRow.platforms, []),
      rating: (typeRow.rating as "win" | "mid" | "low" | undefined) ?? undefined,
      strategy: g.strategy,
      plans: writtenPlans,
    });
  }

  // 6. 写节点 output
  const totalImages = writtenGroups.reduce((s, g) => s + g.plans.length, 0);
  const output = PlanCreationOutputSchema.parse({
    totalGroups: writtenGroups.length,
    totalImages,
    groups: writtenGroups,
  });
  await prisma.ecomProjectNode.update({
    where: {
      projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.PLAN_CREATION },
    },
    data: { output: JSON.stringify(output) },
  });
}
