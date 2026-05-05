/**
 * 电商一键出图 · 单项目 snapshot
 *
 *   GET    /api/ecom-image/projects/:id   完整 snapshot（前端 SWR 唯一拉取入口）
 *   DELETE /api/ecom-image/projects/:id   删除项目（cascade 删所有子表）
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadProjectSnapshot } from "@/lib/ecom-image/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
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
    return NextResponse.json({ error: "无权访问该项目" }, { status: 403 });
  }

  const snapshot = await loadProjectSnapshot(id);
  if (!snapshot) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json(snapshot);
}

export async function DELETE(
  _req: Request,
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
    return NextResponse.json({ error: "无权访问该项目" }, { status: 403 });
  }

  await prisma.ecomProject.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
