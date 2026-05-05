/**
 * AI 漫剧 · S3.0 — 单项目详情 + 删除
 *
 *   GET    /api/comic-v3/projects/:id  返回项目 + 所有 step 快照
 *   DELETE /api/comic-v3/projects/:id  删除项目（级联删除 steps / assets）
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const project = await prisma.comicProjectV3.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { stepIndex: "asc" } },
      assets: { orderBy: { orderIdx: "asc" } },
    },
  });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const project = await prisma.comicProjectV3.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  }

  await prisma.comicProjectV3.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
