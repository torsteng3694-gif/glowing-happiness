import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/media
 * 列出当前用户的作品（图片 / 视频 / 音频），支持按类型筛选与分页
 *
 * Query params:
 *   - type   all | image | video | audio（默认 all；与 favorite=1 联用可筛「收藏」）
 *   - limit  1-60（默认 24）
 *   - offset 跳过条数（默认 0）
 *   - favorite=1  仅收藏（前端「灵感」页签）
 *
 * 响应 counts 含 all/image/video/audio/inspiration，其中 inspiration = 已收藏条数
 */
export async function GET(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "all";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "24"), 1), 60);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
  const onlyFav = url.searchParams.get("favorite") === "1";

  const where: any = { userId: session.id, deletedAt: null };
  if (["image", "video", "audio"].includes(type)) where.type = type;
  if (onlyFav) where.favorite = true;

  const [items, total, counts, inspirationTotal] = await Promise.all([
    prisma.mediaAsset.findMany({
      where, orderBy: { createdAt: "desc" }, take: limit, skip: offset,
      include: {
        model: { select: { name: true, slug: true, provider: { select: { logo: true, name: true } } } },
      },
    }),
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.groupBy({
      by: ["type"],
      where: { userId: session.id, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.mediaAsset.count({
      where: { userId: session.id, deletedAt: null, favorite: true },
    }),
  ]);

  const countsMap: Record<string, number> = { all: 0, image: 0, video: 0, audio: 0, inspiration: inspirationTotal };
  for (const c of counts) {
    countsMap[c.type] = c._count._all;
    countsMap.all += c._count._all;
  }

  return NextResponse.json({
    items: items.map((a) => {
      const parsed = a.params ? safeJson(a.params) : null;
      const source = parsed && typeof parsed.source === "string" ? parsed.source : null;
      const sourceLabel =
        parsed && typeof parsed.sourceLabel === "string"
          ? parsed.sourceLabel
          : source === "comic-auto:render" || source === "comic-auto:generate"
            ? "自动漫画智能体"
            : null;
      const batchId = parsed && typeof parsed.batchId === "string" ? parsed.batchId : null;
      return {
      id: a.id,
      type: a.type,
      url: a.url,
      thumbnail_url: a.thumbnailUrl,
      prompt: a.prompt,
      params: parsed,
      cost: a.cost,
      favorite: a.favorite,
      duration_sec: a.durationSec,
      task_id: a.taskId,
      model_name: a.model?.name || null,
      model_slug: a.model?.slug || null,
      provider_logo: a.model?.provider?.logo || null,
      provider_name: a.model?.provider?.name || null,
      source,
      source_label: sourceLabel,
      batch_id: batchId,
      created_at: a.createdAt,
    };
    }),
    total,
    counts: countsMap,
    limit,
    offset,
    has_more: offset + items.length < total,
  });
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
