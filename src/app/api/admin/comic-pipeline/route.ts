/**
 * GET  /api/admin/comic-pipeline   读取当前管线设置
 * POST /api/admin/comic-pipeline   保存管线设置
 *
 * 返回里附带各类型可选模型清单（chat / audio / image / video），方便前端做 dropdown。
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getComicPipeline, setComicPipeline, DEFAULT_PIPELINE } from "@/lib/comic-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listModelOptions(type: "chat" | "image" | "video" | "audio") {
  const rows = await prisma.model.findMany({
    where: { type, enabled: true },
    select: { slug: true, name: true, provider: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ slug: r.slug, label: `${r.name}（${r.provider.name}）` }));
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }
  const [current, llms, ttss, images, videos] = await Promise.all([
    getComicPipeline(),
    listModelOptions("chat"),
    listModelOptions("audio"),
    listModelOptions("image"),
    listModelOptions("video"),
  ]);
  return NextResponse.json({
    current,
    defaults: DEFAULT_PIPELINE,
    options: { llm: llms, tts: ttss, image: images, video: videos },
  });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体非法" }, { status: 400 });
  }
  await setComicPipeline({
    llmSlug:   typeof body.llmSlug   === "string" ? body.llmSlug   : undefined,
    ttsSlug:   typeof body.ttsSlug   === "string" ? body.ttsSlug   : undefined,
    imageSlug: typeof body.imageSlug === "string" ? body.imageSlug : undefined,
    videoSlug: typeof body.videoSlug === "string" ? body.videoSlug : undefined,
  });
  return NextResponse.json({ ok: true, current: await getComicPipeline() });
}
