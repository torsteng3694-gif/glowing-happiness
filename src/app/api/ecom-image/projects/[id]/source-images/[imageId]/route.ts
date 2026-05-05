/**
 * 电商一键出图 · 单张原始商品图编辑 / 状态切换
 *
 *   PATCH /api/ecom-image/projects/:id/source-images/:imageId
 *     body: { title?, description?, analyzeStatus? }
 *
 *   POST  /api/ecom-image/projects/:id/source-images/:imageId/reanalyze
 *     body: { feedback? }
 *     mock：把状态置 done，title/description 复用 fixtures（现实里会调 vision LLM）
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureOwn(projectId: string, userId: string) {
  const project = await prisma.ecomProject.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) return { error: "项目不存在", status: 404 as const };
  if (project.userId !== userId) return { error: "无权访问", status: 403 as const };
  return { error: null, status: 200 as const };
}

export async function PATCH(
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
  const auth = await ensureOwn(id, session.id);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.analyzeStatus === "string") {
    const allowed = ["pending", "running", "done", "failed", "excluded"];
    if (!allowed.includes(body.analyzeStatus)) {
      return NextResponse.json({ error: "非法 analyzeStatus" }, { status: 400 });
    }
    data.analyzeStatus = body.analyzeStatus;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
  }

  const updated = await prisma.ecomSourceImage.update({
    where: { id: imageId },
    data,
  });
  return NextResponse.json({ ok: true, sourceImage: updated });
}
