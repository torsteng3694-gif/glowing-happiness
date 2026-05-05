/**
 * 单条 plan 提示词 AI 重写
 *
 *   POST /api/ecom-image/projects/:id/image-plans/:planId/regenerate-prompt
 *     body: { feedback: string, modelSlug?: string }
 *
 * 调用 runPromptGeneration({ singlePlanId, feedback })，
 * 仅更新该条 plan.prompt，不动节点 output（避免覆盖其他条）。
 *
 * modelSlug 不传时，沿用节点 06 上次 run 的 usedModelSlug；
 * 都没有时返回 400，要求用户先在节点 06 完整 run 一次。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runPromptGeneration } from "@/lib/ecom-image/runners/prompt-generation";
import { NODE_KEYS } from "@/lib/ecom-image/nodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; planId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, planId } = await ctx.params;

  const project = await prisma.ecomProject.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (project.userId !== session.id) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const plan = await prisma.ecomImagePlan.findUnique({ where: { id: planId } });
  if (!plan || plan.projectId !== id) {
    return NextResponse.json({ error: "plan 不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const feedback = typeof body?.feedback === "string" ? body.feedback : "";
  let modelSlug = typeof body?.modelSlug === "string" ? body.modelSlug : "";

  // 不传 modelSlug：从节点 06 上次 run 的 usedModelSlug 取
  if (!modelSlug) {
    const node = await prisma.ecomProjectNode.findUnique({
      where: { projectId_nodeKey: { projectId: id, nodeKey: NODE_KEYS.PROMPT_GENERATION } },
      select: { usedModelSlug: true },
    });
    modelSlug = node?.usedModelSlug ?? "";
  }
  if (!modelSlug) {
    return NextResponse.json(
      { error: "请先在节点 06 完整运行一次，或在请求中传入 modelSlug" },
      { status: 400 },
    );
  }

  try {
    await runPromptGeneration({
      projectId: id,
      userId: session.id,
      modelSlug,
      singlePlanId: planId,
      feedback,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const updated = await prisma.ecomImagePlan.findUnique({ where: { id: planId } });
  return NextResponse.json({ ok: true, plan: updated });
}
