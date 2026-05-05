/**
 * 单 plan 追加 / 重新生成候选图（节点 07 "+追加" 或 单图重生）
 *
 *   POST /api/ecom-image/projects/:id/image-plans/:planId/generate
 *     body: { generatedImageId?: string }   // 传则重试该候选；不传则新增一张
 *
 * 真 engine：往 EcomGeneratedImage 写 queued 行 + 触发项目调度器（fire-and-forget）
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureProjectQueueRunning,
  submitSingleGeneration,
} from "@/lib/ecom-image/runners/image-generation";

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
    select: { userId: true, imageModelSlug: true },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (project.userId !== session.id) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  if (!project.imageModelSlug) {
    return NextResponse.json(
      { error: "请先在节点 05 选择生图模型" },
      { status: 400 },
    );
  }

  const plan = await prisma.ecomImagePlan.findUnique({ where: { id: planId } });
  if (!plan || plan.projectId !== id) {
    return NextResponse.json({ error: "plan 不存在" }, { status: 404 });
  }
  if (!plan.prompt) {
    return NextResponse.json({ error: "请先在节点 06 生成提示词" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const generatedImageId =
    typeof body?.generatedImageId === "string" ? body.generatedImageId : undefined;

  try {
    const r = await submitSingleGeneration({
      projectId: id,
      planId,
      generatedImageId,
    });
    ensureProjectQueueRunning({ projectId: id, userId: session.id });
    return NextResponse.json({ ok: true, generatedImageId: r.generatedImageId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
