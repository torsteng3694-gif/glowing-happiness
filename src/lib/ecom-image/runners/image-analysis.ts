/**
 * 节点 03 · 图片内容分析 runner
 *
 * 两种模式：
 *   1) 全量：sourceImageId 为空 → 并发 5 解析所有图（excluded 的跳过）
 *   2) 单图：sourceImageId 指定 → 只解析这一张（带 feedback 重写）
 *
 * 写入：
 *   - 每张 EcomSourceImage.title / description / analyzeStatus
 *   - 节点 output = { items: [{sourceImageId, title, description}] }
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { NODE_KEYS } from "../nodes";
import { ImageAnalysisOutputSchema } from "../schemas";
import { callVisionJson } from "../vision";
import { IMAGE_ANALYSIS_SYSTEM, buildImageAnalysisUser, META_TAGS } from "../prompts";

const SingleAnalysisSchema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().min(5),
});

const CONCURRENCY = 5;

export interface RunImageAnalysisOpts {
  projectId: string;
  userId: string;
  modelSlug: string;
  /** 不传 = 解析所有；传 = 只解析这一张 */
  sourceImageId?: string;
  feedback?: string | null;
}

export async function runImageAnalysis(opts: RunImageAnalysisOpts) {
  const { projectId, userId, modelSlug, sourceImageId, feedback } = opts;

  const project = await prisma.ecomProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("项目不存在");

  // 1. 选目标图
  const targets = sourceImageId
    ? await prisma.ecomSourceImage.findMany({
        where: { id: sourceImageId, projectId },
      })
    : await prisma.ecomSourceImage.findMany({
        where: { projectId, analyzeStatus: { not: "excluded" } },
        orderBy: { orderIdx: "asc" },
      });
  if (targets.length === 0) throw new Error("没有需要分析的图片");

  // 2. 全部置 running
  await prisma.ecomSourceImage.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { analyzeStatus: "running", analyzeError: null },
  });

  // 3. 并发 N 调用 vision
  const queue = [...targets];
  const inFlight: Promise<void>[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  const worker = async (img: (typeof targets)[number]) => {
    try {
      const r = await callVisionJson({
        userId,
        modelSlug,
        system: IMAGE_ANALYSIS_SYSTEM,
        userText: buildImageAnalysisUser({
          initialPrompt: project.initialPrompt,
          feedback,
        }),
        imageUrls: [img.url],
        imageDetail: "high",
        schema: SingleAnalysisSchema,
        metaTag: META_TAGS[NODE_KEYS.IMAGE_ANALYSIS],
        maxTokens: 2000, // 中文描述偶发截断，给宽裕一点
      });
      await prisma.ecomSourceImage.update({
        where: { id: img.id },
        data: {
          title: r.data.title,
          description: r.data.description,
          analyzeStatus: "done",
          analyzeRunCount: { increment: 1 },
          analyzeError: null,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ id: img.id, error: msg });
      await prisma.ecomSourceImage.update({
        where: { id: img.id },
        data: {
          analyzeStatus: "failed",
          analyzeRunCount: { increment: 1 },
          analyzeError: msg.slice(0, 500),
        },
      });
    }
  };

  while (queue.length > 0 || inFlight.length > 0) {
    while (inFlight.length < CONCURRENCY && queue.length > 0) {
      const img = queue.shift()!;
      const p = worker(img).finally(() => {
        const idx = inFlight.indexOf(p);
        if (idx >= 0) inFlight.splice(idx, 1);
      });
      inFlight.push(p);
    }
    if (inFlight.length > 0) await Promise.race(inFlight);
  }

  // 4. 重新拉取所有 done 图，写节点 output
  const done = await prisma.ecomSourceImage.findMany({
    where: { projectId, analyzeStatus: "done" },
    orderBy: { orderIdx: "asc" },
  });
  const output = ImageAnalysisOutputSchema.parse({
    items: done.map((d) => ({
      sourceImageId: d.id,
      title: d.title ?? "",
      description: d.description ?? "",
    })),
  });
  await prisma.ecomProjectNode.update({
    where: { projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.IMAGE_ANALYSIS } },
    data: { output: JSON.stringify(output) },
  });

  // 全部失败 → 抛错
  if (errors.length === targets.length) {
    throw new Error(`图片解析全部失败：${errors[0].error}`);
  }
}
