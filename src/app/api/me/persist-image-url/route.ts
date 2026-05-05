/**
 * POST /api/me/persist-image-url
 *   把任意上游临时图片 URL 转存到 COS（如启用），返回永久 URL。
 *
 *   body: { url: string, dir?: string }
 *   resp: { url: string, persisted: boolean }
 *
 *   - 已经是自家 COS 的 URL：原样返回
 *   - 没有启用 COS：原样返回（标记 persisted=false）
 *   - 转存失败：原样返回（标记 persisted=false），不阻塞前端流程
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isCosEnabled, cosUploadFromUrl } from "@/lib/cos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const dir = typeof body?.dir === "string" && body.dir.trim() ? body.dir.trim() : `ai-hub/comic-assets/${session.id}`;
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "url 必须是 http(s) 链接" }, { status: 400 });
  }

  if (!isCosEnabled()) {
    return NextResponse.json({ url, persisted: false });
  }

  try {
    const cos = await cosUploadFromUrl(url, { dir });
    if (!cos) {
      return NextResponse.json({ url, persisted: false });
    }
    return NextResponse.json({ url: cos, persisted: true });
  } catch (e) {
    console.error("[persist-image-url] failed:", e);
    return NextResponse.json({ url, persisted: false });
  }
}
