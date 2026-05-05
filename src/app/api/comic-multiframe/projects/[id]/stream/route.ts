/**
 * 项目进度 SSE 流（智能托管模式下前端订阅用）
 *
 *   GET /api/comic-multiframe/projects/:id/stream
 *
 * 简单实现：每秒轮询 DB，推送 project + steps 概要；项目变 final 状态后关闭。
 */

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isProjectRunning } from "@/lib/comic-agent/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await params;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      let lastSig = "";
      let stopped = false;
      const tick = async () => {
        if (stopped) return;
        const project = await prisma.comicProject.findUnique({
          where: { id },
          include: { steps: { orderBy: { stepIndex: "asc" } } },
        });
        if (!project || project.userId !== session.id) {
          send("error", { error: "项目不存在" });
          controller.close();
          return;
        }
        // 签名只看影响渲染的少量字段，避免 output/artifacts 大字段每次都参与 stringify
        const sig = JSON.stringify({
          status: project.status,
          progress: project.progress,
          currentStep: project.currentStep,
          totalCost: project.totalCost,
          steps: project.steps.map((s) => ({ k: s.stepKey, s: s.status, p: s.progress, c: s.cost })),
        });
        if (sig !== lastSig) {
          lastSig = sig;
          send("update", {
            id: project.id,
            status: project.status,
            progress: project.progress,
            currentStep: project.currentStep,
            totalCost: project.totalCost,
            isRunning: isProjectRunning(project.id),
            steps: project.steps.map((s) => ({
              stepKey: s.stepKey,
              status: s.status,
              progress: s.progress,
              cost: s.cost,
              errorMessage: s.errorMessage,
              // 把产物一并推到前端，让 UI 直接渲染（避免每步完成后都需要单独 fetch）
              output: s.output ? safeParseOrNull(s.output) : null,
              artifacts: s.artifacts ? safeParseOrNull(s.artifacts) : null,
            })),
            finalVideoUrl: project.finalVideoUrl,
            coverUrl: project.coverUrl,
          });
        }
        // 仅终态才关闭 SSE：completed / failed
        // draft / running / paused 全保持连接，
        // 这样逐步模式下用户每次手动点"执行下一步"，下一秒 tick 就能推送新签名
        if (project.status === "completed" || project.status === "failed") {
          send("done", { status: project.status });
          stopped = true;
          controller.close();
          return;
        }
      };

      send("hello", { ok: true });
      await tick();
      const handle = setInterval(tick, 1000);
      // 关闭时清理
      const close = () => {
        clearInterval(handle);
        stopped = true;
      };
      // ReadableStream 没有 cancel 直接事件，依靠 controller.close 后 setInterval 在 tick 中检测 stopped 自然退出
      // 这里也兜底设置一个最大 30 分钟超时
      setTimeout(close, 30 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function safeParseOrNull(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
