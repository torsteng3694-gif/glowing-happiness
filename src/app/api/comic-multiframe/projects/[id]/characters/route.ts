/**
 *   GET    /api/comic-multiframe/projects/:id/characters         列出角色
 *   POST   /api/comic-multiframe/projects/:id/characters         新增（type/name/description/visualAnchor）
 *
 * 单条删/改在 ./[charId]/route.ts
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureOwn(userId: string, projectId: string) {
  const p = await prisma.comicProject.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!p || p.userId !== userId) throw new Error("项目不存在或无权访问");
}

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
  try {
    await ensureOwn(session.id, id);
    const rows = await prisma.comicCharacter.findMany({
      where: { projectId: id },
      orderBy: [{ type: "asc" }, { orderIdx: "asc" }],
    });
    return NextResponse.json({ characters: rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

export async function POST(
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
  try {
    await ensureOwn(session.id, id);
    const body = await req.json().catch(() => ({}));
    const type = body.type === "scene" || body.type === "prop" ? body.type : "character";
    const name = String(body.name || "").trim().slice(0, 12);
    if (!name) return NextResponse.json({ error: "name 必填" }, { status: 400 });
    const description = body.description ? String(body.description).slice(0, 200) : null;
    const visualAnchor = body.visualAnchor ? String(body.visualAnchor).slice(0, 200) : null;

    // orderIdx 取同 type 的最大值 + 1
    const last = await prisma.comicCharacter.findFirst({
      where: { projectId: id, type },
      orderBy: { orderIdx: "desc" },
    });
    const created = await prisma.comicCharacter.create({
      data: {
        projectId: id,
        type,
        name,
        description,
        visualAnchor,
        orderIdx: (last?.orderIdx ?? -1) + 1,
      },
    });
    return NextResponse.json({ ok: true, character: created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
