/**
 * Step 6. assets_render — 资产渲染（基于 plan 的 imagePrompt 生图）
 *
 * 流程：
 *   1. 拉项目所有 ComicAssetV3 行
 *   2. 跳过已完成（ready / awaiting_pick 且有 candidates）的行 —— 重跑只补缺
 *   3. 对每个待渲染的行：
 *      - 若 imageModelOverride 非空 → 用它
 *      - 否则用项目快照 imageSlug
 *      - 串行 N 候选 + asset 间最多 2 并发（防上游死锁）
 *   4. 写候选到 ComicAssetV3.candidates，pickedUrl 兜底为第 1 张
 *   5. needsConfirm = true：让用户挑图
 */

import { prisma } from "@/lib/db";
import { callImageMulti, runWithConcurrencyLimit } from "../helpers-image";
import {
  AssetsRenderOutputSchema,
  type AssetsRenderOutput,
} from "../schemas";
import { buildCandidate, type RunnerV3 } from "./_shared";

const TYPE_ICON: Record<"character" | "scene" | "prop", string> = {
  character: "👤",
  scene: "🏞️",
  prop: "🎯",
};

export const runAssetsRender: RunnerV3 = async (ctx) => {
  // ====== 1. 拉所有 asset ======
  const assets = await prisma.comicAssetV3.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { orderIdx: "asc" },
  });

  if (assets.length === 0) {
    return {
      candidates: [
        buildCandidate({
          kind: "assets_render",
          data: AssetsRenderOutputSchema.parse({ assets: [] }),
          mdSummary: "### 资产渲染\n无资产可渲染。",
        }),
      ],
      needsConfirm: false,
      cost: 0,
      realCost: 0,
    };
  }

  // ====== 2. 过滤出需要生图的行 ======
  // 以下情况跳过：已 ready；或 candidates 已存在且 pickedUrl 已选定
  type Work = {
    rowId: string;
    name: string;
    type: "character" | "scene" | "prop";
    imagePrompt: string;
    negativePrompt?: string;
    modelSlug: string;
  };
  const works: Work[] = [];
  for (const a of assets) {
    if (!a.imagePrompt) continue; // 没 prompt 跳过
    const hasCandidates = !!a.candidates && safeCountCandidates(a.candidates) > 0;
    if (a.genStatus === "ready" && a.pickedUrl) continue;
    if (a.genStatus === "awaiting_pick" && hasCandidates) continue; // 已生成候选，不重跑
    works.push({
      rowId: a.id,
      name: a.name,
      type: a.type as "character" | "scene" | "prop",
      imagePrompt: a.imagePrompt,
      negativePrompt: a.negativePrompt ?? undefined,
      modelSlug: a.imageModelOverride || ctx.project.imageSlug,
    });
  }

  // ====== 3. 标 generating ======
  if (works.length > 0) {
    await prisma.comicAssetV3.updateMany({
      where: { id: { in: works.map((w) => w.rowId) } },
      data: { genStatus: "generating", genError: null },
    });
  }

  // ====== 4. 限并发生图 ======
  const candCount = Math.max(1, Math.min(5, ctx.policy.assetsCandidatesPerSubject));
  const ASSET_CONCURRENCY = 2;
  let totalCost = 0;
  let totalRealCost = 0;
  let lastImageModel = ctx.project.imageSlug;
  let lastImageChannel: string | null = null;

  await runWithConcurrencyLimit(
    works.map((w) => async () => {
      // 该 asset 已收集到的候选（边出边累积）
      const accCands: Array<{ url: string; prompt: string; modelSlug: string }> = [];
      try {
        const res = await callImageMulti({
          userId: ctx.userId,
          modelSlug: w.modelSlug,
          prompt: w.imagePrompt,
          aspectRatio: ctx.project.aspectRatio,
          rawParams: w.negativePrompt ? { negative_prompt: w.negativePrompt } : undefined,
          metaTag: `comic-v3:assets_render:${w.type}:${w.name}`,
          count: candCount,
          saveAs: { projectId: ctx.projectId, category: "subject", label: w.name },
          onProgress: async (ev) => {
            if (ev.type !== "image") return;
            // 每出一张图：累积到 candidates，立即写 DB（让前端 SSE 能马上看到）
            accCands.push({
              url: ev.url,
              prompt: w.imagePrompt,
              modelSlug: ev.modelSlug,
            });
            try {
              await prisma.comicAssetV3.update({
                where: { id: w.rowId },
                data: {
                  candidates: JSON.stringify(accCands),
                  // 第 1 张就把 pickedUrl 兜底
                  pickedUrl: accCands.length === 1 ? ev.url : undefined,
                  // 仍是 generating，最后才切到 awaiting_pick
                  genStatus: "generating",
                  genError: null,
                },
              });
            } catch (dbErr) {
              console.warn("[assets-render] partial update failed:", dbErr);
            }
          },
        });
        totalCost += res.totalCost;
        totalRealCost += res.totalRealCost;
        lastImageModel = res.modelSlug;
        lastImageChannel = res.channelId;

        // 最终状态：成功有图 → awaiting_pick；全失败 → failed
        if (accCands.length > 0) {
          await prisma.comicAssetV3.update({
            where: { id: w.rowId },
            data: {
              candidates: JSON.stringify(accCands),
              pickedUrl: accCands[0].url,
              genStatus: "awaiting_pick",
              genError:
                res.errors.length > 0
                  ? `部分候选生成失败：${res.errors.length}/${candCount}`
                  : null,
            },
          });
        } else {
          await prisma.comicAssetV3.update({
            where: { id: w.rowId },
            data: {
              genStatus: "failed",
              genError: res.errors.join("；").slice(0, 500) || "全部候选生成失败",
            },
          });
        }
      } catch (e) {
        // 即使 callImageMulti 抛错（极少），已经写入的 accCands 也不会丢
        const finalStatus = accCands.length > 0 ? "awaiting_pick" : "failed";
        await prisma.comicAssetV3.update({
          where: { id: w.rowId },
          data: {
            candidates: accCands.length > 0 ? JSON.stringify(accCands) : undefined,
            pickedUrl: accCands[0]?.url,
            genStatus: finalStatus,
            genError: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }),
    ASSET_CONCURRENCY,
  );

  // ====== 5. 构造产物 ======
  const finalAssets = await prisma.comicAssetV3.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { orderIdx: "asc" },
  });

  const data: AssetsRenderOutput = AssetsRenderOutputSchema.parse({
    assets: finalAssets.map((a) => ({
      id: a.id,
      type: a.type as "character" | "scene" | "prop",
      name: a.name,
      pickedUrl: a.pickedUrl,
      visualAnchor: a.visualAnchor,
      imagePrompt: a.imagePrompt,
    })),
  });

  const failedCount = finalAssets.filter((a) => a.genStatus === "failed").length;
  const okCount = finalAssets.filter(
    (a) => a.genStatus === "awaiting_pick" || a.genStatus === "ready",
  ).length;

  const md = `### 资产渲染

${okCount}/${finalAssets.length} 个资产已生成候选图${failedCount > 0 ? ` · ⚠ ${failedCount} 个失败` : ""}

${finalAssets
  .map((a) => {
    const icon = TYPE_ICON[a.type as "character" | "scene" | "prop"];
    const status =
      a.genStatus === "failed"
        ? "（失败）"
        : a.genStatus === "awaiting_pick"
          ? `（${a.candidates ? safeCountCandidates(a.candidates) : 0} 张候选待挑选）`
          : a.genStatus === "ready"
            ? "（已选定）"
            : a.genStatus;
    return `- ${icon} **${a.name}** _${status}_`;
  })
  .join("\n")}

请在右侧资产工作台为每个资产挑选满意的候选图，然后点击「确认继续」。失败的资产可单独换模型重生成。`;

  return {
    candidates: [
      buildCandidate({
        kind: "assets_render",
        data,
        mdSummary: md,
      }),
    ],
    needsConfirm: true,
    cost: totalCost,
    realCost: totalRealCost,
    modelSlug: lastImageModel,
    channelId: lastImageChannel,
    meta: {
      renderedCount: works.length,
      failedCount,
    },
  };
};

function safeCountCandidates(raw: string): number {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
