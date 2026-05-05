/**
 * AI 漫剧 · S3.0 — 资产挑图
 *
 *   POST /api/comic-v3/projects/:id/assets/:assetId/pick
 *   body: { url: string }   // 必须是 candidates 里的某个 url
 *
 * 同时刷新 assets step 的 output（让下游 step 读到最新选图）。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refreshAssetsStepCandidate } from "@/lib/comic-v3/assets-step";

export const runtime = "nodejs";

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
  const url = typeof body?.url === "string" ? body.url : "";
  if (!url) return NextResponse.json({ error: "url 必填" }, { status: 400 });

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

  let candidates: Array<{ url: string }> = [];
  if (asset.candidates) {
    try {
      candidates = JSON.parse(asset.candidates);
    } catch {
      /* ignore */
    }
  }
  if (!candidates.some((c) => c.url === url)) {
    return NextResponse.json({ error: "该 url 不在候选列表中" }, { status: 400 });
  }

  await prisma.comicAssetV3.update({
    where: { id: assetId },
    data: { pickedUrl: url, genStatus: "awaiting_pick" },
  });

  await refreshAssetsStepCandidate(id);

  return NextResponse.json({ ok: true });
}
