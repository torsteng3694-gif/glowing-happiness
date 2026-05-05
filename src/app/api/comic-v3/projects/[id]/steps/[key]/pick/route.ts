/**
 * AI 漫剧 · S3.0 — 用户从候选里挑选
 *
 *   POST /api/comic-v3/projects/:id/steps/:key/pick
 *   body: { candidateId: string }
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { pickCandidate } from "@/lib/comic-v3/interactive";

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
  if (typeof body?.candidateId !== "string" || !body.candidateId) {
    return NextResponse.json({ error: "candidateId 必填" }, { status: 400 });
  }

  try {
    const r = await pickCandidate({
      userId: session.id,
      projectId: id,
      stepKey: key,
      candidateId: body.candidateId,
    });
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
