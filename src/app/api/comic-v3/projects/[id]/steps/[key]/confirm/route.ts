/**
 * AI 漫剧 · S3.0 — 确认本步并推进
 *
 *   POST /api/comic-v3/projects/:id/steps/:key/confirm
 *   body: { auto?: boolean }  // auto=true 时确认后立刻起后台 runner
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { confirmStep } from "@/lib/comic-v3/interactive";
import { runProjectAutoV3 } from "@/lib/comic-v3/engine";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; key: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id, key } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  try {
    const r = await confirmStep({
      userId: session.id,
      projectId: id,
      stepKey: key,
    });
    if (body?.auto) {
      await runProjectAutoV3({ userId: session.id, projectId: id });
    }
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
