/**
 * 节点 06 · 提示词生成 runner
 *
 * 对每个 EcomImagePlan，调用 LLM 生成最终的生图提示词。
 * 并发 3，复用项目锁定的视觉模型（节点 01 用过的或用户选定的）。
 *
 * 输入：
 *   - 商品上下文（initialPrompt + reportMd）
 *   - 每个 plan 的 title / description / aspectRatio / 所属分类的 strategy
 *   - 项目锁定的 promptLanguage（zh/en）
 *
 * 输出：
 *   - 写每个 EcomImagePlan.prompt
 *   - 写节点 output.prompts
 */

import { prisma } from "@/lib/db";
import { NODE_KEYS } from "../nodes";
import {
  PromptGenerationOutputSchema,
  safeParseJson,
} from "../schemas";
import { callText } from "../vision";
import {
  PROMPT_GENERATION_SYSTEM_EN,
  PROMPT_GENERATION_SYSTEM_ZH,
  buildPromptGenerationUser,
  META_TAGS,
} from "../prompts";

const CONCURRENCY = 3;

export interface RunPromptGenerationOpts {
  projectId: string;
  userId: string;
  /** 用于撰写提示词的 chat 模型 slug（不是生图模型） */
  modelSlug: string;
  /** 仅生成单条 plan 的 prompt 时传 planId（用于"AI 重写这条"） */
  singlePlanId?: string;
  feedback?: string | null;
}

export async function runPromptGeneration(opts: RunPromptGenerationOpts) {
  const { projectId, userId, modelSlug, singlePlanId, feedback } = opts;

  const [project, productNode] = await Promise.all([
    prisma.ecomProject.findUnique({ where: { id: projectId } }),
    prisma.ecomProjectNode.findUnique({
      where: {
        projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.PRODUCT_ANALYSIS },
      },
    }),
  ]);
  if (!project) throw new Error("项目不存在");

  const language = (project.promptLanguage as "zh" | "en") ?? "zh";
  const productSummary =
    safeParseJson<{ reportMd?: string }>(productNode?.output ?? null, {})?.reportMd ?? "";

  // 1. 拉目标 plans + 所属 type（含 strategy）
  const plans = await prisma.ecomImagePlan.findMany({
    where: singlePlanId ? { id: singlePlanId, projectId } : { projectId },
    orderBy: { orderIdx: "asc" },
    include: { imageType: true },
  });
  if (plans.length === 0) {
    throw new Error("没有需要生成提示词的 plan");
  }

  // 2. 并发调 LLM
  const queue = [...plans];
  const inFlight: Promise<void>[] = [];
  const errors: Array<{ planId: string; error: string }> = [];

  const worker = async (plan: (typeof plans)[number]) => {
    try {
      const strategy =
        safeParseJson<{ summary?: string }>(plan.imageType.strategy, {}).summary ??
        plan.imageType.description ??
        "";
      const r = await callText({
        userId,
        modelSlug,
        system: language === "en" ? PROMPT_GENERATION_SYSTEM_EN : PROMPT_GENERATION_SYSTEM_ZH,
        userText: buildPromptGenerationUser({
          initialPrompt: project.initialPrompt,
          productSummary,
          groupName: plan.imageType.name,
          groupStrategy: strategy,
          planTitle: plan.title,
          planDescription: plan.description,
          aspectRatio: plan.aspectRatio,
          language,
          feedback: singlePlanId ? feedback : undefined, // feedback 只对单条重生有效
        }),
        temperature: 0.5,
        maxTokens: 1500,
        metaTag: META_TAGS[NODE_KEYS.PROMPT_GENERATION],
      });
      const promptText = r.text.trim();
      if (!promptText) throw new Error("LLM 返回空提示词");
      await prisma.ecomImagePlan.update({
        where: { id: plan.id },
        data: { prompt: promptText },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ planId: plan.id, error: msg });
    }
  };

  while (queue.length > 0 || inFlight.length > 0) {
    while (inFlight.length < CONCURRENCY && queue.length > 0) {
      const plan = queue.shift()!;
      const p = worker(plan).finally(() => {
        const idx = inFlight.indexOf(p);
        if (idx >= 0) inFlight.splice(idx, 1);
      });
      inFlight.push(p);
    }
    if (inFlight.length > 0) await Promise.race(inFlight);
  }

  // 3. 写节点 output（仅在全量模式下重写；单条模式不动 output）
  if (!singlePlanId) {
    const allPlans = await prisma.ecomImagePlan.findMany({
      where: { projectId },
      orderBy: { orderIdx: "asc" },
      select: { id: true, prompt: true, negativePrompt: true },
    });
    const output = PromptGenerationOutputSchema.parse({
      prompts: allPlans.map((p) => ({
        planId: p.id,
        language,
        prompt: p.prompt ?? "",
        negativePrompt: p.negativePrompt ?? "",
        staleHint: false,
      })),
    });
    await prisma.ecomProjectNode.update({
      where: {
        projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.PROMPT_GENERATION },
      },
      data: { output: JSON.stringify(output) },
    });
  }

  // 全部失败 → 抛错
  if (errors.length === plans.length) {
    throw new Error(`提示词生成全部失败：${errors[0].error}`);
  }
}
