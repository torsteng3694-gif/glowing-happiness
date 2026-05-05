/**
 * AI 漫剧 · S3.0 — 单分镜重生成关键帧
 *
 *   POST /api/comic-v3/projects/:id/shots/:shotId/regen
 *   body: {
 *     modelSlug?: string,     // 临时换图像模型
 *     persistModel?: boolean  // 同时持久化到 imageModelOverride
 *   }
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callImageMulti } from "@/lib/comic-v3/helpers-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  const body = await req.json().catch(() => ({}));

  const project = await prisma.comicProjectV3.findUnique({
    where: { id },
    select: { userId: true, imageSlug: true, aspectRatio: true },
  });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  }

  const shot = await prisma.comicShotV3.findUnique({ where: { id: shotId } });
  if (!shot || shot.projectId !== id) {
    return NextResponse.json({ error: "分镜不存在" }, { status: 404 });
  }

  if (!shot.imagePrompt) {
    return NextResponse.json(
      { error: "该分镜尚未生成 imagePrompt" },
      { status: 400 },
    );
  }

  const tempModelSlug =
    typeof body?.modelSlug === "string" && body.modelSlug ? body.modelSlug : null;
  const effectiveModel = tempModelSlug || shot.imageModelOverride || project.imageSlug;

  if (tempModelSlug && body?.persistModel === true) {
    await prisma.comicShotV3.update({
      where: { id: shotId },
      data: { imageModelOverride: tempModelSlug },
    });
  }

  await prisma.comicShotV3.update({
    where: { id: shotId },
    data: { genStatus: "generating", genError: null },
  });

  try {
    const res = await callImageMulti({
      userId: session.id,
      modelSlug: effectiveModel,
      prompt: shot.imagePrompt,
      aspectRatio: project.aspectRatio,
      rawParams: shot.negativePrompt
        ? { negative_prompt: shot.negativePrompt }
        : undefined,
      metaTag: `comic-v3:storyboard:regen:shot:${shot.shotIndex}`,
      count: 1,
      saveAs: {
        projectId: id,
        category: "keyframe",
        label: `shot-${shot.shotIndex}`,
      },
    });

    if (res.urls.length === 0) {
      await prisma.comicShotV3.update({
        where: { id: shotId },
        data: {
          genStatus: "failed",
          genError: res.errors.join("；").slice(0, 500) || "生成失败",
        },
      });
      return NextResponse.json(
        { error: "重生成失败：" + (res.errors[0] || "未知错误") },
        { status: 500 },
      );
    }

    await prisma.comicShotV3.update({
      where: { id: shotId },
      data: {
        keyframeUrl: res.urls[0],
        genStatus: "ready",
        genError: null,
      },
    });

    return NextResponse.json({
      ok: true,
      keyframeUrl: res.urls[0],
      cost: res.totalCost,
      modelSlug: res.modelSlug,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.comicShotV3.update({
      where: { id: shotId },
      data: { genStatus: "failed", genError: msg },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
