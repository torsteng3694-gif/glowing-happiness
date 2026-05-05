/**
 * AI 漫剧 · S3.0 — 编辑分镜
 *
 *   PATCH /api/comic-v3/projects/:id/shots/:shotId/edit
 *   body: {
 *     imagePrompt?, motionHint?, dialogue?, durationSec?,
 *     shotType?, cameraMove?,
 *     negativePrompt?, imageModelOverride?
 *   }
 *
 * 编辑后 keyframe 不会自动重跑，用户需另外点"重生成"。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const EditSchema = z.object({
  imagePrompt: z.string().min(1).max(2000).optional(),
  motionHint: z.string().max(500).optional(),
  dialogue: z.string().max(800).optional(),
  durationSec: z.number().min(1).max(20).optional(),
  shotType: z
    .enum(["wide", "medium", "close", "extreme_close", "over_shoulder"])
    .optional(),
  cameraMove: z
    .enum(["static", "pan", "zoom_in", "zoom_out", "dolly", "tracking"])
    .optional(),
  negativePrompt: z.string().max(800).nullable().optional(),
  imageModelOverride: z.string().max(80).nullable().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; shotId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id, shotId } = await ctx.params;

  const project = await prisma.comicProjectV3.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  }

  const shot = await prisma.comicShotV3.findUnique({ where: { id: shotId } });
  if (!shot || shot.projectId !== id) {
    return NextResponse.json({ error: "分镜不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = EditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "参数错误" },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  for (const k of [
    "imagePrompt",
    "motionHint",
    "dialogue",
    "durationSec",
    "shotType",
    "cameraMove",
    "negativePrompt",
    "imageModelOverride",
  ] as const) {
    if (parsed.data[k] !== undefined) data[k] = parsed.data[k];
  }

  const updated = await prisma.comicShotV3.update({
    where: { id: shotId },
    data,
  });

  return NextResponse.json({
    ok: true,
    shot: {
      id: updated.id,
      shotIndex: updated.shotIndex,
      imagePrompt: updated.imagePrompt,
      motionHint: updated.motionHint,
      dialogue: updated.dialogue,
      durationSec: updated.durationSec,
      shotType: updated.shotType,
      cameraMove: updated.cameraMove,
      negativePrompt: updated.negativePrompt,
      imageModelOverride: updated.imageModelOverride,
    },
  });
}
