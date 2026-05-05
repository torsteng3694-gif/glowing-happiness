/**
 * 节点 07 · 批量出图 runner
 *
 * 设计：
 *   - 调用方（API）只负责"提交任务"：往 EcomGeneratedImage 表写若干 queued 行 + 触发调度器（fire-and-forget）
 *   - 调度器（runProjectImageQueue）：循环找 queued/failed-retryable 行，并发 N 调上游
 *   - 单图 worker：调上游 → 写 done/failed → 重试时按 EcomAutoConfig.retryImageGen 上限
 *
 * 状态流：
 *   queued → running → done     // 成功
 *                   ↘  failed   // 上游报错；runCount < retryLimit 时再次入队
 *
 * 节点 07 的 awaiting_review 在所有 plan 都至少有一张 done/failed_max 时进入。
 */

import { prisma } from "@/lib/db";
import { NODE_KEYS, NODE_STATUS, PROJECT_STATUS } from "../nodes";
import {
  ImageGenerationOutputSchema,
  safeParseJson,
} from "../schemas";
import { generateOneImage } from "../image-gen";

/**
 * 默认严格串行（CONCURRENCY=1）：
 *   - 减小上游压力，避免触发频率限制
 *   - 让用户能"逐张看效果再决定继续"
 *   - 失败也不会一下子丢一片
 */
const CONCURRENCY = 1;
const DEFAULT_RETRY_LIMIT = 3;

/** 单个项目当前是否有调度器在跑（内存级 lock，避免重入） */
const runningProjects = new Set<string>();

/**
 * 提交"批量生成"：为每个 plan 创建 imagesPerPlan 张 queued 行（已存在的不重复）
 */
export async function submitProjectGeneration(opts: {
  projectId: string;
  /** null 时为每个 plan 补足；否则只为指定 plan 补足 */
  planId?: string | null;
  /** 仅为没有任何候选的 plan 补足（true）；false = 在已有基础上追加 */
  fillOnlyMissing?: boolean;
}) {
  const { projectId, planId, fillOnlyMissing = true } = opts;
  const project = await prisma.ecomProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("项目不存在");
  const imagesPerPlan = project.imagesPerPlan ?? 2;

  const plans = await prisma.ecomImagePlan.findMany({
    where: planId ? { id: planId, projectId } : { projectId },
    orderBy: { orderIdx: "asc" },
  });

  let inserted = 0;
  for (const plan of plans) {
    const existing = await prisma.ecomGeneratedImage.findMany({
      where: { planId: plan.id },
      orderBy: { candidateIdx: "desc" },
      select: { candidateIdx: true, status: true },
    });
    const liveCount = existing.filter((e) => e.status !== "failed").length;
    const need = fillOnlyMissing ? Math.max(0, imagesPerPlan - liveCount) : imagesPerPlan;
    let nextIdx = (existing[0]?.candidateIdx ?? 0) + 1;
    for (let i = 0; i < need; i++) {
      await prisma.ecomGeneratedImage.create({
        data: {
          projectId,
          planId: plan.id,
          candidateIdx: nextIdx++,
          status: "queued",
          progress: 0,
          runCount: 0,
        },
      });
      inserted++;
    }
  }

  return { inserted };
}

/**
 * 提交"单候选追加"或"单候选重试"
 *   - newCandidate=true：新建一行 queued
 *   - newCandidate=false 且指定 generatedImageId：把该行改回 queued（重试）
 */
export async function submitSingleGeneration(opts: {
  projectId: string;
  planId: string;
  generatedImageId?: string;
}) {
  const { projectId, planId, generatedImageId } = opts;
  if (generatedImageId) {
    const row = await prisma.ecomGeneratedImage.findUnique({ where: { id: generatedImageId } });
    if (!row || row.projectId !== projectId || row.planId !== planId) {
      throw new Error("候选图不存在");
    }
    await prisma.ecomGeneratedImage.update({
      where: { id: row.id },
      data: { status: "queued", progress: 0, errorMessage: null },
    });
    return { generatedImageId: row.id };
  }
  // 新增候选
  const last = await prisma.ecomGeneratedImage.findFirst({
    where: { planId },
    orderBy: { candidateIdx: "desc" },
    select: { candidateIdx: true },
  });
  const created = await prisma.ecomGeneratedImage.create({
    data: {
      projectId,
      planId,
      candidateIdx: (last?.candidateIdx ?? 0) + 1,
      status: "queued",
      progress: 0,
      runCount: 0,
    },
  });
  return { generatedImageId: created.id };
}

