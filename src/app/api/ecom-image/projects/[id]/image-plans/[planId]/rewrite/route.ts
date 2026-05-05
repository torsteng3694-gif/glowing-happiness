/**
 * 单张图规划 AI 重写（节点 04 卡片级"AI 重写"）
 *
 *   POST /api/ecom-image/projects/:id/image-plans/:planId/rewrite
 *     body: { feedback: string, modelSlug?: string }
 *
 * modelSlug 不传时，沿用节点 04 上次 run 的 usedModelSlug。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runPlanRewrite } from "@/lib/ecom-image/runners/plan-rewrite";
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

  const body = await req.json().catch(() => ({}));
  const feedback = typeof body?.feedback === "string" ? body.feedback : "";
  if (!feedback.trim()) {
    return NextResponse.json({ error: "feedback 必填" }, { status: 400 });
  }
  let modelSlug = typeof body?.modelSlug === "string" ? body.modelSlug : "";

  if (!modelSlug) {
    const node = await prisma.ecomProjectNode.findUnique({
      where: { projectId_nodeKey: { projectId: id, nodeKey: NODE_KEYS.PLAN_CREATION } },
      select: { usedModelSlug: true },
    });
    modelSlug = node?.usedModelSlug ?? "";
  }
  if (!modelSlug) {
    return NextResponse.json(
      { error: "请先在节点 04 完整运行一次，或在请求中传入 modelSlug" },
      { status: 400 },
    );
  }

  try {
    await runPlanRewrite({
      projectId: id,
      userId: session.id,
      modelSlug,
      planId,
      feedback,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const updated = await prisma.ecomImagePlan.findUnique({ where: { id: planId } });
  return NextResponse.json({ ok: true, plan: updated });
}
