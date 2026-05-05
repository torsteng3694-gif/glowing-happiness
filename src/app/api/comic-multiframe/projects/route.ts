/**
 * AI 漫剧 · S2.0 — 项目集合 API
 *
 *   POST /api/comic-multiframe/projects   创建项目（mode=auto 时立刻起后台 runner）
 *   GET  /api/comic-multiframe/projects   列出当前用户的所有项目
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createProject, runProjectAuto } from "@/lib/comic-agent/engine";

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

  const initialPrompt: string = typeof body.prompt === "string" ? body.prompt : "";
  if (!initialPrompt.trim()) {
    return NextResponse.json({ error: "prompt 必填" }, { status: 400 });
  }

  try {
    const { project, estimate, policy } = await createProject({
      userId: session.id,
      initialPrompt,
      title: typeof body.title === "string" ? body.title : undefined,
      mode: body.mode === "step" ? "step" : "auto",
      resolution: typeof body.resolution === "string" ? body.resolution : undefined,
      aspectRatio: typeof body.aspectRatio === "string" ? body.aspectRatio : undefined,
      speedTier: typeof body.speedTier === "string" ? body.speedTier : undefined,
      style: typeof body.style === "string" ? body.style : undefined,
      language: typeof body.language === "string" ? body.language : undefined,
      autoPolicy: body.autoPolicy && typeof body.autoPolicy === "object" ? body.autoPolicy : null,
    });

    if (project.mode === "auto") {
      await runProjectAuto({ userId: session.id, projectId: project.id });
    }

    return NextResponse.json({
      project_id: project.id,
      mode: project.mode,
      status: project.status,
      currentStep: project.currentStep,
      estimate,
      policy,
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

  const rows = await prisma.comicProject.findMany({
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
