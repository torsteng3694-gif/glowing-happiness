/**
 * AI 漫剧 · S3.0 — 工作流执行引擎
 *
 * 职责：
 *   - createProjectV3      创建项目（写 10 个 step pending + 校验余额 + 落 policy）
 *   - runOneStepV3         执行单步（同步等待）
 *   - runProjectAutoV3     后台循环执行（直到遇到 awaiting_user 停下）
 *
 * 不在本文件：
 *   - pick / edit / confirm / skip / retry → interactive.ts
 *
 * 关键状态机（step.status）：
 *   pending → running → succeeded
 *                    → awaiting_user → succeeded（confirm 后）
 *                                   → running（retry 后）
 *                    → failed
 *                    → skipped
 */

import { prisma } from "@/lib/db";
import { pickChannel } from "@/lib/channels";
import { getUserComicPipeline } from "@/lib/comic-pipeline";
import {
  STEPS_V3,
  STEP_BY_KEY_V3,
  calcProjectProgressV3,
  nextStepKeyV3,
  stepIndexV3,
  shouldConfirm,
  normalizePolicyV3,
  DEFAULT_POLICY_V3,
  DEFAULT_EXTENSIONS,
  type ProjectMode,
  type PolicyV3,
  type Extensions,
} from "./steps";
import { RUNNERS_V3 } from "./runners";
import type { Candidate, RunnerResultV3 } from "./schemas";
import { safeParseJson } from "./schemas";
import { acquireProjectLock, isProjectLocked } from "./project-lock";
import { resolveImageSlugFromPreset, type ImagePresetSlug } from "./image-presets";

/* ============================================================
 * createProjectV3
 * ============================================================ */

export type CreateProjectV3Input = {
  userId: string;
  initialPrompt: string;
  title?: string;
  mode?: ProjectMode;
  resolution?: string;
  aspectRatio?: string;
  speedTier?: string;
  style?: string | null;
  visualStyle?: string | null;
  language?: string;
  /** 图像套餐 slug；为 null 或 "default" 时走全局默认管线 */
  imagePreset?: ImagePresetSlug | null;
  extensions?: Partial<Extensions> | null;
  policy?: Partial<PolicyV3> | null;
};

export async function createProjectV3(input: CreateProjectV3Input) {
  const prompt = input.initialPrompt.trim();
  if (prompt.length < 6) throw new Error("故事描述太短，至少 6 个字");
  if (prompt.length > 2000) throw new Error("故事描述过长（≤2000 字）");

  const pipeline = await getUserComicPipeline(input.userId);

  // 套餐覆盖：用户选了非 default 的套餐 → 用套餐指定的 imageSlug 覆盖项目快照
  const presetImageSlug = resolveImageSlugFromPreset(input.imagePreset);
  if (presetImageSlug) {
    pipeline.imageSlug = presetImageSlug;
  }

  await ensurePipelineUsable(pipeline);

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new Error("用户不存在");

  const policy = normalizePolicyV3(input.policy);
  const extensions: Extensions = { ...DEFAULT_EXTENSIONS, ...(input.extensions || {}) };

  // 预估总价（粗略：把所有 step.estUnits 当 token K 估算）
  const estimatedCost = await estimateProjectCostV3(pipeline);
  if (user.balance < estimatedCost) {
    throw new Error(
      `余额不足：本次预计 ¥${estimatedCost.toFixed(2)}，当前 ¥${user.balance.toFixed(2)}`,
    );
  }

  const title = (input.title || prompt).trim().slice(0, 30) || "未命名漫剧";
  const project = await prisma.comicProjectV3.create({
    data: {
      userId: input.userId,
      title,
      initialPrompt: prompt,
      mode: input.mode === "step" ? "step" : "auto",
      status: "draft",
      currentStep: STEPS_V3[0].key,
      progress: 0,
      resolution: input.resolution || "720P",
      aspectRatio: input.aspectRatio || "16:9",
      speedTier: input.speedTier || "balance",
      style: input.style ?? null,
      visualStyle: input.visualStyle ?? null,
      language: input.language || "zh",
      llmSlug: pipeline.llmSlug,
      imageSlug: pipeline.imageSlug,
      videoSlug: pipeline.videoSlug,
      ttsSlug: pipeline.ttsSlug,
      imagePreset: input.imagePreset || "default",
      extensions: JSON.stringify(extensions),
      policy: JSON.stringify(policy),
      estimatedCost,
    },
  });

  await prisma.comicStepV3.createMany({
    data: STEPS_V3.map((s, i) => ({
      projectId: project.id,
      stepKey: s.key,
      stepIndex: i,
      status: "pending" as const,
    })),
  });

  return { project, policy, extensions, estimatedCost };
}

