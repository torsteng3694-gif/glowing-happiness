/**
 * AI 漫剧 · S3.0 — 执行单步
 *
 *   POST /api/comic-v3/projects/:id/steps/:key/run
 *
 *   body: { auto?: boolean }
 *     auto=true 时不仅跑 :key 这一步，本步成功后还会启动 runProjectAutoV3 继续往后跑
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runOneStepV3, runProjectAutoV3 } from "@/lib/comic-v3/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const cont = !!body?.auto;

  try {
    const result = await runOneStepV3({
      userId: session.id,
      projectId: id,
      stepKey: key,
    });

    // 当前步成功且未暂停 → 可选地启动后台连跑
    if (cont && result.status === "succeeded") {
      await runProjectAutoV3({ userId: session.id, projectId: id });
    }

    return NextResponse.json({
      stepKey: result.stepKey,
      status: result.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
