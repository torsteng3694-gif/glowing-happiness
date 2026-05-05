/**
 * explain-comic 任务状态推进 + 终态结算
 *
 * 调用方：
 *   - 回调路由（POST /api/explain-comic/callback）
 *   - 查询路由非终态时主动回源（GET /api/explain-comic/[id]）
 *
 * 计费规则：
 *   - submitted/processing → 只更新 status / progress，不扣费
 *   - success → 按 Vidu 返回的真实 durationSec × channel.sellUnitPrice 走 chargeUsage 结算 + saveMediaAssets
 *   - failed → 不扣费（cost=0），写错误消息
 *
 * 幂等：
 *   - 已处于终态的 Task 不再变更（避免回调多发导致重复扣费）
 */

import { prisma } from "./db";
import { isFinal, isSuccess, isFailure } from "./task-status";
import { chargeUsage } from "./billing";
import { saveMediaAssets } from "./media-assets";
import { isCosEnabled, cosUploadFromUrl } from "./cos";
import type { Task } from "@prisma/client";

export type SettleInput = {
  taskId: number;
  /** Vidu 规范化后的状态：submitted / processing / success / failed / queueing / created … */
  status: string;
  progress?: number;
  videoUrl?: string;
  coverUrl?: string;
  durationSec?: number;
  errorMessage?: string;
};

export async function settleExplainComic(input: SettleInput): Promise<Task> {
  const existing = await prisma.task.findUnique({ where: { id: input.taskId } });
  if (!existing) throw new Error(`task ${input.taskId} 不存在`);

  // 幂等：已终态通常直接返回；例外——已成功但「我的作品」未入库且本次拿到了视频 URL，允许补写入库
  if (isFinal(existing.status)) {
    const filled = await maybeBackfillExplainComicGallery(existing, input);
    return filled;
  }

  const newStatus = input.status || existing.status;

  // 进行中 / 等待中：仅更新 status + progress
  if (!isFinal(newStatus)) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        status: newStatus,
        progress: typeof input.progress === "number" ? input.progress : existing.progress,
      },
    });
  }

  // 失败终态：写错误，不扣费
  if (isFailure(newStatus)) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        status: "failed",
        progress: 0,
        errorMessage: input.errorMessage || "任务失败",
        finishedAt: new Date(),
      },
    });
  }

  if (!isSuccess(newStatus)) {
    console.warn("[explain-comic][settle] unexpected final status:", newStatus);
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        status: newStatus,
        progress: typeof input.progress === "number" ? input.progress : existing.progress,
        finishedAt: new Date(),
      },
    });
  }

  return finalizeExplainComicSuccess(existing, input, { charge: true });
}

/** 已成功落库但首次未写入 MediaAsset（例如 Vidu 字段解析遗漏）时，由后续回调/轮询补全 */
async function maybeBackfillExplainComicGallery(existing: Task, input: SettleInput): Promise<Task> {
  const videoIn = (input.videoUrl || "").trim();
  if (!isSuccess(existing.status) || !videoIn) return existing;

  const already = await prisma.mediaAsset.count({
    where: { userId: existing.userId, taskId: existing.id, type: "video", deletedAt: null },
  });
  if (already > 0) return existing;

  return finalizeExplainComicSuccess(existing, input, { charge: false });
}

async function finalizeExplainComicSuccess(
  existing: Task,
  input: SettleInput,
  opts: { charge: boolean },
): Promise<Task> {
  const durationSec = Math.max(1, Math.round(input.durationSec || 0));
  let cost = existing.cost || 0;
  let realCost = existing.realCost || 0;

  if (opts.charge && durationSec > 0 && existing.modelId) {
    try {
      const billing = await chargeUsage({
        userId: existing.userId,
        modelId: existing.modelId,
        channelId: existing.channelId,
        type: "video",
        units: durationSec,
        meta: {
          source: "explain-comic",
          externalId: existing.externalId,
          taskId: existing.id,
          videoUrl: input.videoUrl,
        },
      });
      cost = billing.cost;
      realCost = billing.realCost;
    } catch (e) {
      console.error("[explain-comic][settle] chargeUsage failed:", e);
    }
  }

  let persistedVideoUrl = input.videoUrl || "";
  let persistedCoverUrl = input.coverUrl || "";
  if (isCosEnabled()) {
    const dir = `ai-hub/explain-comic/${existing.userId}`;
    if (persistedVideoUrl) {
      try {
        const cos = await cosUploadFromUrl(persistedVideoUrl, { dir });
        if (cos) persistedVideoUrl = cos;
      } catch (e) {
        console.error("[explain-comic][settle] cos upload video failed:", e);
      }
    }
    if (persistedCoverUrl) {
      try {
        const cos = await cosUploadFromUrl(persistedCoverUrl, { dir });
        if (cos) persistedCoverUrl = cos;
      } catch (e) {
        console.error("[explain-comic][settle] cos upload cover failed:", e);
      }
    }
  }

  const urls = persistedVideoUrl ? [persistedVideoUrl] : [];
  const data: Parameters<typeof prisma.task.update>[0]["data"] = {
    status: "success",
    progress: 100,
    resultUrls: urls.length > 0 ? JSON.stringify(urls) : null,
    finishedAt: existing.finishedAt || new Date(),
  };
  if (opts.charge) {
    data.cost = cost;
    data.realCost = realCost;
  }

  const updated = await prisma.task.update({
    where: { id: existing.id },
    data,
  });

  if (urls.length > 0) {
    try {
      await saveMediaAssets({
        userId: existing.userId,
        modelId: existing.modelId,
        taskId: existing.id,
        type: "video",
        urls,
        prompt: existing.prompt,
        params: existing.params ? safeParseJson(existing.params) : undefined,
        totalCost: opts.charge ? cost : existing.cost || 0,
        thumbnailUrl: persistedCoverUrl || null,
        durationSec,
      });
    } catch (e) {
      console.error("[explain-comic][settle] saveMediaAssets failed:", e);
    }
  }

  return updated;
}

function safeParseJson(s: string): Record<string, any> | undefined {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : undefined;
  } catch {
    return undefined;
  }
}
