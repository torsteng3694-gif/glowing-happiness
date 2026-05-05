import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, extractApiKey } from "@/lib/auth";
import { toStatusShape } from "@/lib/task-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /v1/media/status?id=xxx
 * 查询媒体任务状态。返回 is_final=true 表示终态，可停止轮询。
 *
 * 鉴权：Bearer / x-api-key / x-goog-api-key / ?key=
 */
export async function GET(req: Request) {
  if (!extractApiKey(req)) {
    return NextResponse.json({ error: { message: "missing api key", code: "unauthorized" } }, { status: 401 });
  }
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json({ error: { message: "invalid api key", code: "unauthorized" } }, { status: 401 });
  }

  const url = new URL(req.url);
  const idRaw = url.searchParams.get("id") || url.searchParams.get("task_id");
  if (!idRaw) {
    return NextResponse.json({
      error: { message: "missing required parameter: id", code: "invalid_request" },
    }, { status: 400 });
  }
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    // 按文档：未知任务返回 UNKNOWN + is_final=true
    return NextResponse.json({
      task_id: idRaw,
      status: "UNKNOWN",
      status_label: "任务不存在或状态未知",
      fenzu: "失败",
      group: "failed",
      is_final: true,
      progress: 0,
      result: null,
      error: "invalid id",
    }, { status: 200 });
  }

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json({
      task_id: id,
      status: "UNKNOWN",
      status_label: "任务不存在或状态未知",
      fenzu: "失败",
      group: "failed",
      is_final: true,
      progress: 0,
      result: null,
      error: `task ${id} not found`,
    }, { status: 200 });
  }
  if (task.userId !== user.id) {
    return NextResponse.json({
      error: { message: "you can only view your own tasks", code: "forbidden" },
    }, { status: 403 });
  }

  return NextResponse.json(toStatusShape(task));
}
