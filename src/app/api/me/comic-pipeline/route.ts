/**
 * 用户级解说漫剧管线（导演台用）
 *
 * GET  /api/me/comic-pipeline
 *   返回 {
 *     effective,        // 最终生效（user override > global）
 *     global,           // 全局默认（admin 设的）
 *     userOverrides,    // 该用户当前的私有覆盖项（key→slug）
 *     options: { llm, tts, image, video },  // 可选模型清单
 *   }
 *
 * POST /api/me/comic-pipeline
 *   body: { llmSlug?, ttsSlug?, imageSlug?, videoSlug? }
 *   - 字段是非空字符串 → 设置/覆盖
 *   - 字段是空字符串    → 清除该字段的用户覆盖（恢复全局）
 *   - 字段未传          → 不动
 *   返回最新的 detailed 状态
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getUserComicPipelineDetailed,
  setUserComicPipeline,
} from "@/lib/comic-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listModelOptions(type: "chat" | "image" | "video" | "audio") {
  const rows = await prisma.model.findMany({
    where: { type, enabled: true },
    select: { slug: true, name: true, provider: { select: { name: true, logo: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    provider: r.provider.name,
    logo: r.provider.logo || "",
  }));
}

export async function GET() {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const [detailed, llm, tts, image, video] = await Promise.all([
    getUserComicPipelineDetailed(session.id),
    listModelOptions("chat"),
    listModelOptions("audio"),
    listModelOptions("image"),
    listModelOptions("video"),
  ]);
  return NextResponse.json({
    ...detailed,
    options: { llm, tts, image, video },
  });
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体非法" }, { status: 400 });
  }

  // 防御：用户传过来的 slug 必须真实存在 + 类型匹配（否则提交后 chargeUsage 会炸）
  const checks: { field: "llmSlug" | "ttsSlug" | "imageSlug" | "videoSlug"; type: "chat" | "audio" | "image" | "video" }[] = [
    { field: "llmSlug",   type: "chat"  },
    { field: "ttsSlug",   type: "audio" },
    { field: "imageSlug", type: "image" },
    { field: "videoSlug", type: "video" },
  ];
  for (const c of checks) {
    const v = (body as any)[c.field];
    if (typeof v === "string" && v.trim() !== "") {
      const m = await prisma.model.findUnique({ where: { slug: v.trim() } });
      if (!m || m.type !== c.type || !m.enabled) {
        return NextResponse.json(
          { error: `${c.field} 指定的模型 '${v}' 不存在或类型不匹配（要求 ${c.type}）` },
          { status: 400 },
        );
      }
    }
  }

  await setUserComicPipeline(session.id, {
    llmSlug:   typeof body.llmSlug   === "string" ? body.llmSlug   : undefined,
    ttsSlug:   typeof body.ttsSlug   === "string" ? body.ttsSlug   : undefined,
    imageSlug: typeof body.imageSlug === "string" ? body.imageSlug : undefined,
    videoSlug: typeof body.videoSlug === "string" ? body.videoSlug : undefined,
  });
  const detailed = await getUserComicPipelineDetailed(session.id);
  return NextResponse.json(detailed);
}
