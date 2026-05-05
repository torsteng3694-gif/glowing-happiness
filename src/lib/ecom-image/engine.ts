/**
 * 电商一键出图 · 真实引擎（阶段 1）
 *
 * 实现节点状态机 + DB 事务，调用各节点 runners 完成真实 LLM 工作。
 *
 * 阶段 1 范围：
 *   - 节点 01-03 接真实 vision LLM
 *   - 节点 04-07 仍走 mock-engine 的实现（保留）
 *
 * 与 mock-engine 区别：
 *   - run 是真异步：调 LLM + 写产物 + 改状态
 *   - reject 不立刻自动 run（避免误触发昂贵调用）；用户需要手动再点 run
 *   - confirm 时不自动 run 下一节点（避免昂贵调用）；下一节点设为 pending，用户主动 run
 */

import { prisma } from "@/lib/db";
import {
  NODE_KEYS,
  NODE_ORDER,
  NODE_STATUS,
  PROJECT_STATUS,
  type NodeKey,
} from "./nodes";
import { runProductAnalysis } from "./runners/product-analysis";
import { runImageAnalysis } from "./runners/image-analysis";
import { runSupplementInfo } from "./runners/supplement-info";
import { runPlanCreation } from "./runners/plan-creation";
import { runModelSelection } from "./runners/model-selection";
import { runPromptGeneration } from "./runners/prompt-generation";
import {
  ensureProjectQueueRunning,
  submitProjectGeneration,
} from "./runners/image-generation";

// ============================================================
// run：调度节点对应的 runner
// ============================================================

export interface RunNodeOpts {
  projectId: string;
  userId: string;
  nodeKey: NodeKey;
  /** 用户在 UI 上指定的视觉模型 slug（节点 01/03 用） */
  modelSlug?: string;
  /** 单图重新分析时的 sourceImageId（仅节点 03 单图重生用） */
  sourceImageId?: string;
}

