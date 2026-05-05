/**
 * 节点 05 模型/语言/每方案出图数 配置
 *
 *   PATCH /api/ecom-image/projects/:id/model-config
 *     body: { imageModelSlug?, promptLanguage?, imagesPerPlan? }
 *
 * 这些字段最终落到 EcomProject 上（confirm 时锁定）。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const project = await prisma.ecomProject.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (project.userId !== session.id) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.imageModelSlug === "string") data.imageModelSlug = body.imageModelSlug;
  if (body.promptLanguage === "zh" || body.promptLanguage === "en") {
    data.promptLanguage = body.promptLanguage;
  }
  if (typeof body.imagesPerPlan === "number" && body.imagesPerPlan >= 1 && body.imagesPerPlan <= 5) {
    data.imagesPerPlan = body.imagesPerPlan;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
  }

  const updated = await prisma.ecomProject.update({ where: { id }, data });
  return NextResponse.json({
    ok: true,
    imageModelSlug: updated.imageModelSlug,
    promptLanguage: updated.promptLanguage,
    imagesPerPlan: updated.imagesPerPlan,
  });
}
