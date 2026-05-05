/**
 * AI 漫剧 · S3.0 — 跳过单步
 *
 *   POST /api/comic-v3/projects/:id/steps/:key/skip
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { skipStep } from "@/lib/comic-v3/interactive";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; key: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id, key } = await ctx.params;
  try {
    const r = await skipStep({ userId: session.id, projectId: id, stepKey: key });
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
