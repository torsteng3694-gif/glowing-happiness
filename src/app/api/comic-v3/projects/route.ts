/**
 * AI 漫剧 · S3.0 — 项目集合
 *
 *   POST /api/comic-v3/projects  创建项目（mode=auto 时立刻起后台 runner）
 *   GET  /api/comic-v3/projects  列出当前用户的所有项目
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createProjectV3, runProjectAutoV3 } from "@/lib/comic-v3/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体非法" }, { status: 400 });
  }

  const initialPrompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!initialPrompt.trim()) {
    return NextResponse.json({ error: "prompt 必填" }, { status: 400 });
  }

  try {
    const { project, policy, extensions, estimatedCost } = await createProjectV3({
      userId: session.id,
      initialPrompt,
      title: typeof body.title === "string" ? body.title : undefined,
      mode: body.mode === "step" ? "step" : "auto",
      resolution: typeof body.resolution === "string" ? body.resolution : undefined,
      aspectRatio: typeof body.aspectRatio === "string" ? body.aspectRatio : undefined,
      speedTier: typeof body.speedTier === "string" ? body.speedTier : undefined,
      style: typeof body.style === "string" ? body.style : undefined,
      visualStyle: typeof body.visualStyle === "string" ? body.visualStyle : undefined,
      language: typeof body.language === "string" ? body.language : undefined,
      imagePreset: typeof body.imagePreset === "string" ? body.imagePreset : undefined,
      extensions: body.extensions && typeof body.extensions === "object" ? body.extensions : null,
      policy: body.policy && typeof body.policy === "object" ? body.policy : null,
    });

    if (project.mode === "auto") {
      await runProjectAutoV3({ userId: session.id, projectId: project.id });
    }

    return NextResponse.json({
      projectId: project.id,
      mode: project.mode,
      status: project.status,
      currentStep: project.currentStep,
      estimatedCost,
      policy,
      extensions,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET() {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const rows = await prisma.comicProjectV3.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      mode: true,
      status: true,
      progress: true,
      currentStep: true,
      coverUrl: true,
      finalVideoUrl: true,
      totalCost: true,
      estimatedCost: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ projects: rows });
}
