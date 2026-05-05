/**
 * AI 漫剧 · S3.0 — 用户对所选候选做字段级修改（patch）
 *
 *   POST /api/comic-v3/projects/:id/steps/:key/edit
 *   body: { patch: object }
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { editPicked } from "@/lib/comic-v3/interactive";

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
  if (!body?.patch || typeof body.patch !== "object") {
    return NextResponse.json({ error: "patch 必须是对象" }, { status: 400 });
  }

  try {
    const r = await editPicked({
      userId: session.id,
      projectId: id,
      stepKey: key,
      patch: body.patch as Record<string, unknown>,
    });
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
