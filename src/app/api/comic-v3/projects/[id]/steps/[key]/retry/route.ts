/**
 * AI 漫剧 · S3.0 — 重跑当前步（候选 / 编辑 / output 都会清空，再次扣费）
 *
 *   POST /api/comic-v3/projects/:id/steps/:key/retry
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { retryStep } from "@/lib/comic-v3/interactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const r = await retryStep({ userId: session.id, projectId: id, stepKey: key });
    return NextResponse.json({ stepKey: r.stepKey, status: r.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