/* ============================================================
 * 内部工具
 * ============================================================ */

export async function loadPriorV3(projectId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.comicStepV3.findMany({
    where: { projectId, status: { in: ["succeeded", "skipped"] } },
  });
  const map: Record<string, unknown> = {};
  for (const r of rows) {
    if (!r.output) continue;
    const parsed = safeParseJson(r.output);
    if (parsed != null) map[r.stepKey] = parsed;
  }
  return map;
}

async function pickNextStepKeyV3(projectId: string): Promise<string | null> {
  const rows = await prisma.comicStepV3.findMany({
    where: { projectId },
    orderBy: { stepIndex: "asc" },
  });
  for (const r of rows) {
    if (r.status === "succeeded" || r.status === "skipped") continue;
    return r.stepKey;
  }
  return null;
}

export async function loadProjectPolicyV3(projectId: string): Promise<PolicyV3> {
  const p = await prisma.comicProjectV3.findUnique({
    where: { id: projectId },
    select: { policy: true },
  });
  if (!p?.policy) {
    return {
      ...DEFAULT_POLICY_V3,
      steps: { ...DEFAULT_POLICY_V3.steps },
      retry: { ...DEFAULT_POLICY_V3.retry },
    };
  }
  const parsed = safeParseJson<Partial<PolicyV3>>(p.policy);
  return normalizePolicyV3(parsed);
}

export async function loadProjectExtensions(projectId: string): Promise<Extensions> {
  const p = await prisma.comicProjectV3.findUnique({
    where: { id: projectId },
    select: { extensions: true },
  });
  if (!p?.extensions) return { ...DEFAULT_EXTENSIONS };
  const parsed = safeParseJson<Extensions>(p.extensions);
  return { ...DEFAULT_EXTENSIONS, ...(parsed || {}) };
}

/**
 * 预估总价。粗略口径：
 *   - llm: 按 sum(estUnits of llm steps) × outputPrice / 1K
 *   - image: 按 estUnits 总和 × unitPrice
 *   - video: 按 estUnits（秒数估算） × unitPrice
 *   - compose: 视频时长 × unitPrice × 0.3（合成成本远低于生成）
 */
async function estimateProjectCostV3(pipeline: {
  llmSlug: string;
  imageSlug: string;
  videoSlug: string;
}): Promise<number> {
  const [llm, img, vid] = await Promise.all([
    prisma.model.findUnique({ where: { slug: pipeline.llmSlug } }),
    prisma.model.findUnique({ where: { slug: pipeline.imageSlug } }),
    prisma.model.findUnique({ where: { slug: pipeline.videoSlug } }),
  ]);

  let llmUnits = 0;
  let imgUnits = 0;
  let vidUnits = 0;
  let composeUnits = 0;

  for (const s of STEPS_V3) {
    if (s.kind === "llm") llmUnits += s.estUnits;
    else if (s.kind === "image") imgUnits += s.estUnits;
    else if (s.kind === "video") vidUnits += s.estUnits;
    else if (s.kind === "compose") composeUnits += s.estUnits;
  }

  const llmCost = (llm?.outputPrice ?? 0.01) * llmUnits;
  const imgCost = (img?.unitPrice ?? 0.5) * imgUnits;
  const vidCost = (vid?.unitPrice ?? 0.5) * vidUnits;
  const composeCost = (vid?.unitPrice ?? 0.5) * composeUnits * 0.3;

  return +(llmCost + imgCost + vidCost + composeCost).toFixed(2);
}

