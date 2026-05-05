/**
 * 查询解说剧成片任务状态。
 *
 * GET /api/explain-comic/{taskId}
 *
 * - 默认从本地 Task 表读
 * - 若 Task 还未到终态：触发一次"被动刷新"——回源 Vidu 查任务状态，把结果写回本地
 *   - 若 Vidu 返回 success / failed → 直接走结算（与 callback 同一函数路径）
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { toStatusShape, isFinal } from "@/lib/task-status";
import { viduQueryTask } from "@/lib/providers/vidu";
import { toUpstreamConfig } from "@/lib/upstream";
import { settleExplainComic } from "@/lib/explain-comic-settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "id 非法" }, { status: 400 });
  }

  let task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (task.userId !== session.id) {
    return NextResponse.json({ error: "无权查看该任务" }, { status: 403 });
  }

  // 已是终态：直接返
  if (isFinal(task.status)) {
    return NextResponse.json(toStatusShape(task));
  }

  // 非终态：尝试回源刷新一次（失败不影响接口本身——保留原状态返回）
  if (task.externalId && task.channelId) {
    const channel = await prisma.channel.findUnique({
      where: { id: task.channelId },
      include: { upstream: true },
    });
    if (channel) {
      try {
        const cfg = {
          ...toUpstreamConfig(channel.upstream),
          apiKey: (channel.apiKey && channel.apiKey.trim()) || channel.upstream.apiKey,
        };
        const r = await viduQueryTask(task.externalId, cfg);
        task = await settleExplainComic({
          taskId: task.id,
          status: r.status,
          progress: r.progress,
          videoUrl: r.videoUrl,
          coverUrl: r.coverUrl,
          durationSec: r.durationSec,
          errorMessage: r.errorMessage,
        });
      } catch (e) {
        console.warn("[explain-comic][query] refresh failed:", e);
      }
    }
  }

  return NextResponse.json(toStatusShape(task));
}