/**
 * 启动项目级调度器（fire-and-forget 入口）。
 * 同一项目同时只有一个调度器在跑（内存 lock）；调度器会一直工作到队列空。
 */
export function ensureProjectQueueRunning(opts: {
  projectId: string;
  userId: string;
}) {
  const { projectId } = opts;
  if (runningProjects.has(projectId)) return;
  runningProjects.add(projectId);

  // 异步执行，不 await
  void runProjectQueue(opts).finally(() => {
    runningProjects.delete(projectId);
  });
}

/** 项目级调度器主循环 */
async function runProjectQueue(opts: { projectId: string; userId: string }) {
  const { projectId, userId } = opts;

  // 取用户的重试上限
  const config = await prisma.ecomAutoConfig.findUnique({
    where: { userId },
  });
  const retryLimit = config?.retryImageGen ?? DEFAULT_RETRY_LIMIT;

  // 标记节点 07 为 running（如果还不是）
  await prisma.ecomProjectNode
    .update({
      where: { projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.IMAGE_GENERATION } },
      data: {
        status: NODE_STATUS.RUNNING,
        startedAt: new Date(),
        runStageText: "正在批量生成图片…",
      },
    })
    .catch(() => {});
  await prisma.ecomProject
    .update({
      where: { id: projectId },
      data: { status: PROJECT_STATUS.RUNNING, currentNode: NODE_KEYS.IMAGE_GENERATION },
    })
    .catch(() => {});

  while (true) {
    // 拉一批待处理（queued）
    const queued = await prisma.ecomGeneratedImage.findMany({
      where: { projectId, status: "queued" },
      orderBy: { createdAt: "asc" },
      take: CONCURRENCY,
    });
    if (queued.length === 0) break;

    // 全部置 running
    await prisma.ecomGeneratedImage.updateMany({
      where: { id: { in: queued.map((q) => q.id) } },
      data: { status: "running", progress: 5, startedAt: new Date() },
    });

    // 并发执行
    await Promise.all(
      queued.map((row) => processOne({ row, userId, retryLimit })),
    );
  }

  // 所有任务结束 → 更新节点 output + 状态
  await finalizeNodeStatus(projectId);
}

interface ProcessOneArgs {
  row: { id: string; planId: string; runCount: number };
  userId: string;
  retryLimit: number;
}

