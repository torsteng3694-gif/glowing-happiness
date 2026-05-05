/**
 * AI 漫剧 · S3.0 — 编辑 asset 骨架
 *
 *   PATCH /api/comic-v3/projects/:id/assets/:assetId/edit
 *   body: { imagePrompt?, visualAnchor?, negativePrompt?, imageModelOverride? }
 *
 * 用于 assets_plan 步：用户审 prompt 时手动调整。
 * 也可在 assets_render awaiting_pick 状态下编辑（编辑后建议重生成）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const EditSchema = z.object({
  imagePrompt: z.string().min(1).max(2000).optional(),
  visualAnchor: z.string().min(1).max(800).optional(),
  negativePrompt: z.string().max(800).nullable().optional(),
  imageModelOverride: z.string().max(80).nullable().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; assetId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id, assetId } = await ctx.params;

  const project = await prisma.comicProjectV3.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  }

  const asset = await prisma.comicAssetV3.findUnique({ where: { id: assetId } });
  if (!asset || asset.projectId !== id) {
    return NextResponse.json({ error: "资产不存在" }, { status: 404 });
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
  if (parsed.data.imagePrompt !== undefined) data.imagePrompt = parsed.data.imagePrompt;
  if (parsed.data.visualAnchor !== undefined) data.visualAnchor = parsed.data.visualAnchor;
  if (parsed.data.negativePrompt !== undefined) data.negativePrompt = parsed.data.negativePrompt;
  if (parsed.data.imageModelOverride !== undefined)
    data.imageModelOverride = parsed.data.imageModelOverride;

  // 编辑 prompt 后，把状态打回 planned（让 render 步重跑此项）
  if (parsed.data.imagePrompt !== undefined && asset.genStatus !== "ready") {
    data.genStatus = "planned";
    data.genError = null;
  }

  const updated = await prisma.comicAssetV3.update({
    where: { id: assetId },
    data,
  });

  return NextResponse.json({
    ok: true,
    asset: {
      id: updated.id,
      imagePrompt: updated.imagePrompt,
      visualAnchor: updated.visualAnchor,
      negativePrompt: updated.negativePrompt,
      imageModelOverride: updated.imageModelOverride,
      genStatus: updated.genStatus,
    },
  });
}
