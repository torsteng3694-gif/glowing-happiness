import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { enqueueTask, refundTask } from "@/lib/task-runner";
import { isFailure, isFinal } from "@/lib/task-status";

/**
 * PATCH /api/admin/tasks/:id
 * body:
 *   { action: "retry" }                   重新跑（只限终态任务）
 *   { action: "refund" }                  手动退款（未退款的失败任务）
 *   { action: "cancel" }                  强制取消（设为 cancelled）
 *   { action: "set", status: "xxx" }      手动设置 raw status
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }

  const { id } = await params;
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid)) return NextResponse.json({ error: "id 非法" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  const task = await prisma.task.findUnique({ where: { id: tid } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  if (action === "retry") {
    if (!isFinal(task.status)) return NextResponse.json({ error: "仅终态任务可重试" }, { status: 400 });
    await prisma.task.update({
      where: { id: tid },
      data: {
        status: "creating", progress: 0, errorMessage: null, resultUrls: null,
        startedAt: null, finishedAt: null,
      },
    });
    enqueueTask(tid);
    return NextResponse.json({ ok: true });
  }

  if (action === "refund") {
    if (!isFailure(task.status)) return NextResponse.json({ error: "仅失败任务可退款" }, { status: 400 });
    if (task.refunded) return NextResponse.json({ error: "已退款过" }, { status: 400 });
    await refundTask(tid);
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    await prisma.task.update({
      where: { id: tid },
      data: { status: "cancelled", finishedAt: new Date(), progress: 100 },
    });
    if (task.cost > 0 && !task.refunded) await refundTask(tid);
    return NextResponse.json({ ok: true });
  }

  if (action === "set") {
    const status = String(body.status || "");
    if (!status) return NextResponse.json({ error: "status 必填" }, { status: 400 });
    await prisma.task.update({
      where: { id: tid },
      data: { status, updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action 非法" }, { status: 400 });
}