export async function runNode(opts: RunNodeOpts): Promise<void> {
  const { projectId, userId, nodeKey, modelSlug, sourceImageId } = opts;

  // 1. 取节点行 + 校验状态
  const node = await prisma.ecomProjectNode.findUnique({
    where: { projectId_nodeKey: { projectId, nodeKey } },
  });
  if (!node) throw new Error(`节点 ${nodeKey} 不存在`);
  if (node.status === NODE_STATUS.RUNNING) {
    throw new Error("节点正在运行中，请稍候");
  }

  // 2. 标记 running
  await prisma.ecomProjectNode.update({
    where: { id: node.id },
    data: {
      status: NODE_STATUS.RUNNING,
      progress: 0,
      runStage: null,
      runStageText: "正在调度…",
      errorMessage: null,
      startedAt: node.startedAt ?? new Date(),
      runCount: { increment: 1 },
      usedModelSlug: modelSlug ?? node.usedModelSlug,
    },
  });
  await prisma.ecomProject.update({
    where: { id: projectId },
    data: { status: PROJECT_STATUS.RUNNING, currentNode: nodeKey },
  });

  try {
    // 3. 调对应 runner
    if (nodeKey === NODE_KEYS.PRODUCT_ANALYSIS) {
      if (!modelSlug) throw new Error("请先选择视觉模型");
      await runProductAnalysis({ projectId, userId, modelSlug, feedback: node.feedback });
    } else if (nodeKey === NODE_KEYS.SUPPLEMENT_INFO) {
      await runSupplementInfo({ projectId });
    } else if (nodeKey === NODE_KEYS.IMAGE_ANALYSIS) {
      if (!modelSlug) throw new Error("请先选择视觉模型");
      await runImageAnalysis({
        projectId,
        userId,
        modelSlug,
        sourceImageId,
        feedback: node.feedback,
      });
    } else if (nodeKey === NODE_KEYS.PLAN_CREATION) {
      if (!modelSlug) throw new Error("请先选择视觉模型");
      await runPlanCreation({
        projectId,
        userId,
        modelSlug,
        feedback: node.feedback,
      });
    } else if (nodeKey === NODE_KEYS.MODEL_SELECTION) {
      // 不调 LLM，直接拉模型列表
      await runModelSelection({ projectId, feedback: node.feedback });
    } else if (nodeKey === NODE_KEYS.PROMPT_GENERATION) {
      if (!modelSlug) throw new Error("请先选择文本/视觉模型用于撰写提示词");
      await runPromptGeneration({
        projectId,
        userId,
        modelSlug,
        feedback: node.feedback,
      });
    } else if (nodeKey === NODE_KEYS.IMAGE_GENERATION) {
      // 节点 07：进入即 awaiting_review，不自动提交批量任务
      // 用户在 UI 上看到所有 plan 的"虚拟占位骨架"后，再主动点：
      //   - 单卡的"生成这张"
      //   - 顶部的"全部生成"
      // 提交动作走 /image-plans/[id]/generate 或 /generate-all（API 层）
      // 这里啥都不做，让 finally 里的 awaiting_review 标记生效
    } else {
      throw new Error(`阶段 3 暂不支持节点 ${nodeKey}`);
    }

    // 4. 标记 awaiting_review
    await prisma.ecomProjectNode.update({
      where: { id: node.id },
      data: {
        status: NODE_STATUS.AWAITING_REVIEW,
        progress: 100,
        runStage: "完成",
        runStageText: null,
      },
    });
    await prisma.ecomProject.update({
      where: { id: projectId },
      data: { status: PROJECT_STATUS.AWAITING_USER },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ecomProjectNode.update({
      where: { id: node.id },
      data: {
        status: NODE_STATUS.FAILED,
        runStageText: null,
        errorMessage: msg,
      },
    });
    await prisma.ecomProject.update({
      where: { id: projectId },
      data: { status: PROJECT_STATUS.FAILED },
    });
    throw e;
  }
}

// ============================================================
// confirm：当前节点确认 → 把下一节点设为 pending（不自动 run）
// ============================================================

export async function confirmNode(projectId: string, nodeKey: NodeKey) {
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
    await prisma.ecomProject.update({
      where: { id: projectId },
      data: { status: PROJECT_STATUS.COMPLETED, progress: 100 },
    });
    return { nextKey: null };
  }

  await prisma.ecomProject.update({
    where: { id: projectId },
    data: { status: PROJECT_STATUS.AWAITING_USER, currentNode: nextKey, progress },
  });
  return { nextKey };
}

// ============================================================
// reject：写入反馈，置 rejected（用户需手动再 run）
// ============================================================

export async function rejectNode(projectId: string, nodeKey: NodeKey, feedback: string) {
  await prisma.ecomProjectNode.update({
    where: { projectId_nodeKey: { projectId, nodeKey } },
    data: { status: NODE_STATUS.REJECTED, feedback },
  });
}

// ============================================================
// skip：仅可跳过节点（节点 02）
// ============================================================

export async function skipNode(projectId: string, nodeKey: NodeKey) {
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
      data: { status: PROJECT_STATUS.AWAITING_USER, currentNode: nextKey, progress },
    });
  }
  return { nextKey };
}

// ============================================================
// rollback：回退到上一节点
// ============================================================

export async function rollbackNode(projectId: string, fromNodeKey: NodeKey) {
  const node = await prisma.ecomProjectNode.findUnique({
    where: { projectId_nodeKey: { projectId, fromNodeKey } as never } as never,
  });
  // 上面 prisma 类型对 unique 复合键的约束比较严，再用一种写法兜底
  const nodeRow =
    node ??
    (await prisma.ecomProjectNode.findFirst({
      where: { projectId, nodeKey: fromNodeKey },
    }));
  if (!nodeRow) throw new Error(`节点 ${fromNodeKey} 不存在`);
  const prevKey = NODE_ORDER[nodeRow.nodeIndex - 1];
  if (!prevKey) throw new Error("已是首节点，无法回退");

  await prisma.$transaction([
    prisma.ecomProjectNode.update({
      where: { id: nodeRow.id },
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
