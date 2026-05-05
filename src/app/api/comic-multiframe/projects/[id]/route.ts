/**
 * 项目详情 / 删除
 *
 *   GET    /api/comic-multiframe/projects/:id   返回项目 + 所有 step（含 output / artifacts）
 *   DELETE /api/comic-multiframe/projects/:id   级联删除
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isProjectRunning } from "@/lib/comic-agent/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;

  const project = await prisma.comicProject.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { stepIndex: "asc" } },
      characters: { orderBy: { orderIdx: "asc" } },
    },
  });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  return NextResponse.json({
    project: {
      ...project,
      isRunning: isProjectRunning(project.id),
      steps: project.steps.map((s) => ({
        ...s,
        output: s.output ? safeParse(s.output) : null,
        artifacts: s.artifacts ? safeParse(s.artifacts) : null,
      })),
      characters: project.characters.map((c) => ({
        ...c,
        referenceUrls: c.referenceUrls ? safeParseArr(c.referenceUrls) : [],
      })),
    },
  });
}

function safeParseArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((u) => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const project = await prisma.comicProject.findUnique({ where: { id } });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.slice(0, 60);
  if (typeof body.style === "string") data.style = body.style.slice(0, 80);
  if (typeof body.visualStyle === "string") data.visualStyle = body.visualStyle.slice(0, 40);
  if (typeof body.aspectRatio === "string") data.aspectRatio = body.aspectRatio;
  if (typeof body.resolution === "string") data.resolution = body.resolution;
  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
  const updated = await prisma.comicProject.update({ where: { id }, data });
  return NextResponse.json({ ok: true, project: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const project = await prisma.comicProject.findUnique({ where: { id } });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  await prisma.comicProject.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
