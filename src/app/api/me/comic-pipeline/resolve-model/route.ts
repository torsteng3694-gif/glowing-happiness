/**
 * GET /api/me/comic-pipeline/resolve-model?slug=xxx
 *   把模型 slug 反查成 modelId，用于解说漫剧导演台前端调用
 *   /api/image / /api/audio/tts / /api/video（这些接口要的是 modelId，不是 slug）。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("slug") || "").trim();
  if (!slug) {
    return NextResponse.json({ error: "slug 必填" }, { status: 400 });
  }

  const m = await prisma.model.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, type: true, enabled: true },
  });
  if (!m) {
    return NextResponse.json({ error: `model ${slug} 不存在` }, { status: 404 });
  }
  if (!m.enabled) {
    return NextResponse.json({ error: `model ${slug} 已禁用` }, { status: 400 });
  }
  return NextResponse.json(m);
}