/* ============================================================
 * runOneStepV3 — 执行单步
 * ============================================================ */

export async function runOneStepV3(opts: {
  userId: string;
  projectId: string;
  stepKey?: string;
  /** retry 调用时为 true，会清空 candidates / pickedCandidateId / userEdits 重新跑 */
  isRetry?: boolean;
}): Promise<{ stepKey: string; status: "succeeded" | "awaiting_user"; result: RunnerResultV3 }> {
  const project = await prisma.comicProjectV3.findUnique({
    where: { id: opts.projectId },
  });
  if (!project) throw new Error("项目不存在");
  if (project.userId !== opts.userId) throw new Error("无权访问该项目");
  if (project.status === "completed") throw new Error("项目已完成");

  const stepKey = opts.stepKey || (await pickNextStepKeyV3(opts.projectId));
  if (!stepKey) throw new Error("没有可执行的步骤");
  const def = STEP_BY_KEY_V3[stepKey];
  if (!def) throw new Error(`未知步骤：${stepKey}`);

  // 校验依赖
  for (const dep of def.depends) {
    const depRow = await prisma.comicStepV3.findUnique({
      where: { projectId_stepKey: { projectId: opts.projectId, stepKey: dep } },
    });
    if (!depRow || (depRow.status !== "succeeded" && depRow.status !== "skipped")) {
      throw new Error(`依赖步骤 ${dep} 尚未完成`);
    }
  }

  // 标 running，清空可能的旧状态（重跑场景）
  await prisma.comicStepV3.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey } },
    data: {
      status: "running",
      progress: 10,
      errorMessage: null,
      startedAt: new Date(),
      ...(opts.isRetry
        ? {
            candidates: null,
            pickedCandidateId: null,
            userEdits: null,
            output: null,
            outputMd: null,
            artifacts: null,
            runCount: { increment: 1 },
          }
        : {}),
    },
  });
  await prisma.comicProjectV3.update({
    where: { id: opts.projectId },
    data: { status: "running", currentStep: stepKey },
  });

  const policy = await loadProjectPolicyV3(opts.projectId);
  const extensions = await loadProjectExtensions(opts.projectId);
  const ctx: StepRunContextV3 = {
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
      mode: project.mode === "step" ? "step" : "auto",
    },
    prior: await loadPriorV3(opts.projectId),
    policy,
    extensions,
  };

  const runner = RUNNERS_V3[stepKey];
  if (!runner) throw new Error(`未实现的 runner：${stepKey}`);

  let result: RunnerResultV3;
  try {
    result = await withRetryV3(def.kind, policy, () => runner(ctx));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.comicStepV3.update({
      where: { projectId_stepKey: { projectId: opts.projectId, stepKey } },
      data: {
        status: "failed",
        errorMessage: msg,
        finishedAt: new Date(),
        progress: 0,
      },
    });
    await prisma.comicProjectV3.update({
      where: { id: opts.projectId },
      data: { status: "failed", errorMessage: `[${stepKey}] ${msg}` },
    });
    throw e;
  }

  // 校验 runner 返回
  if (!Array.isArray(result.candidates) || result.candidates.length === 0) {
    throw new Error(`runner ${stepKey} 没有返回任何 candidate`);
  }

  // defaultPickedId 兜底：单候选直接取，多候选必须 runner 指定
  let defaultPicked = result.defaultPickedId;
  if (!defaultPicked) {
    if (result.candidates.length === 1) {
      defaultPicked = result.candidates[0].id;
    } else {
      defaultPicked = result.candidates[0].id; // 多候选无指定 → 取第一个兜底
    }
  } else if (!result.candidates.find((c) => c.id === defaultPicked)) {
    // runner 给了一个不存在的 id → 兜底取第一个
    defaultPicked = result.candidates[0].id;
  }

  const needsConfirm = shouldConfirm({
    mode: ctx.project.mode,
    stepDefault: def.defaultNeedsConfirm,
    runnerWants: result.needsConfirm,
  });

  // 写候选 + 计费信息
  await prisma.comicStepV3.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey } },
    data: {
      candidates: JSON.stringify(result.candidates),
      pickedCandidateId: defaultPicked,
      modelSlug: result.modelSlug,
      channelId: result.channelId,
      externalId: result.externalId,
      cost: result.cost,
      realCost: result.realCost,
      progress: needsConfirm ? 80 : 100,
    },
  });

  if (needsConfirm) {
    // 暂停等用户确认
    await prisma.comicStepV3.update({
      where: { projectId_stepKey: { projectId: opts.projectId, stepKey } },
      data: { status: "awaiting_user" },
    });
    await prisma.comicProjectV3.update({
      where: { id: opts.projectId },
      data: { status: "awaiting_user" },
    });
    return { stepKey, status: "awaiting_user", result };
  }

  // 不需要确认：直接落定 output
  await commitStepOutputV3({
    projectId: opts.projectId,
    stepKey,
    pickedCandidateId: defaultPicked,
  });

  return { stepKey, status: "succeeded", result };
}

