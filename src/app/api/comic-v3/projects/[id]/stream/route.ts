/**
 * AI 漫剧 · S3.0 — 项目进度 SSE 流
 *
 *   GET /api/comic-v3/projects/:id/stream
 *
 * 推送：每秒轮询 DB，包含 v3 特有字段（candidates / pickedCandidateId / outputMd / userEdits）
 * 终态（completed / failed）后关闭连接。
 */

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isProjectRunningV3 } from "@/lib/comic-v3/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

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
        const project = await prisma.comicProjectV3.findUnique({
          where: { id },
          include: {
            steps: { orderBy: { stepIndex: "asc" } },
            assets: { orderBy: { orderIdx: "asc" } },
            shots: { orderBy: { shotIndex: "asc" } },
          },
        });
        if (!project || project.userId !== session.id) {
          send("error", { error: "项目不存在" });
          controller.close();
          return;
        }
        const sig = JSON.stringify({
          status: project.status,
          progress: project.progress,
          currentStep: project.currentStep,
          totalCost: project.totalCost,
          steps: project.steps.map((s) => ({
            k: s.stepKey,
            s: s.status,
            p: s.progress,
            c: s.cost,
            pid: s.pickedCandidateId,
            // 包含 candidates / userEdits 的"指纹"避免大字段每次序列化
            ch: s.candidates ? s.candidates.length : 0,
            eh: s.userEdits ? s.userEdits.length : 0,
          })),
          assetsCount: project.assets.length,
          shotsSig: project.shots.map((s) => `${s.shotIndex}:${s.genStatus}:${s.keyframeUrl ? 1 : 0}`).join("|"),
        });
        if (sig !== lastSig) {
          lastSig = sig;
          const isRunning = await isProjectRunningV3(project.id);
          send("update", {
            id: project.id,
            status: project.status,
            progress: project.progress,
            currentStep: project.currentStep,
            totalCost: project.totalCost,
            isRunning,
            steps: project.steps.map((s) => ({
              stepKey: s.stepKey,
              stepIndex: s.stepIndex,
              status: s.status,
              progress: s.progress,
              cost: s.cost,
              errorMessage: s.errorMessage,
              candidates: s.candidates ? safeParseOrNull(s.candidates) : null,
              pickedCandidateId: s.pickedCandidateId,
              userEdits: s.userEdits ? safeParseOrNull(s.userEdits) : null,
              output: s.output ? safeParseOrNull(s.output) : null,
              outputMd: s.outputMd,
              artifacts: s.artifacts ? safeParseOrNull(s.artifacts) : null,
              runCount: s.runCount,
            })),
            assets: project.assets.map((a) => ({
              id: a.id,
              type: a.type,
              name: a.name,
              description: a.description,
              candidates: a.candidates ? safeParseOrNull(a.candidates) : null,
              pickedUrl: a.pickedUrl,
              visualAnchor: a.visualAnchor,
              imagePrompt: a.imagePrompt,
              negativePrompt: a.negativePrompt,
              imageModelOverride: a.imageModelOverride,
              genStatus: a.genStatus,
              genError: a.genError,
            })),
            shots: project.shots.map((s) => ({
              id: s.id,
              shotIndex: s.shotIndex,
              sceneIndex: s.sceneIndex,
              shotType: s.shotType,
              cameraMove: s.cameraMove,
              durationSec: s.durationSec,
              imagePrompt: s.imagePrompt,
              motionHint: s.motionHint,
              dialogue: s.dialogue,
              assetIds: s.assetIds ? safeParseOrNull(s.assetIds) : [],
              keyframeUrl: s.keyframeUrl,
              negativePrompt: s.negativePrompt,
              imageModelOverride: s.imageModelOverride,
              genStatus: s.genStatus,
              genError: s.genError,
            })),
            finalVideoUrl: project.finalVideoUrl,
            coverUrl: project.coverUrl,
          });
        }
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
      const close = () => {
        clearInterval(handle);
        stopped = true;
      };
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