async function processOne({ row, userId, retryLimit }: ProcessOneArgs) {
  // 拉 plan + project 上下文
  const plan = await prisma.ecomImagePlan.findUnique({
    where: { id: row.planId },
    include: { project: true },
  });
  if (!plan) {
    await markFailed(row.id, "plan 不存在", retryLimit);
    return;
  }
  if (!plan.prompt) {
    await markFailed(row.id, "提示词为空，请先在节点 06 生成", retryLimit);
    return;
  }
  const project = plan.project;
  if (!project.imageModelSlug) {
    await markFailed(row.id, "未选择生图模型，请回到节点 05", retryLimit);
    return;
  }

  // 解析 referenceIds → 真 URL
  const refIds =
    safeParseJson<Array<{ type: "source" | "generated"; id: string }>>(plan.referenceIds, []) ?? [];
  const referenceImageUrls: string[] = [];
  if (refIds.length > 0) {
    const sources = refIds.filter((r) => r.type === "source").map((r) => r.id);
    const generated = refIds.filter((r) => r.type === "generated").map((r) => r.id);
    if (sources.length) {
      const rows = await prisma.ecomSourceImage.findMany({
        where: { id: { in: sources } },
        select: { url: true },
      });
      referenceImageUrls.push(...rows.map((r) => r.url));
    }
    if (generated.length) {
      const rows = await prisma.ecomGeneratedImage.findMany({
        where: { id: { in: generated } },
        select: { url: true },
      });
      referenceImageUrls.push(...rows.filter((r) => r.url).map((r) => r.url!));
    }
  }

  // 调上游
  await prisma.ecomGeneratedImage.update({
    where: { id: row.id },
    data: {
      progress: 30,
      runCount: { increment: 1 },
      promptSnapshot: plan.prompt.slice(0, 4000),
      modelSlugSnapshot: project.imageModelSlug,
    },
  });

  try {
    console.log(
      `[ecom-image] generate plan=${plan.id} title="${plan.title}" model=${project.imageModelSlug} ` +
        `ratio=${plan.aspectRatio} refs=${referenceImageUrls.length} ` +
        `(${referenceImageUrls.slice(0, 2).map((u) => u.slice(0, 60)).join(", ")}${referenceImageUrls.length > 2 ? ", ..." : ""})`,
    );
    const r = await generateOneImage({
      userId,
      modelSlug: project.imageModelSlug,
      prompt: plan.prompt,
      aspectRatio: plan.aspectRatio,
      referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
      metaTag: "ecom-image:image_generation",
      saveAs: { projectId: project.id, label: plan.title },
    });
    await prisma.ecomGeneratedImage.update({
      where: { id: row.id },
      data: {
        status: "done",
        progress: 100,
        url: r.url,
        cost: r.cost,
        realCost: r.realCost,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
    // 累计项目消耗
    await prisma.ecomProject
      .update({
        where: { id: project.id },
        data: { totalCost: { increment: r.cost } },
      })
      .catch(() => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(row.id, msg, retryLimit);
  }
}

async function markFailed(rowId: string, errorMessage: string, retryLimit: number) {
  const row = await prisma.ecomGeneratedImage.findUnique({ where: { id: rowId } });
  if (!row) return;

  // 还能重试 → 重置为 queued（调度器下一轮捞起）
  if (row.runCount < retryLimit) {
    await prisma.ecomGeneratedImage.update({
      where: { id: rowId },
      data: {
        status: "queued",
        progress: 0,
        errorMessage: errorMessage.slice(0, 800),
      },
    });
    return;
  }
  // 超限 → 标 failed
  await prisma.ecomGeneratedImage.update({
    where: { id: rowId },
    data: {
      status: "failed",
      progress: 0,
      errorMessage: errorMessage.slice(0, 800),
      finishedAt: new Date(),
    },
  });
}

async function finalizeNodeStatus(projectId: string) {
  const stats = await prisma.ecomGeneratedImage.groupBy({
    by: ["status"],
    where: { projectId },
    _count: true,
  });
  const totalCandidates = stats.reduce((s, x) => s + x._count, 0);
  const statusCounts: Record<string, number> = {};
  for (const s of stats) statusCounts[s.status] = s._count;
  const doneCandidates = statusCounts.done ?? 0;
  const failedCandidates = statusCounts.failed ?? 0;
  const stillRunning = (statusCounts.queued ?? 0) + (statusCounts.running ?? 0);

  // 检查是否所有 plan 都至少有 1 张 done
  const totalPlans = await prisma.ecomImagePlan.count({ where: { projectId } });
  const plansWithDone = await prisma.ecomImagePlan.count({
    where: { projectId, generatedImages: { some: { status: "done" } } },
  });
  const allCompleted = stillRunning === 0 && plansWithDone === totalPlans && totalPlans > 0;
  const pickedCandidates = await prisma.ecomGeneratedImage.count({
    where: { projectId, picked: true },
  });

  const output = ImageGenerationOutputSchema.parse({
    totalPlans,
    totalCandidates,
    doneCandidates,
    failedCandidates,
    pickedCandidates,
    allCompleted,
  });

  await prisma.ecomProjectNode
    .update({
      where: { projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.IMAGE_GENERATION } },
      data: {
        output: JSON.stringify(output),
        status: stillRunning > 0 ? NODE_STATUS.RUNNING : NODE_STATUS.AWAITING_REVIEW,
        progress: totalCandidates > 0 ? Math.round((doneCandidates * 100) / totalCandidates) : 0,
        runStage: stillRunning > 0 ? "渲染" : "完成",
        runStageText: stillRunning > 0 ? `已生成 ${doneCandidates}/${totalCandidates}` : null,
      },
    })
    .catch(() => {});
  if (stillRunning === 0) {
    await prisma.ecomProject
      .update({
        where: { id: projectId },
        data: { status: PROJECT_STATUS.AWAITING_USER },
      })
      .catch(() => {});
  }
}