/* ============================================================
 * commitStepOutputV3 — 落定一个 step 的最终 output
 *
 * 由两处调用：
 *   1. runOneStepV3 在 needsConfirm=false 时直接调
 *   2. interactive.confirmStep 在用户确认后调
 *
 * 行为：
 *   - 找 candidates[pickedCandidateId]
 *   - 合并 userEdits（如有）
 *   - 写 output / outputMd / artifacts
 *   - 标 succeeded
 *   - 推进 project.currentStep / progress / totalCost / status
 * ============================================================ */
export async function commitStepOutputV3(opts: {
  projectId: string;
  stepKey: string;
  pickedCandidateId: string;
}) {
  const step = await prisma.comicStepV3.findUnique({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey: opts.stepKey } },
  });
  if (!step) throw new Error("步骤不存在");
  if (!step.candidates) throw new Error("步骤无候选可落定");

  const cands = safeParseJson<Candidate[]>(step.candidates) || [];
  const picked = cands.find((c) => c.id === opts.pickedCandidateId);
  if (!picked) throw new Error(`候选 ${opts.pickedCandidateId} 不存在`);

  const edits = safeParseJson<Record<string, unknown>>(step.userEdits) || {};
  const merged =
    typeof picked.data === "object" && picked.data !== null
      ? { ...(picked.data as Record<string, unknown>), ...edits }
      : picked.data;

  await prisma.comicStepV3.update({
    where: { projectId_stepKey: { projectId: opts.projectId, stepKey: opts.stepKey } },
    data: {
      status: "succeeded",
      progress: 100,
      output: JSON.stringify(merged),
      outputMd: picked.mdSummary || null,
      artifacts: picked.artifacts ? JSON.stringify(picked.artifacts) : null,
      pickedCandidateId: opts.pickedCandidateId,
      finishedAt: new Date(),
    },
  });

  // 推进项目级状态
  const succeededRows = await prisma.comicStepV3.findMany({
    where: { projectId: opts.projectId, status: { in: ["succeeded", "skipped"] } },
    select: { stepKey: true, cost: true },
  });
  const totalCost = succeededRows.reduce((s, r) => s + (r.cost || 0), 0);
  const next = nextStepKeyV3(opts.stepKey);
  const isLast = stepIndexV3(opts.stepKey) === STEPS_V3.length - 1;
  await prisma.comicProjectV3.update({
    where: { id: opts.projectId },
    data: {
      progress: calcProjectProgressV3(succeededRows.map((r) => r.stepKey)),
      totalCost: +totalCost.toFixed(4),
      currentStep: next,
      status: isLast ? "completed" : "running",
    },
  });
}

/* ============================================================
 * 顶层重试 — runner 内部还会做更细粒度（逐张/逐镜）的重试
 * ============================================================ */
