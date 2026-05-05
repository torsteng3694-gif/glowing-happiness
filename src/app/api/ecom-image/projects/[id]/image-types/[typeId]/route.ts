/**
 * 单个出图类型编辑（节点 01 卡片：勾选/取消、改名、改描述）
 *
 *   PATCH  /api/ecom-image/projects/:id/image-types/:typeId
 *     body: { selected?, name?, description?, plannedCount? }
 *   DELETE /api/ecom-image/projects/:id/image-types/:typeId
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
  return { error: null as null, status: 200 as const };
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; typeId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, typeId } = await ctx.params;
  const auth = await ensureOwn(id, session.id);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.selected === "boolean") data.selected = body.selected;
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.plannedCount === "number") data.plannedCount = body.plannedCount;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
  }
  const updated = await prisma.ecomImageType.update({ where: { id: typeId }, data });
  return NextResponse.json({ ok: true, imageType: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; typeId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, typeId } = await ctx.params;
  const auth = await ensureOwn(id, session.id);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await prisma.ecomImageType.delete({ where: { id: typeId } });
  return NextResponse.json({ ok: true });
}
