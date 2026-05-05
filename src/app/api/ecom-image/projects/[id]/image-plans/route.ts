/**
 * 图片规划列表（节点 04 增加新 plan）
 *
 *   POST /api/ecom-image/projects/:id/image-plans
 *     body: { imageTypeId, title?, description?, aspectRatio?, origin?: "manual"|"ai_added" }
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  const imageTypeId = typeof body.imageTypeId === "string" ? body.imageTypeId : "";
  if (!imageTypeId) {
    return NextResponse.json({ error: "imageTypeId 必填" }, { status: 400 });
  }

  // 确认 type 属于该项目
  const type = await prisma.ecomImageType.findUnique({
    where: { id: imageTypeId },
    select: { projectId: true },
  });
  if (!type || type.projectId !== id) {
    return NextResponse.json({ error: "imageTypeId 非法" }, { status: 400 });
  }

  // 取该 type 下当前最大 idx
  const last = await prisma.ecomImagePlan.findFirst({
    where: { imageTypeId },
    orderBy: { idx: "desc" },
    select: { idx: true },
  });
  const nextIdx = (last?.idx ?? 0) + 1;

  // 全项目最大 orderIdx（用于排序）
  const lastOrder = await prisma.ecomImagePlan.findFirst({
    where: { projectId: id },
    orderBy: { orderIdx: "desc" },
    select: { orderIdx: true },
  });

  const created = await prisma.ecomImagePlan.create({
    data: {
      projectId: id,
      imageTypeId,
      idx: nextIdx,
      title: typeof body.title === "string" ? body.title : `新规划 ${nextIdx}`,
      description: typeof body.description === "string" ? body.description : "",
      aspectRatio: typeof body.aspectRatio === "string" ? body.aspectRatio : "1:1",
      origin: body.origin === "ai_added" ? "ai_added" : "manual",
      orderIdx: (lastOrder?.orderIdx ?? -1) + 1,
    },
  });

  return NextResponse.json({ ok: true, plan: created });
}
