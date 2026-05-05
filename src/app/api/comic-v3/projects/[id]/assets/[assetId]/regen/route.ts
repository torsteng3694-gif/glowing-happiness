/**
 * AI 漫剧 · S3.0 — 单 asset 重生成候选
 *
 *   POST /api/comic-v3/projects/:id/assets/:assetId/regen
 *   body: {
 *     count?: number,         // 重生成几张候选；默认 = policy.assetsCandidatesPerSubject
 *     modelSlug?: string,     // 临时换图像模型（不会写到 imageModelOverride，仅本次生效）
 *     persistModel?: boolean  // 若 true 且 modelSlug 提供，保存为 imageModelOverride（持久）
 *   }
 *
 * 用 ComicAssetV3.imagePrompt 作为 prompt（assets_plan 已写入）。
 * 旧 candidates 会被新的覆盖，pickedUrl 设为新候选第 1 张。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callImageMulti } from "@/lib/comic-v3/helpers-image";
import { loadProjectPolicyV3 } from "@/lib/comic-v3/engine";
import { refreshAssetsStepCandidate } from "@/lib/comic-v3/assets-step";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  const body = await req.json().catch(() => ({}));

  const project = await prisma.comicProjectV3.findUnique({
    where: { id },
    select: { userId: true, imageSlug: true, aspectRatio: true },
  });
  if (!project || project.userId !== session.id) {
    return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  }

  const asset = await prisma.comicAssetV3.findUnique({ where: { id: assetId } });
  if (!asset || asset.projectId !== id) {
    return NextResponse.json({ error: "资产不存在" }, { status: 404 });
  }

  if (!asset.imagePrompt) {
    return NextResponse.json(
      { error: "该资产尚未生成 imagePrompt（请先在「资产骨架」步生成或手动编辑）" },
      { status: 400 },
    );
  }

  const policy = await loadProjectPolicyV3(id);
  const count = clampInt(body?.count ?? policy.assetsCandidatesPerSubject, 1, 5);

  // 模型选择优先级：本次 body.modelSlug > asset.imageModelOverride > project.imageSlug
  const tempModelSlug = typeof body?.modelSlug === "string" && body.modelSlug ? body.modelSlug : null;
  const effectiveModel = tempModelSlug || asset.imageModelOverride || project.imageSlug;

  // 持久化 override
  if (tempModelSlug && body?.persistModel === true) {
    await prisma.comicAssetV3.update({
      where: { id: assetId },
      data: { imageModelOverride: tempModelSlug },
    });
  }

  await prisma.comicAssetV3.update({
    where: { id: assetId },
    data: { genStatus: "generating", genError: null },
  });

  try {
    const res = await callImageMulti({
      userId: session.id,
      modelSlug: effectiveModel,
      prompt: asset.imagePrompt,
      aspectRatio: project.aspectRatio,
      rawParams: asset.negativePrompt
        ? { negative_prompt: asset.negativePrompt }
        : undefined,
      metaTag: `comic-v3:assets:regen:${asset.type}:${asset.name}`,
      count,
      saveAs: { projectId: id, category: "subject", label: asset.name },
    });

    if (res.urls.length === 0) {
      await prisma.comicAssetV3.update({
        where: { id: assetId },
        data: {
          genStatus: "failed",
          genError: res.errors.join("；").slice(0, 500) || "全部候选生成失败",
        },
      });
      return NextResponse.json(
        { error: "重生成失败：" + (res.errors[0] || "未知错误") },
        { status: 500 },
      );
    }

    const cands = res.urls.map((url) => ({
      url,
      prompt: asset.imagePrompt,
      modelSlug: res.modelSlug,
    }));
    await prisma.comicAssetV3.update({
      where: { id: assetId },
      data: {
        candidates: JSON.stringify(cands),
        pickedUrl: cands[0].url,
        genStatus: "awaiting_pick",
        genError:
          res.errors.length > 0
            ? `部分候选生成失败：${res.errors.length}/${count}`
            : null,
      },
    });

    await refreshAssetsStepCandidate(id);

    return NextResponse.json({
      ok: true,
      count: res.urls.length,
      cost: res.totalCost,
      modelSlug: res.modelSlug,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.comicAssetV3.update({
      where: { id: assetId },
      data: { genStatus: "failed", genError: msg },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
