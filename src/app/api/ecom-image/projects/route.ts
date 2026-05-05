/**
 * 电商一键出图 · 项目集合
 *
 *   GET  /api/ecom-image/projects        当前用户的项目列表
 *   POST /api/ecom-image/projects        新建项目
 *     body: { prompt, title?, sourceImageUrls?[], demo?: boolean }
 *
 * 阶段 0：底层用 mock-engine，不调任何上游。
 * demo=true：直接铺一份 7 节点全 confirmed 的演示项目。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createDemoProject, createMockProject } from "@/lib/ecom-image/mock-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const rows = await prisma.ecomProject.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      currentNode: true,
      progress: true,
      coverUrl: true,
      finalZipUrl: true,
      initialImageCount: true,
      totalCost: true,
      estimatedCost: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ projects: rows });
}

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

  // demo 模式：一键创建演示项目
  if (body.demo === true) {
    try {
      const project = await createDemoProject(session.id);
      return NextResponse.json({ projectId: project.id, demo: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const initialPrompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!initialPrompt.trim()) {
    return NextResponse.json({ error: "prompt 必填" }, { status: 400 });
  }

  const sourceImageUrls = Array.isArray(body.sourceImageUrls)
    ? body.sourceImageUrls.filter((u: unknown): u is string => typeof u === "string").slice(0, 9)
    : [];

  try {
    const project = await createMockProject({
      userId: session.id,
      initialPrompt,
      title: typeof body.title === "string" ? body.title : undefined,
      sourceImageUrls,
    });
    return NextResponse.json({ projectId: project.id, status: project.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
