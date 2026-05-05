/**
 * AI 漫剧 · S2.0 — 工作流引擎
 *
 * 暴露：
 *   - createProject     创建项目（写所有 step pending + 校验余额 + 落 autoPolicy）
 *   - runOneStep        执行下一个/指定的 step（同步等待，"逐步确认"用）
 *   - skipOneStep       跳过单步（仅 canSkip）
 *   - runProjectAuto    后台 runner 跑完所有"勾选了的"未完成 step
 *
 * 策略：
 *   - mode=step：runner 内部不重试（policy.retry 仍生效，但用默认值），用户负责重跑
 *   - mode=auto：循环跑勾选项，遇到未勾选的步骤停下来等用户手动点"执行下一步"
 *   - 任意步骤抛错 → 标 failed → 项目暂停（status=failed），用户可重跑该步
 */

import { prisma } from "@/lib/db";
import {
  STEPS,
  STEP_BY_KEY,
  calcProjectProgress,
  nextStepKey,
  stepIndex,
  normalizeAutoPolicy,
  DEFAULT_AUTO_POLICY,
  type AutoRunPolicy,
} from "./steps";
import { RUNNERS } from "./runners";
import type { StepRunContext, StepRunResult } from "./types";
import { estimateProjectCost } from "./helpers";
import { getUserComicPipeline } from "@/lib/comic-pipeline";
import { pickChannel } from "@/lib/channels";

export type CreateProjectInput = {
  userId: string;
  initialPrompt: string;
  title?: string;
  mode?: "step" | "auto";
  resolution?: string;
  aspectRatio?: string;
  speedTier?: string;
  style?: string | null;
  language?: string;
  autoPolicy?: Partial<AutoRunPolicy> | null;
};

export async function createProject(input: CreateProjectInput) {
  const prompt = input.initialPrompt.trim();
  if (prompt.length < 6) throw new Error("故事描述太短，至少 6 个字");
  if (prompt.length > 2000) throw new Error("故事描述过长（≤2000 字）");

  const pipeline = await getUserComicPipeline(input.userId);

  // 校验：4 个模型必须都存在 + 至少一条可用渠道，否则提前失败
  await ensurePipelineUsable(pipeline);

  const est = await estimateProjectCost({
    llmSlug: pipeline.llmSlug,
    imageSlug: pipeline.imageSlug,
    videoSlug: pipeline.videoSlug,
  });

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new Error("用户不存在");
  if (user.balance < est.total) {
    throw new Error(
      `余额不足：本次预计 ¥${est.total.toFixed(2)}（含 LLM/图像/视频/合成），当前 ¥${user.balance.toFixed(2)}`,
    );
  }

  const policy = normalizeAutoPolicy(input.autoPolicy);

  const title = (input.title || prompt).trim().slice(0, 30) || "未命名漫剧";
  const project = await prisma.comicProject.create({
    data: {
      userId: input.userId,
      title,
      initialPrompt: prompt,
      mode: input.mode === "step" ? "step" : "auto",
      status: "draft",
      currentStep: STEPS[0].key,
      progress: 0,
      resolution: input.resolution || "480P",
      aspectRatio: input.aspectRatio || "16:9",
      speedTier: input.speedTier || "fast",
      style: input.style ?? null,
      language: input.language || "zh",
      llmSlug: pipeline.llmSlug,
      imageSlug: pipeline.imageSlug,
      videoSlug: pipeline.videoSlug,
      ttsSlug: pipeline.ttsSlug,
      estimatedCost: est.total,
      autoPolicy: JSON.stringify(policy),
    },
  });

  await prisma.comicProjectStep.createMany({
    data: STEPS.map((s, i) => ({
      projectId: project.id,
      stepKey: s.key,
      stepIndex: i,
      status: "pending",
    })),
  });

  return { project, estimate: est, policy };
}

/* ================================================================
 * 加载已完成 step 的产物 → prior map
 * ================================================================ */
async function loadPrior(projectId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.comicProjectStep.findMany({
    where: { projectId, status: "succeeded" },
  });
  const map: Record<string, unknown> = {};
  for (const r of rows) {
    if (!r.output) continue;
    try {
      map[r.stepKey] = JSON.parse(r.output);
    } catch {
      // ignore
    }
  }
  return map;
}

async function pickNextStepKey(projectId: string): Promise<string | null> {
  const rows = await prisma.comicProjectStep.findMany({
    where: { projectId },
    orderBy: { stepIndex: "asc" },
  });
  for (const r of rows) {
    if (r.status === "succeeded" || r.status === "skipped") continue;
    return r.stepKey;
  }
  return null;
}

async function loadProjectPolicy(projectId: string): Promise<AutoRunPolicy> {
  const p = await prisma.comicProject.findUnique({
    where: { id: projectId },
    select: { autoPolicy: true },
  });
  if (!p?.autoPolicy) return { ...DEFAULT_AUTO_POLICY, steps: { ...DEFAULT_AUTO_POLICY.steps } };
  try {
    return normalizeAutoPolicy(JSON.parse(p.autoPolicy));
  } catch {
    return { ...DEFAULT_AUTO_POLICY, steps: { ...DEFAULT_AUTO_POLICY.steps } };
  }
}

