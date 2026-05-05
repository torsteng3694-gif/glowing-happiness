/**
 * 电商一键出图 · Mock 引擎（阶段 0 专用）
 *
 * 不调任何 LLM / 出图上游。所有"AI 在思考"都用 setTimeout 模拟，
 * fixtures 里的预设数据按节点状态机一步步落库。
 *
 * 阶段 1+ 这个文件会被拆成：
 *   - engine.ts        真正的状态机
 *   - nodes/runners.ts 每节点真实 LLM 调用
 *   - workers.ts       后台异步任务
 */

import { prisma } from "@/lib/db";
import {
  MOCK_GENERATED_IMAGES,
  MOCK_IMAGE_ANALYSIS,
  MOCK_IMAGE_GENERATION,
  MOCK_MODEL_SELECTION,
  MOCK_PLAN_CREATION,
  MOCK_PRODUCT_ANALYSIS,
  MOCK_PROMPT_GENERATION,
  MOCK_SOURCE_IMAGES,
  MOCK_SUPPLEMENT_INFO,
} from "./fixtures";
import {
  NODE_KEYS,
  NODE_ORDER,
  NODE_STATUS,
  PROJECT_STATUS,
  type NodeKey,
} from "./nodes";

// ============================================================
// 创建项目（同时初始化 7 节点为 pending）
// ============================================================

export interface CreateProjectInput {
  userId: string;
  initialPrompt: string;
  title?: string;
  sourceImageUrls?: string[];
}

export async function createMockProject(input: CreateProjectInput) {
  const title = input.title?.trim() || input.initialPrompt.slice(0, 30) || "未命名电商出图项目";
  const project = await prisma.ecomProject.create({
    data: {
      userId: input.userId,
      title,
      initialPrompt: input.initialPrompt,
      initialImageCount: input.sourceImageUrls?.length ?? 0,
      status: PROJECT_STATUS.DRAFT,
      currentNode: NODE_KEYS.PRODUCT_ANALYSIS,
      progress: 0,
    },
  });

  // 7 个节点占位（首节点 pending，等用户/前端调用 run 才真正启动）
  await prisma.ecomProjectNode.createMany({
    data: NODE_ORDER.map((key, idx) => ({
      projectId: project.id,
      nodeKey: key,
      nodeIndex: idx,
      status: NODE_STATUS.PENDING,
    })),
  });

  // 仅当调用方显式传入 sourceImageUrls 时才落 EcomSourceImage。
  // 真实流程：前端先创建空项目 → 后续 /upload API 逐张落库（避免重复占位）。
  if (input.sourceImageUrls?.length) {
    await prisma.ecomSourceImage.createMany({
      data: input.sourceImageUrls.map((url, i) => ({
        projectId: project.id,
        url,
        filename: `upload-${i + 1}.jpg`,
        orderIdx: i,
        analyzeStatus: "pending",
      })),
    });
  }

  return project;
}

/**
 * Demo 项目：把 fixtures 预设数据全部铺成"7 节点全 confirmed"的状态，
 * 用户进来就能看到完整工作流（适合演示）。
 */
