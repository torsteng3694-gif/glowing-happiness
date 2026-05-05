/**
 * 单张候选图编辑（节点 07）
 *
 *   PATCH  /api/ecom-image/projects/:id/generated-images/:genId
 *     body: { picked? }
 *   DELETE /api/ecom-image/projects/:id/generated-images/:genId
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
  ctx: { params: Promise<{ id: string; genId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, genId } = await ctx.params;
  const auth = await ensureOwn(id, session.id);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.picked === "boolean") data.picked = body.picked;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
  }
  const updated = await prisma.ecomGeneratedImage.update({ where: { id: genId }, data });
  return NextResponse.json({ ok: true, generated: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; genId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, genId } = await ctx.params;
  const auth = await ensureOwn(id, session.id);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await prisma.ecomGeneratedImage.delete({ where: { id: genId } });
  return NextResponse.json({ ok: true });
}
