/**
 * AI 漫剧 · S3.0 — 用户交互动作
 *
 * 这些函数在 step.status === "awaiting_user" 时被 API 路由调用。
 * 都需要 ownership 校验，且仅允许在合法状态下操作（避免并发）。
 */

import { prisma } from "@/lib/db";
import { STEP_BY_KEY_V3, calcProjectProgressV3, nextStepKeyV3 } from "./steps";
import { commitStepOutputV3, runOneStepV3 } from "./engine";
import type { Candidate } from "./schemas";
import { safeParseJson } from "./schemas";

/**
 * 通用 step 拉取 + ownership 校验
 */
async function loadStep(opts: { userId: string; projectId: string; stepKey: string }) {
  const project = await prisma.comicProjectV3.findUnique({
    where: { id: opts.projectId },
    select: { userId: true, status: true },
  });
  if (!project) throw new Error("项目不存在");
  if (project.userId !== opts.userId) throw new Error("无权访问");

  const step = await prisma.comicStepV3.findUnique({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey: opts.stepKey } },
  });
  if (!step) throw new Error("步骤不存在");
  return { project, step };
}

/* ============================================================
 * pickCandidate — 用户从 candidates 里选了某一个
 *
 * 仅写 pickedCandidateId，不落定 output。
 * 用户后续可继续 edit，也可调 retry，也可调 confirm。
 * ============================================================ */
export async function pickCandidate(opts: {
  userId: string;
  projectId: string;
  stepKey: string;
  candidateId: string;
}) {
  const { step } = await loadStep(opts);
  if (step.status !== "awaiting_user") {
    throw new Error("该步骤当前不在待确认状态");
  }
  const cands = safeParseJson<Candidate[]>(step.candidates) || [];
  if (!cands.find((c) => c.id === opts.candidateId)) {
    throw new Error(`候选 ${opts.candidateId} 不存在`);
  }
  // 切换 picked 时清空 userEdits（不同候选的字段结构可能不同）
  await prisma.comicStepV3.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey: opts.stepKey } },
    data: { pickedCandidateId: opts.candidateId, userEdits: null },
  });
  return { pickedCandidateId: opts.candidateId };
}

/* ============================================================
 * editPicked — 用户对所选候选做字段级修改（patch）
 *
 * patch 是一个 partial 对象，会在 confirmStep 时浅合并到 candidate.data 上。
 * 多次 edit 会相互覆盖（只保留最后一次完整 patch；不做累积合并避免歧义）。
 * ============================================================ */
export async function editPicked(opts: {
  userId: string;
  projectId: string;
  stepKey: string;
  patch: Record<string, unknown>;
}) {
  const { step } = await loadStep(opts);
  if (step.status !== "awaiting_user") {
    throw new Error("该步骤当前不在待确认状态");
  }
  if (!step.pickedCandidateId) {
    throw new Error("尚未选择候选，无法编辑");
  }
  if (typeof opts.patch !== "object" || opts.patch === null) {
    throw new Error("patch 必须是对象");
  }
  await prisma.comicStepV3.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey: opts.stepKey } },
    data: { userEdits: JSON.stringify(opts.patch) },
  });
  return { patched: true };
}

/* ============================================================
 * confirmStep — 用户确认本步，落定 output 并推进流水线
 *
 * 不会自动跑下一步（避免锁定式连续触发 LLM）。前端 confirm 后可立即
 * 调 runOneStepV3({ stepKey: next }) 或 runProjectAutoV3 继续。
 * ============================================================ */
export async function confirmStep(opts: {
  userId: string;
  projectId: string;
  stepKey: string;
}) {
  const { step } = await loadStep(opts);
  if (step.status !== "awaiting_user") {
    throw new Error("该步骤当前不在待确认状态");
  }
  if (!step.pickedCandidateId) {
    throw new Error("尚未选择候选");
  }
  await commitStepOutputV3({
    projectId: opts.projectId,
    stepKey: opts.stepKey,
    pickedCandidateId: step.pickedCandidateId,
  });
  return { ok: true, nextStep: nextStepKeyV3(opts.stepKey) };
}

/* ============================================================
 * skipStep — 跳过单步（仅 canSkip 步骤）
 * ============================================================ */
export async function skipStep(opts: {
  userId: string;
  projectId: string;
  stepKey: string;
}) {
  const def = STEP_BY_KEY_V3[opts.stepKey];
  if (!def) throw new Error("未知步骤");
  if (!def.canSkip) throw new Error(`步骤「${def.title}」不可跳过`);

  const { step } = await loadStep(opts);
  if (step.status === "succeeded" || step.status === "skipped") {
    throw new Error("该步骤已完成，无法跳过");
  }

  await prisma.comicStepV3.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey: opts.stepKey } },
    data: {
      status: "skipped",
      progress: 100,
      finishedAt: new Date(),
    },
  });

  const succeededRows = await prisma.comicStepV3.findMany({
    where: { projectId: opts.projectId, status: { in: ["succeeded", "skipped"] } },
    select: { stepKey: true },
  });
  await prisma.comicProjectV3.update({
    where: { id: opts.projectId },
    data: {
      currentStep: nextStepKeyV3(opts.stepKey),
      progress: calcProjectProgressV3(succeededRows.map((r) => r.stepKey)),
      status: "running",
    },
  });

  return { skipped: opts.stepKey, nextStep: nextStepKeyV3(opts.stepKey) };
}

/* ============================================================
 * retryStep — 用户对当前 awaiting_user 或 failed 步骤重跑
 *
 * 复用 runOneStepV3({ isRetry: true })：会清空 candidates / picked / edits / output
 * 然后重新执行 runner。计费会再次发生（重跑会真扣费）。
 * ============================================================ */
export async function retryStep(opts: {
  userId: string;
  projectId: string;
  stepKey: string;
}) {
  const { step } = await loadStep(opts);
  if (step.status !== "awaiting_user" && step.status !== "failed") {
    throw new Error("仅可重跑当前待确认或失败的步骤");
  }
  return runOneStepV3({
    userId: opts.userId,
    projectId: opts.projectId,
    stepKey: opts.stepKey,
    isRetry: true,
  });
}
