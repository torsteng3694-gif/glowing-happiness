/**
 * 单张商品图重新分析（节点 03 单图重生）
 *
 *   POST /api/ecom-image/projects/:id/source-images/:imageId/reanalyze
 *     body: { feedback?: string, modelSlug?: string }
 *
 * 真 engine：调 vision 解析这一张图
 * 不传 modelSlug 时使用节点 03 上次用的 usedModelSlug
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runImageAnalysis } from "@/lib/ecom-image/runners/image-analysis";
import { NODE_KEYS } from "@/lib/ecom-image/nodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; imageId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, imageId } = await ctx.params;

  const project = await prisma.ecomProject.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (project.userId !== session.id) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const feedback = typeof body?.feedback === "string" ? body.feedback : undefined;
  let modelSlug = typeof body?.modelSlug === "string" ? body.modelSlug : "";

  // 不传 modelSlug：从节点 03 的 usedModelSlug 取
  if (!modelSlug) {
    const node = await prisma.ecomProjectNode.findUnique({
      where: { projectId_nodeKey: { projectId: id, nodeKey: NODE_KEYS.IMAGE_ANALYSIS } },
      select: { usedModelSlug: true },
    });
    modelSlug = node?.usedModelSlug ?? "";
  }
  if (!modelSlug) {
    return NextResponse.json(
      { error: "请先选择视觉模型（节点 03 之前未运行过）" },
      { status: 400 },
    );
  }

  try {
    await runImageAnalysis({
      projectId: id,
      userId: session.id,
      modelSlug,
      sourceImageId: imageId,
      feedback,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const updated = await prisma.ecomSourceImage.findUnique({ where: { id: imageId } });
  return NextResponse.json({ ok: true, sourceImage: updated });
}
