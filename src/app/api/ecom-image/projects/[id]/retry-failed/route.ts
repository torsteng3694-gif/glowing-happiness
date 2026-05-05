/**
 * 重试所有失败的候选
 *
 *   POST /api/ecom-image/projects/:id/retry-failed
 *
 * 把所有 status=failed 的行重置为 queued + 触发调度器
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureProjectQueueRunning } from "@/lib/ecom-image/runners/image-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const r = await prisma.ecomGeneratedImage.updateMany({
    where: { projectId: id, status: "failed" },
    data: { status: "queued", progress: 0, errorMessage: null, runCount: 0 },
  });
  if (r.count === 0) {
    return NextResponse.json({ ok: true, retried: 0 });
  }
  ensureProjectQueueRunning({ projectId: id, userId: session.id });
  return NextResponse.json({ ok: true, retried: r.count });
}
