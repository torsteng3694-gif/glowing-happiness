/**
 * 单张图规划重写（节点 04 卡片级"AI 重写"）
 *
 * 读取该 plan 的所属 type strategy + 用户反馈，调 LLM 重写 title/description/aspectRatio。
 * 不动其他 plan，不动节点 04 output（让 UI 直接读 EcomImagePlan 行）。
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeParseJson } from "../schemas";
import { callVisionJson } from "../vision";
import { PLAN_REWRITE_SYSTEM, buildPlanRewriteUser } from "../prompts";

const RewriteSchema = z.object({
  title: z.string().min(1).max(40),
  description: z.string().min(5),
  aspectRatio: z.string().optional(),
});

export interface RunPlanRewriteOpts {
  projectId: string;
  userId: string;
  modelSlug: string;
  planId: string;
  feedback: string;
}

export async function runPlanRewrite(opts: RunPlanRewriteOpts) {
  const { projectId, userId, modelSlug, planId, feedback } = opts;

  const plan = await prisma.ecomImagePlan.findUnique({
    where: { id: planId },
    include: { imageType: true },
  });
  if (!plan || plan.projectId !== projectId) {
    throw new Error("plan 不存在");
  }
  const project = await prisma.ecomProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("项目不存在");

  // 取所属分类的 strategy summary（如有）
  const strategy =
    safeParseJson<{ summary?: string }>(plan.imageType.strategy, {}).summary ??
    plan.imageType.description ??
    "";

  // 取该项目的商品图（让视觉模型重新看图）
  const sources = await prisma.ecomSourceImage.findMany({
    where: { projectId, analyzeStatus: { not: "excluded" } },
    orderBy: { orderIdx: "asc" },
  });

  const r = await callVisionJson({
    userId,
    modelSlug,
    system: PLAN_REWRITE_SYSTEM,
    userText: buildPlanRewriteUser({
      initialPrompt: project.initialPrompt,
      groupName: plan.imageType.name,
      groupStrategy: strategy,
      oldTitle: plan.title,
      oldDescription: plan.description,
      oldAspectRatio: plan.aspectRatio,
      feedback,
    }),
    imageUrls: sources.map((s) => s.url),
    imageDetail: "high",
    schema: RewriteSchema,
    metaTag: "ecom-image:plan_rewrite",
    maxTokens: 1500,
  });

  await prisma.ecomImagePlan.update({
    where: { id: planId },
    data: {
      title: r.data.title,
      description: r.data.description,
      ...(r.data.aspectRatio ? { aspectRatio: r.data.aspectRatio } : {}),
    },
  });
}