/* ================================================================
 * 执行单步
 * ================================================================ */
export async function runOneStep(opts: {
  userId: string;
  projectId: string;
  stepKey?: string;
}): Promise<{ stepKey: string; result: StepRunResult }> {
  const project = await prisma.comicProject.findUnique({
    where: { id: opts.projectId },
  });
  if (!project) throw new Error("项目不存在");
  if (project.userId !== opts.userId) throw new Error("无权访问该项目");
  if (project.status === "completed") throw new Error("项目已完成");

  const stepKey = opts.stepKey || (await pickNextStepKey(opts.projectId));
  if (!stepKey) throw new Error("没有可执行的步骤");
  const def = STEP_BY_KEY[stepKey];
  if (!def) throw new Error(`未知步骤：${stepKey}`);

  for (const dep of def.depends) {
    const depRow = await prisma.comicProjectStep.findUnique({
      where: { projectId_stepKey: { projectId: opts.projectId, stepKey: dep } },
    });
    if (!depRow || (depRow.status !== "succeeded" && depRow.status !== "skipped")) {
      throw new Error(`依赖步骤 ${dep} 尚未完成`);
    }
  }

  await prisma.comicProjectStep.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey } },
    data: { status: "running", startedAt: new Date(), errorMessage: null, progress: 10 },
  });
  await prisma.comicProject.update({
    where: { id: opts.projectId },
    data: { status: "running", currentStep: stepKey },
  });

  const policy = await loadProjectPolicy(opts.projectId);
  const ctx: StepRunContext = {
    userId: opts.userId,
    projectId: opts.projectId,
    project: {
      id: project.id,
      title: project.title,
      initialPrompt: project.initialPrompt,
      style: project.style,
      visualStyle: project.visualStyle,
      language: project.language,
      resolution: project.resolution,
      aspectRatio: project.aspectRatio,
      speedTier: project.speedTier,
      llmSlug: project.llmSlug,
      imageSlug: project.imageSlug,
      videoSlug: project.videoSlug,
      ttsSlug: project.ttsSlug,
    },
    prior: await loadPrior(opts.projectId),
    policy,
  };

  const runner = RUNNERS[stepKey];
  if (!runner) throw new Error(`未实现的 runner：${stepKey}`);

  let result: StepRunResult;
  try {
    result = await withRetry(def.kind, policy, () => runner(ctx));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.comicProjectStep.update({
      where: { projectId_stepKey: { projectId: opts.projectId, stepKey } },
      data: {
        status: "failed",
        errorMessage: msg,
        finishedAt: new Date(),
        progress: 0,
      },
    });
    await prisma.comicProject.update({
      where: { id: opts.projectId },
      data: { status: "failed", errorMessage: `[${stepKey}] ${msg}` },
    });
    throw e;
  }

  await prisma.comicProjectStep.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey } },
    data: {
      status: "succeeded",
      progress: 100,
      output: JSON.stringify(result.output),
      artifacts: result.artifacts ? JSON.stringify(result.artifacts) : null,
      modelSlug: result.modelSlug,
      channelId: result.channelId,
      externalId: result.externalId,
      cost: result.cost,
      realCost: result.realCost,
      finishedAt: new Date(),
    },
  });

  const succeededRows = await prisma.comicProjectStep.findMany({
    where: { projectId: opts.projectId, status: { in: ["succeeded", "skipped"] } },
    select: { stepKey: true, status: true, cost: true },
  });
  const succeededKeys = succeededRows.map((r) => r.stepKey);
  const totalCost = succeededRows.reduce((s, r) => s + (r.cost || 0), 0);
  const next = nextStepKey(stepKey);
  const isLast = stepIndex(stepKey) === STEPS.length - 1;
  await prisma.comicProject.update({
    where: { id: opts.projectId },
    data: {
      progress: calcProjectProgress(succeededKeys),
      totalCost: +totalCost.toFixed(4),
      currentStep: next,
      status: isLast ? "completed" : "running",
    },
  });

  return { stepKey, result };
}

/**
 * 顶层重试：仅对 "可重试的瞬时错误" 起作用。
 * 注意：runner 内部已经做了"逐张/逐镜"级别的重试；这里只是兜底，
 *       例如 runner 在准备阶段就报错（依赖网络抖动），整个 runner 重跑一次。
 */