export async function createDemoProject(userId: string) {
  const project = await createMockProject({
    userId,
    initialPrompt:
      "智慧讲解租赁系统：扫码租赁柜 + 手持讲解终端，面向景区/博物馆/展厅 B 端市场，请帮我做一套电商主图、白底图与高端营销海报。",
    title: "智慧讲解租赁系统出图项目（演示）",
    // demo 项目显式提供 5 张占位图 URL（避免 createMockProject 默认不落库）
    sourceImageUrls: MOCK_SOURCE_IMAGES.map((m) => m.url),
  });

  // === 把 5 张 mock 商品图的分析结果回写 ===
  const sourceImages = await prisma.ecomSourceImage.findMany({
    where: { projectId: project.id },
    orderBy: { orderIdx: "asc" },
  });
  await Promise.all(
    sourceImages.slice(0, MOCK_SOURCE_IMAGES.length).map((row, i) => {
      const m = MOCK_SOURCE_IMAGES[i];
      return prisma.ecomSourceImage.update({
        where: { id: row.id },
        data: {
          title: m.title,
          description: m.description,
          analyzeStatus: "done",
          analyzeRunCount: 1,
        },
      });
    }),
  );

  // 节点 03 output 引用真实 sourceImageId（需把 mock 的 id 替换成数据库行 id）
  const sourceImageIdMap = new Map<string, string>();
  sourceImages.slice(0, MOCK_SOURCE_IMAGES.length).forEach((row, i) => {
    sourceImageIdMap.set(MOCK_SOURCE_IMAGES[i].id, row.id);
  });
  const imageAnalysisOutput = {
    items: MOCK_IMAGE_ANALYSIS.items.map((it) => ({
      ...it,
      sourceImageId: sourceImageIdMap.get(it.sourceImageId) ?? it.sourceImageId,
    })),
  };

  // === 出图类型表 ===
  await prisma.ecomImageType.createMany({
    data: MOCK_PRODUCT_ANALYSIS.recommendedTypes.map((t, i) => ({
      projectId: project.id,
      typeKey: t.typeKey,
      name: t.name,
      description: t.description,
      priorityTags: JSON.stringify(t.priorityTags),
      sceneTags: JSON.stringify(t.sceneTags),
      valueChip: t.valueChip ?? null,
      platforms: JSON.stringify(t.platforms),
      reasoning: t.reasoning ?? null,
      rating: t.rating ?? null,
      origin: "ai_recommended",
      // 前 3 类对应 mock plan_creation 里被勾选的 main / white_bg / poster_high_end
      selected: ["main_image", "white_bg", "poster_high_end"].includes(t.typeKey),
      plannedCount: t.typeKey === "main_image" ? 5 : t.typeKey === "white_bg" ? 3 : t.typeKey === "poster_high_end" ? 4 : 0,
      orderIdx: i,
    })),
  });

  // 节点 04：把 strategy 写到对应 ImageType 行；新建 ImagePlan 行
  const typeRows = await prisma.ecomImageType.findMany({
    where: { projectId: project.id },
    orderBy: { orderIdx: "asc" },
  });
  const typeKeyToRowId = new Map(typeRows.map((r) => [r.typeKey, r.id]));
  for (const g of MOCK_PLAN_CREATION.groups) {
    const typeRowId = typeKeyToRowId.get(g.typeKey);
    if (!typeRowId) continue;
    await prisma.ecomImageType.update({
      where: { id: typeRowId },
      data: { strategy: JSON.stringify(g.strategy) },
    });
  }

  // === ImagePlan 行 ===
  let planOrder = 0;
  const planIdMap = new Map<string, string>(); // mock planId → 数据库行 id
  for (const g of MOCK_PLAN_CREATION.groups) {
    const typeRowId = typeKeyToRowId.get(g.typeKey);
    if (!typeRowId) continue;
    for (const p of g.plans) {
      const created = await prisma.ecomImagePlan.create({
        data: {
          projectId: project.id,
          imageTypeId: typeRowId,
          idx: p.idx,
          title: p.title,
          description: p.description,
          aspectRatio: p.aspectRatio,
          referenceIds: JSON.stringify([]),
          origin: p.origin,
          orderIdx: planOrder++,
        },
      });
      planIdMap.set(p.planId, created.id);
    }
  }

  // 节点 06：把 prompts 回写到 plan 行
  for (const pm of MOCK_PROMPT_GENERATION.prompts) {
    const realId = planIdMap.get(pm.planId);
    if (!realId) continue;
    await prisma.ecomImagePlan.update({
      where: { id: realId },
      data: { prompt: pm.prompt, negativePrompt: pm.negativePrompt },
    });
  }

  // 节点 07：把 generatedImages 落库（注意把 mock planId 替换为真实 id）
  const generatedImagesData = MOCK_GENERATED_IMAGES
    .map((g) => {
      const realPlanId = planIdMap.get(g.planId);
      if (!realPlanId) return null;
      return {
        projectId: project.id,
        planId: realPlanId,
        candidateIdx: g.candidateIdx,
        status: g.status,
        progress: g.progress,
        runCount: g.runCount,
        url: g.url,
        promptSnapshot: g.promptSnapshot,
        modelSlugSnapshot: g.modelSlugSnapshot,
        width: g.width,
        height: g.height,
        cost: g.cost,
        realCost: g.realCost,
        picked: g.picked,
        errorMessage: g.errorMessage,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  await prisma.ecomGeneratedImage.createMany({ data: generatedImagesData });

  // === 节点 output 写入 ===
  // 节点 04 的 plans/typeId 在 mock 里是占位 id，这里重写成真实 id
  const realisticPlanCreation = {
    ...MOCK_PLAN_CREATION,
    groups: MOCK_PLAN_CREATION.groups.map((g) => ({
      ...g,
      typeId: typeKeyToRowId.get(g.typeKey) ?? g.typeId,
      plans: g.plans.map((p) => ({
        ...p,
        planId: planIdMap.get(p.planId) ?? p.planId,
      })),
    })),
  };
  const realisticPromptGeneration = {
    prompts: MOCK_PROMPT_GENERATION.prompts.map((pm) => ({
      ...pm,
      planId: planIdMap.get(pm.planId) ?? pm.planId,
    })),
  };

  const nodeOutputs: Record<NodeKey, unknown> = {
    [NODE_KEYS.PRODUCT_ANALYSIS]: MOCK_PRODUCT_ANALYSIS,
    [NODE_KEYS.SUPPLEMENT_INFO]: MOCK_SUPPLEMENT_INFO,
    [NODE_KEYS.IMAGE_ANALYSIS]: imageAnalysisOutput,
    [NODE_KEYS.PLAN_CREATION]: realisticPlanCreation,
    [NODE_KEYS.MODEL_SELECTION]: MOCK_MODEL_SELECTION,
    [NODE_KEYS.PROMPT_GENERATION]: realisticPromptGeneration,
    [NODE_KEYS.IMAGE_GENERATION]: MOCK_IMAGE_GENERATION,
  };

  // 节点 01-06 全 confirmed（02 = skipped），节点 07 = awaiting_review
  // 让用户进入 demo 后立即能看到节点 07 完整工作区 + 向上回退看每个节点
  for (const key of NODE_ORDER) {
    let status: string;
    let confirmedAt: Date | null = new Date();
    if (key === NODE_KEYS.SUPPLEMENT_INFO) {
      status = NODE_STATUS.SKIPPED;
    } else if (key === NODE_KEYS.IMAGE_GENERATION) {
      status = NODE_STATUS.AWAITING_REVIEW;
      confirmedAt = null;
    } else {
      status = NODE_STATUS.CONFIRMED;
    }
    await prisma.ecomProjectNode.update({
      where: { projectId_nodeKey: { projectId: project.id, nodeKey: key } },
      data: {
        status,
        progress: 100,
        output: JSON.stringify(nodeOutputs[key]),
        runCount: 1,
        startedAt: new Date(),
        confirmedAt,
      },
    });
  }

  await prisma.ecomProject.update({
    where: { id: project.id },
    data: {
      status: PROJECT_STATUS.AWAITING_USER,
      currentNode: NODE_KEYS.IMAGE_GENERATION,
      progress: 86, // 6/7 节点已确认
      imageModelSlug: MOCK_MODEL_SELECTION.selectedSlug,
      promptLanguage: MOCK_MODEL_SELECTION.promptLanguage,
      imagesPerPlan: MOCK_MODEL_SELECTION.imagesPerPlan,
      estimatedCost: MOCK_MODEL_SELECTION.estimatedTotalCost,
      totalCost: MOCK_MODEL_SELECTION.estimatedTotalCost,
    },
  });

  return project;
}

// ============================================================
// 节点动作（mock 版本：立即生效，没有真正 LLM 调用）
// ============================================================

/** 节点 run：把 mock output 直接写入并设为 awaiting_review */
export async function mockRunNode(projectId: string, nodeKey: NodeKey) {
  const node = await prisma.ecomProjectNode.findUnique({
    where: { projectId_nodeKey: { projectId, nodeKey } },
  });
  if (!node) throw new Error(`节点 ${nodeKey} 不存在`);

  const outputMap: Record<NodeKey, unknown> = {
    [NODE_KEYS.PRODUCT_ANALYSIS]: MOCK_PRODUCT_ANALYSIS,
    [NODE_KEYS.SUPPLEMENT_INFO]: MOCK_SUPPLEMENT_INFO,
    [NODE_KEYS.IMAGE_ANALYSIS]: MOCK_IMAGE_ANALYSIS,
    [NODE_KEYS.PLAN_CREATION]: MOCK_PLAN_CREATION,
    [NODE_KEYS.MODEL_SELECTION]: MOCK_MODEL_SELECTION,
    [NODE_KEYS.PROMPT_GENERATION]: MOCK_PROMPT_GENERATION,
    [NODE_KEYS.IMAGE_GENERATION]: MOCK_IMAGE_GENERATION,
  };

  await prisma.ecomProjectNode.update({
    where: { id: node.id },
    data: {
      status: NODE_STATUS.AWAITING_REVIEW,
      progress: 100,
      runStage: "完成",
      runStageText: null,
      output: JSON.stringify(outputMap[nodeKey]),
      runCount: { increment: 1 },
      startedAt: node.startedAt ?? new Date(),
    },
  });
  await prisma.ecomProject.update({
    where: { id: projectId },
    data: { status: PROJECT_STATUS.AWAITING_USER, currentNode: nodeKey },
  });
}

/** confirm 当前节点 → 把下一节点设为 pending 并自动触发其 run（mock 立即推进） */
export async function mockConfirmNode(projectId: string, nodeKey: NodeKey) {
  const node = await prisma.ecomProjectNode.findUnique({
    where: { projectId_nodeKey: { projectId, nodeKey } },
  });
  if (!node) throw new Error(`节点 ${nodeKey} 不存在`);

  await prisma.ecomProjectNode.update({
    where: { id: node.id },
    data: { status: NODE_STATUS.CONFIRMED, confirmedAt: new Date() },
  });

  const nextIdx = node.nodeIndex + 1;
  const nextKey = NODE_ORDER[nextIdx] ?? null;
  const totalNodes = NODE_ORDER.length;
  const progress = Math.round(((node.nodeIndex + 1) / totalNodes) * 100);

  if (!nextKey) {
    // 末节点 confirmed → 项目完成
    await prisma.ecomProject.update({
      where: { id: projectId },
      data: { status: PROJECT_STATUS.COMPLETED, progress: 100 },
    });
    return { nextKey: null };
  }

  await prisma.ecomProject.update({
    where: { id: projectId },
    data: { status: PROJECT_STATUS.RUNNING, currentNode: nextKey, progress },
  });
  return { nextKey };
}

/** reject 当前节点 → 写入 feedback、状态置 rejected（前端可立刻调 run 重生） */
export async function mockRejectNode(projectId: string, nodeKey: NodeKey, feedback: string) {
  await prisma.ecomProjectNode.update({
    where: { projectId_nodeKey: { projectId, nodeKey } },
    data: { status: NODE_STATUS.REJECTED, feedback },
  });
}

/** skip 节点（仅节点 02 资料补全允许） */
export async function mockSkipNode(projectId: string, nodeKey: NodeKey) {
  const node = await prisma.ecomProjectNode.findUnique({
    where: { projectId_nodeKey: { projectId, nodeKey } },
  });
  if (!node) throw new Error(`节点 ${nodeKey} 不存在`);

  await prisma.ecomProjectNode.update({
    where: { id: node.id },
    data: { status: NODE_STATUS.SKIPPED, confirmedAt: new Date() },
  });

  const nextIdx = node.nodeIndex + 1;
  const nextKey = NODE_ORDER[nextIdx] ?? null;
  const progress = Math.round(((node.nodeIndex + 1) / NODE_ORDER.length) * 100);
  if (nextKey) {
    await prisma.ecomProject.update({
      where: { id: projectId },
      data: { status: PROJECT_STATUS.RUNNING, currentNode: nextKey, progress },
    });
  }
  return { nextKey };
}

/** rollback 到上一节点的 awaiting_review 态，当前节点重置为 pending */
export async function mockRollbackToPrev(projectId: string, fromNodeKey: NodeKey) {
  const node = await prisma.ecomProjectNode.findUnique({
    where: { projectId_nodeKey: { projectId, nodeKey: fromNodeKey } },
  });
  if (!node) throw new Error(`节点 ${fromNodeKey} 不存在`);
  const prevKey = NODE_ORDER[node.nodeIndex - 1];
  if (!prevKey) throw new Error("已是首节点，无法回退");

  await prisma.$transaction([
    prisma.ecomProjectNode.update({
      where: { id: node.id },
      data: {
        status: NODE_STATUS.PENDING,
        output: null,
        feedback: null,
        runCount: 0,
        confirmedAt: null,
        runStage: null,
        runStageText: null,
        progress: 0,
      },
    }),
    prisma.ecomProjectNode.update({
      where: { projectId_nodeKey: { projectId, nodeKey: prevKey } },
      data: { status: NODE_STATUS.AWAITING_REVIEW, confirmedAt: null },
    }),
    prisma.ecomProject.update({
      where: { id: projectId },
      data: { status: PROJECT_STATUS.AWAITING_USER, currentNode: prevKey },
    }),
  ]);

  return { prevKey };
}