async function withRetryV3<T>(
  kind: "llm" | "image" | "video" | "compose",
  policy: PolicyV3,
  fn: () => Promise<T>,
): Promise<T> {
  let topRetry = 1;
  if (kind === "llm") topRetry = Math.max(1, Math.min(3, Math.ceil(policy.retry.llm / 2)));
  if (kind === "image") topRetry = 1;
  if (kind === "video") topRetry = 1;
  if (kind === "compose") topRetry = 2;

  let lastErr: unknown;
  for (let i = 0; i < topRetry; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === topRetry - 1) break;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/* ============================================================
 * runProjectAutoV3 — 后台循环
 *
 * 用 DB 字段 CAS 锁（project-lock.ts）保证跨进程互斥：
 *   1. acquireProjectLock：抢到才起循环；抢不到直接返回 already_running
 *   2. 每跑一步用 heartbeat 续期；进程崩溃后锁会因 TTL 自动失效，下次能重抢
 *   3. 遇到 awaiting_user 自动停下来释放锁
 *   4. 遇到 policy.steps[k] === false 也停
 * ============================================================ */

export async function runProjectAutoV3(opts: {
  userId: string;
  projectId: string;
}): Promise<{ started: boolean; reason?: string }> {
  const project = await prisma.comicProjectV3.findUnique({ where: { id: opts.projectId } });
  if (!project) throw new Error("项目不存在");
  if (project.userId !== opts.userId) throw new Error("无权访问");
  if (project.status === "completed") return { started: false, reason: "completed" };

  const handle = await acquireProjectLock(opts.projectId);
  if (!handle) {
    return { started: false, reason: "already_running" };
  }

  // 异步执行循环，不阻塞 API 响应
  (async () => {
    try {
      while (true) {
        const next = await pickNextStepKeyV3(opts.projectId);
        if (!next) break;
        const policy = await loadProjectPolicyV3(opts.projectId);
        if (policy.steps[next] === false) break;

        try {
          const r = await runOneStepV3({
            userId: opts.userId,
            projectId: opts.projectId,
            stepKey: next,
          });
          // 续期：单步可能 1-3 分钟，续到 5 分钟保证下一步开始前不会过期
          await handle.heartbeat();
          if (r.status === "awaiting_user") break;
        } catch (e) {
          console.error(`[comic-v3] auto run step ${next} failed:`, e);
          break;
        }
      }
    } finally {
      await handle.release().catch((e) =>
        console.error("[comic-v3] release lock failed:", e),
      );
    }
  })();

  return { started: true };
}

/**
 * 仅供 SSE / UI 展示用：项目是否被某个进程"持锁中"。
 * 不要用此函数判定能否继续跑——抢锁逻辑在 acquireProjectLock 里原子完成。
 */
export async function isProjectRunningV3(projectId: string): Promise<boolean> {
  return isProjectLocked(projectId);
}

/* ============================================================
 * 公开类型 — runner 上下文
 * ============================================================ */

export type StepRunContextV3 = {
  userId: string;
  projectId: string;
  project: {
    id: string;
    title: string;
    initialPrompt: string;
    style: string | null;
    visualStyle: string | null;
    language: string;
    resolution: string;
    aspectRatio: string;
    speedTier: string;
    llmSlug: string;
    imageSlug: string;
    videoSlug: string;
    ttsSlug: string;
    mode: ProjectMode;
  };
  /** 已完成步骤的产物：key → 解析后的 output 对象 */
  prior: Record<string, unknown>;
  policy: PolicyV3;
  extensions: Extensions;
};

/* ============================================================
 * 工具：校验管线可用
 * ============================================================ */

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
  ];
  for (const c of checks) {
    const m = await prisma.model.findUnique({
      where: { slug: c.slug },
      select: { id: true, type: true, enabled: true },
    });
    if (!m) {
      throw new Error(`管线配置的${c.label}模型「${c.slug}」不存在。请到 /admin 设置「漫剧管线」。`);
    }
    if (!m.enabled || m.type !== c.expectType) {
      throw new Error(`管线${c.label}模型「${c.slug}」类型不匹配或已禁用`);
    }
    const ch = await pickChannel(m.id, null);
    if (!ch) {
      throw new Error(`管线${c.label}模型「${c.slug}」没有可用渠道。请到 /admin 给它配置渠道。`);
    }
  }
}
