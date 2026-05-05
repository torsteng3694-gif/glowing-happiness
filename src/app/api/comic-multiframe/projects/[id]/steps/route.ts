/**
 *   POST /api/comic-multiframe/projects/:id/steps
 *     body: { action: "run" | "skip" | "auto", stepKey?: string }
 *
 *   - action=run    执行下一步（或指定 stepKey），同步等结果（注意可能耗时较长）
 *   - action=skip   跳过指定 stepKey（仅 canSkip=true 的步骤）
 *   - action=auto   开启智能托管（后台 runner，立即返回）
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runOneStep, skipOneStep, runProjectAuto } from "@/lib/comic-agent/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 单步可能跑很久（关键帧 / 视频）
export const maxDuration = ;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action: string = typeof body.action === "string" ? body.action : "run";
  const stepKey: string | undefined =
    typeof body.stepKey === "string" && body.stepKey ? body.stepKey : undefined;

  try {
    if (action === "skip") {
      if (!stepKey) return NextResponse.json({ error: "stepKey 必填" }, { status: 400 });
      const r = await skipOneStep({ userId: session.id, projectId: id, stepKey });
      return NextResponse.json({ ok: true, ...r });
    }
    if (action === "auto") {
      const r = await runProjectAuto({
        userId: session.id,
        projectId: id,
        policy: body.autoPolicy && typeof body.autoPolicy === "object" ? body.autoPolicy : null,
      });
      return NextResponse.json({ ok: true, ...r });
    }
    // default: run one step
    const r = await runOneStep({ userId: session.id, projectId: id, stepKey });
    return NextResponse.json({
      ok: true,
      stepKey: r.stepKey,
      cost: r.result.cost,
      output: r.result.output,
      artifacts: r.result.artifacts ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