async function withRetry<T>(
  kind: "llm" | "image" | "video" | "compose",
  policy: AutoRunPolicy,
  fn: () => Promise<T>,
): Promise<T> {
  let topRetry = 1;
  if (kind === "llm") topRetry = Math.max(1, Math.min(3, Math.ceil(policy.retry.chat / 3)));
  if (kind === "image") topRetry = 1; // runner 自己已逐张重试，顶层不再放大
  if (kind === "video") topRetry = 1;
  if (kind === "compose") topRetry = 2;

  let lastErr: unknown;
  for (let i = 0; i < topRetry; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === topRetry - 1) break;
      // 简单退避
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/* ================================================================
 * 跳过单步
 * ================================================================ */
export async function skipOneStep(opts: { userId: string; projectId: string; stepKey: string }) {
  const project = await prisma.comicProject.findUnique({ where: { id: opts.projectId } });
  if (!project || project.userId !== opts.userId) throw new Error("无权访问");
  const def = STEP_BY_KEY[opts.stepKey];
  if (!def) throw new Error("未知步骤");
  if (!def.canSkip) throw new Error(`步骤「${def.title}」不可跳过`);

  await prisma.comicProjectStep.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey: opts.stepKey } },
    data: { status: "skipped", finishedAt: new Date(), progress: 100 },
  });
  const next = nextStepKey(opts.stepKey);
  const succeededRows = await prisma.comicProjectStep.findMany({
    where: { projectId: opts.projectId, status: { in: ["succeeded", "skipped"] } },
    select: { stepKey: true },
  });
  await prisma.comicProject.update({
    where: { id: opts.projectId },
    data: {
      currentStep: next,
      progress: calcProjectProgress(succeededRows.map((r) => r.stepKey)),
    },
  });
  return { skipped: opts.stepKey, next };
}

/* ================================================================
 * 智能托管：后台跑完所有"勾选 + 未完成"的 step
 *
 * - 幂等：同一 projectId 已在跑则直接返回
 * - 遇到 policy.steps[k]=false 的步骤会停下，等待用户手动 run
 * - 任意步骤失败：循环结束，project.status=failed，前端可重跑
 * ================================================================ */
const RUNNING_PROJECTS = new Set<string>();

export async function runProjectAuto(opts: {
  userId: string;
  projectId: string;
  /// 可选：本次托管的覆盖策略；若提供，会先 upsert 到 project.autoPolicy
  policy?: Partial<AutoRunPolicy> | null;
}) {
  if (RUNNING_PROJECTS.has(opts.projectId)) {
    return { started: false, reason: "already_running" as const };
  }
  const project = await prisma.comicProject.findUnique({ where: { id: opts.projectId } });
  if (!project) throw new Error("项目不存在");
  if (project.userId !== opts.userId) throw new Error("无权访问");
  if (project.status === "completed") return { started: false, reason: "completed" as const };

  if (opts.policy) {
    const merged = normalizeAutoPolicy({
      ...(project.autoPolicy ? safeParse(project.autoPolicy) : {}),
      ...opts.policy,
    });
    await prisma.comicProject.update({
      where: { id: opts.projectId },
      data: { autoPolicy: JSON.stringify(merged) },
    });
  }

  RUNNING_PROJECTS.add(opts.projectId);

  (async () => {
    try {
      while (true) {
        const next = await pickNextStepKey(opts.projectId);
        if (!next) break;
        const policy = await loadProjectPolicy(opts.projectId);
        if (policy.steps[next] === false) {
          // 用户没勾选这一步 —— 停下来等手动确认
          break;
        }
        try {
          await runOneStep({ userId: opts.userId, projectId: opts.projectId, stepKey: next });
        } catch (e) {
          console.error(`[comic-agent] auto run step ${next} failed:`, e);
          break;
        }
      }
    } finally {
      RUNNING_PROJECTS.delete(opts.projectId);
    }
  })();

  return { started: true as const };
}

export function isProjectRunning(projectId: string): boolean {
  return RUNNING_PROJECTS.has(projectId);
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/**
 * 验证管线 4 个 slug 都存在 + 至少一条可用渠道。
 * 在创建项目时调用，避免跑到一半某步因为"模型不存在/没有渠道"才崩。
 */
async function ensurePipelineUsable(p: {
  llmSlug: string;
  imageSlug: string;
  videoSlug: string;
  ttsSlug: string;
}) {
  const checks: { slug: string; expectType: string; label: string }[] = [
    { slug: p.llmSlug, expectType: "chat", label: "LLM" },
    { slug: p.imageSlug, expectType: "image", label: "图像" },
    { slug: p.videoSlug, expectType: "video", label: "视频" },
    // ttsSlug 仅"视频合成"步用到，且当前是软合成不强依赖。先不强制检查。
  ];
  for (const c of checks) {
    const m = await prisma.model.findUnique({
      where: { slug: c.slug },
      select: { id: true, type: true, enabled: true },
    });
    if (!m) {
      throw new Error(
        `管线配置的${c.label}模型「${c.slug}」不存在。请到 /admin 设置「解说漫剧管线」。`,
      );
    }
    if (!m.enabled || m.type !== c.expectType) {
      throw new Error(`管线${c.label}模型「${c.slug}」类型不匹配或已禁用`);
    }
    const ch = await pickChannel(m.id, null);
    if (!ch) {
      throw new Error(
        `管线${c.label}模型「${c.slug}」没有可用渠道。请到 /admin 给它配置渠道。`,
      );
    }
  }
}
