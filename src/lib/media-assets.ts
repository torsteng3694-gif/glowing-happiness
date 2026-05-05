import { prisma } from "./db";

/**
 * 把一次成功生成的结果持久化到 MediaAsset，供「个人中心 · 我的作品」显示。
 *
 * 三个入口都会用到：
 *   - task-runner（异步 image/video/audio 任务完成时）
 *   - /api/image（同步图片生成）
 *   - /api/video（同步视频生成）
 */
export type SaveMediaInput = {
  userId: string;
  modelId?: string | null;
  taskId?: number | null;
  type: "image" | "video" | "audio";
  urls: string[];
  prompt?: string | null;
  params?: Record<string, any> | null;
  /** 该批资产的总成本；内部会平均分摊到每张 */
  totalCost?: number;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
};

export async function saveMediaAssets(input: SaveMediaInput): Promise<number> {
  const urls = (input.urls || []).filter((u) => typeof u === "string" && u.startsWith("http"));
  if (urls.length === 0) return 0;

  const per = urls.length > 0 ? (input.totalCost || 0) / urls.length : 0;
  const promptShort = input.prompt ? input.prompt.slice(0, 400) : null;
  const paramsJson = input.params ? JSON.stringify(input.params) : null;

  await prisma.mediaAsset.createMany({
    data: urls.map((url) => ({
      userId: input.userId,
      modelId: input.modelId || null,
      taskId: input.taskId ?? null,
      type: input.type,
      url,
      thumbnailUrl: input.thumbnailUrl || null,
      prompt: promptShort,
      params: paramsJson,
      cost: Number(per.toFixed(6)),
      durationSec: input.durationSec ?? null,
    })),
  });
  return urls.length;
}
