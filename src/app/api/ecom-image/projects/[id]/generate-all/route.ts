/**
 * 批量提交节点 07 所有未生成 plan 的候选
 *
 *   POST /api/ecom-image/projects/:id/generate-all
 *     body: { mode?: "missing" | "full" }
 *       missing（默认）：只为还没生成完 imagesPerPlan 张的 plan 补齐
 *       full：忽略已有，每个 plan 重新提交 imagesPerPlan 张
 *
 *   POST /api/ecom-image/projects/:id/generate-all/retry-failed
 *   等价：把所有 failed 行重置为 queued
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureProjectQueueRunning,
  submitProjectGeneration,
} from "@/lib/ecom-image/runners/image-generation";

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
    select: { userId: true, imageModelSlug: true },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (project.userId !== session.id) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }
  if (!project.imageModelSlug) {
    return NextResponse.json({ error: "请先在节点 05 选择生图模型" }, { status: 400 });
  }

  // 校验所有 plan 都有 prompt
  const plansWithoutPrompt = await prisma.ecomImagePlan.count({
    where: { projectId: id, OR: [{ prompt: null }, { prompt: "" }] },
  });
  if (plansWithoutPrompt > 0) {
    return NextResponse.json(
      { error: `有 ${plansWithoutPrompt} 个方案缺少提示词，请先在节点 06 生成` },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "full" ? "full" : "missing";

  try {
    const r = await submitProjectGeneration({
      projectId: id,
      fillOnlyMissing: mode === "missing",
    });
    ensureProjectQueueRunning({ projectId: id, userId: session.id });
    return NextResponse.json({ ok: true, inserted: r.inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
