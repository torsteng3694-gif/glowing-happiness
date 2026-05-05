/**
 * 单镜操作 API：
 *
 *   PATCH  /api/comic-multiframe/projects/:id/shots/:index
 *     body: { imagePrompt? motionPrompt? dialogue? durationSec? }
 *     仅手动改字段，不重生
 *
 *   POST   /api/comic-multiframe/projects/:id/shots/:index
 *     body: {
 *       action: "regen-image" | "regen-video" | "revise-prompt"
 *       overridePrompt? overrideMotionPrompt?
 *       field?: "imagePrompt" | "motionPrompt"
 *       instruction?: string  // 用于 AI 改写
 *     }
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  regenerateShotKeyframe,
  regenerateShotVideo,
  reviseShotPrompt,
  patchShotFields,
} from "@/lib/comic-agent/shot-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

async function ensureOwn(userId: string, projectId: string) {
  const p = await prisma.comicProject.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!p || p.userId !== userId) throw new Error("项目不存在或无权访问");
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, index } = await params;
  const shotIndex = Number(index);
  if (!Number.isFinite(shotIndex)) {
    return NextResponse.json({ error: "shot index 非法" }, { status: 400 });
  }

  try {
    await ensureOwn(session.id, id);
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body.imagePrompt === "string") patch.imagePrompt = body.imagePrompt;
    if (typeof body.motionPrompt === "string") patch.motionPrompt = body.motionPrompt;
    if (typeof body.dialogue === "string") patch.dialogue = body.dialogue;
    if (typeof body.durationSec === "number") patch.durationSec = body.durationSec;

    const updated = await patchShotFields({ projectId: id, shotIndex, patch });
    return NextResponse.json({ ok: true, shot: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, index } = await params;
  const shotIndex = Number(index);
  if (!Number.isFinite(shotIndex)) {
    return NextResponse.json({ error: "shot index 非法" }, { status: 400 });
  }

  try {
    await ensureOwn(session.id, id);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "regen-image") {
      const r = await regenerateShotKeyframe({
        userId: session.id,
        projectId: id,
        shotIndex,
        overridePrompt:
          typeof body.overridePrompt === "string" ? body.overridePrompt : undefined,
      });
      return NextResponse.json({ ok: true, ...r });
    }
    if (action === "regen-video") {
      const r = await regenerateShotVideo({
        userId: session.id,
        projectId: id,
        shotIndex,
        overrideMotionPrompt:
          typeof body.overrideMotionPrompt === "string"
            ? body.overrideMotionPrompt
            : undefined,
      });
      return NextResponse.json({ ok: true, ...r });
    }
    if (action === "revise-prompt") {
      const field = body.field === "motionPrompt" ? "motionPrompt" : "imagePrompt";
      const instruction = String(body.instruction || "").trim();
      if (!instruction) {
        return NextResponse.json({ error: "instruction 必填" }, { status: 400 });
      }
      const r = await reviseShotPrompt({
        userId: session.id,
        projectId: id,
        shotIndex,
        field,
        instruction,
      });
      return NextResponse.json({ ok: true, ...r });
    }
    return NextResponse.json({ error: "未知 action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
