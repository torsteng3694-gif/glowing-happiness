/**
 * Step 7. storyboard — 真实实现（已合并 keyframes 生图）
 *
 * 流程：
 *   1. LLM 推导分镜计划：基于 script + assets 产出 shots[] 元数据
 *   2. 写入 ComicShotV3 表（已存在则复用，保留用户编辑过的字段）
 *   3. 逐镜串行生图（onProgress 实时写 keyframeUrl，前端能边跑边看）
 *   4. needsConfirm = true：让用户审 / 重生成不满意的镜
 *
 * 失败容忍：
 *   - LLM 阶段失败 → 整步 failed
 *   - 单镜生图失败 → 该镜 genStatus=failed，整步仍 awaiting_user，可单镜重生成
 */

import { prisma } from "@/lib/db";
import { callLLMJson } from "../helpers-llm";
import { callImageMulti, runWithConcurrencyLimit } from "../helpers-image";
import {
  StoryboardSchema,
  ShotPlanBatchSchema,
  type AssetsOutput,
  type ScriptOutput,
  type StoryboardOutput,
} from "../schemas";
import { STEP_KEYS_V3 } from "../steps";
import { STORYBOARD_SYSTEM, buildStoryboardUser } from "../prompts/storyboard";
import { buildCandidate, type RunnerV3 } from "./_shared";

const SHOT_TYPE_LABEL: Record<StoryboardOutput["shots"][number]["shotType"], string> = {
  wide: "🌄 远景",
  medium: "👤 中景",
  close: "🔍 近景",
  extreme_close: "🎯 大特写",
  over_shoulder: "👥 过肩",
};

const CAMERA_MOVE_LABEL: Record<StoryboardOutput["shots"][number]["cameraMove"], string> = {
  static: "固定",
  pan: "横摇",
  zoom_in: "推镜",
  zoom_out: "拉镜",
  dolly: "移动",
  tracking: "跟拍",
};

export const runStoryboard: RunnerV3 = async (ctx) => {
  const script = ctx.prior[STEP_KEYS_V3.SCRIPT] as ScriptOutput | undefined;
  const assets = ctx.prior[STEP_KEYS_V3.ASSETS_RENDER] as AssetsOutput | undefined;
  if (!script) throw new Error("缺少剧本（script）步的产物，无法生成分镜");
  if (!assets) throw new Error("缺少资产渲染（assets_render）步的产物，无法生成分镜");

  // ====== 1. LLM 推导分镜计划 ======
  const r = await callLLMJson({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: STORYBOARD_SYSTEM,
    user: buildStoryboardUser({
      script,
      assets,
      styleHint: ctx.project.style,
      aspectRatio: ctx.project.aspectRatio,
      targetTotalSec: 60,
    }),
    schema: ShotPlanBatchSchema,
    mode: "stable",
    maxTokens: 8000,
    metaTag: "comic-v3:storyboard:plan",
  });

  // ====== 2. 写入 ComicShotV3（已存在则复用） ======
  const existingShots = await prisma.comicShotV3.findMany({
    where: { projectId: ctx.projectId },
  });
  const existingByIndex = new Map(existingShots.map((s) => [s.shotIndex, s]));

  const shotIds: { rowId: string; shotIndex: number; imagePrompt: string; modelSlug: string; negativePrompt?: string }[] = [];

  for (const plan of r.data.shots) {
    const existing = existingByIndex.get(plan.index);
    if (existing) {
      // 复用：仅在 keyframe 不存在时才更新 prompt 等字段（保留用户编辑过的）
      const shouldUpdatePrompt = !existing.keyframeUrl && existing.genStatus !== "ready";
      const updated = await prisma.comicShotV3.update({
        where: { id: existing.id },
        data: shouldUpdatePrompt
          ? {
              sceneIndex: plan.sceneIndex,
              shotType: plan.shotType,
              cameraMove: plan.cameraMove,
              durationSec: plan.durationSec,
              imagePrompt: plan.imagePrompt,
              motionHint: plan.motionHint,
              dialogue: plan.dialogue,
              assetIds: JSON.stringify(plan.assetIds),
              genStatus:
                existing.genStatus === "ready" ? "ready" : "pending",
              genError: null,
            }
          : { genError: null }, // 仅清错
      });
      shotIds.push({
        rowId: updated.id,
        shotIndex: updated.shotIndex,
        imagePrompt: updated.imagePrompt,
        modelSlug: updated.imageModelOverride || ctx.project.imageSlug,
        negativePrompt: updated.negativePrompt ?? undefined,
      });
    } else {
      const created = await prisma.comicShotV3.create({
        data: {
          projectId: ctx.projectId,
          shotIndex: plan.index,
          sceneIndex: plan.sceneIndex,
          shotType: plan.shotType,
          cameraMove: plan.cameraMove,
          durationSec: plan.durationSec,
          imagePrompt: plan.imagePrompt,
          motionHint: plan.motionHint,
          dialogue: plan.dialogue,
          assetIds: JSON.stringify(plan.assetIds),
          genStatus: "pending",
        },
      });
      shotIds.push({
        rowId: created.id,
        shotIndex: created.shotIndex,
        imagePrompt: created.imagePrompt,
        modelSlug: ctx.project.imageSlug,
      });
    }
  }

  // ====== 3. 逐镜生图（限并发 + onProgress 实时写 DB） ======
  const SHOT_CONCURRENCY = 2;
  let totalImageCost = 0;
  let totalImageRealCost = 0;
  let lastImageModel = ctx.project.imageSlug;
  let lastImageChannel: string | null = null;

  // 仅渲染未 ready 的镜（重跑时跳过已就绪的）
  const toRender = shotIds.filter((s) => {
    const row = existingByIndex.get(s.shotIndex);
    return !(row?.keyframeUrl && row.genStatus === "ready");
  });

  if (toRender.length > 0) {
    // 标 generating
    await prisma.comicShotV3.updateMany({
      where: { id: { in: toRender.map((s) => s.rowId) } },
      data: { genStatus: "generating", genError: null },
    });

    await runWithConcurrencyLimit(
      toRender.map((s) => async () => {
        try {
          const res = await callImageMulti({
            userId: ctx.userId,
            modelSlug: s.modelSlug,
            prompt: s.imagePrompt,
            aspectRatio: ctx.project.aspectRatio,
            rawParams: s.negativePrompt
              ? { negative_prompt: s.negativePrompt }
              : undefined,
            metaTag: `comic-v3:storyboard:shot:${s.shotIndex}`,
            count: 1, // 每镜只出 1 张
            saveAs: {
              projectId: ctx.projectId,
              category: "keyframe",
              label: `shot-${s.shotIndex}`,
            },
            onProgress: async (ev) => {
              if (ev.type !== "image") return;
              try {
                await prisma.comicShotV3.update({
                  where: { id: s.rowId },
                  data: {
                    keyframeUrl: ev.url,
                    genStatus: "ready",
                    genError: null,
                  },
                });
              } catch (dbErr) {
                console.warn("[storyboard] partial update failed:", dbErr);
              }
            },
          });
          totalImageCost += res.totalCost;
          totalImageRealCost += res.totalRealCost;
          lastImageModel = res.modelSlug;
          lastImageChannel = res.channelId;

          // 没出图（onProgress 没触发 ready）→ failed
          if (res.urls.length === 0) {
            await prisma.comicShotV3.update({
              where: { id: s.rowId },
              data: {
                genStatus: "failed",
                genError: res.errors.join("；").slice(0, 500) || "生成失败",
              },
            });
          }
        } catch (e) {
          await prisma.comicShotV3.update({
            where: { id: s.rowId },
            data: {
              genStatus: "failed",
              genError: e instanceof Error ? e.message : String(e),
            },
          });
        }
      }),
      SHOT_CONCURRENCY,
    );
  }

  // ====== 4. 拉最终所有 shots，构造产物 ======
  const finalShots = await prisma.comicShotV3.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { shotIndex: "asc" },
  });

  const data: StoryboardOutput = StoryboardSchema.parse({
    shots: finalShots.map((s) => ({
      index: s.shotIndex,
      sceneIndex: s.sceneIndex,
      shotType: s.shotType as StoryboardOutput["shots"][number]["shotType"],
      cameraMove: s.cameraMove as StoryboardOutput["shots"][number]["cameraMove"],
      durationSec: s.durationSec,
      imagePrompt: s.imagePrompt,
      motionHint: s.motionHint,
      dialogue: s.dialogue,
      assetIds: s.assetIds ? safeParseArray(s.assetIds) : [],
      keyframeUrl: s.keyframeUrl,
    })),
  });

  const totalSec = data.shots.reduce((acc, sh) => acc + sh.durationSec, 0);
  const okCount = finalShots.filter((s) => s.genStatus === "ready").length;
  const failedCount = finalShots.filter((s) => s.genStatus === "failed").length;

  const md = `### 分镜脚本

共 **${data.shots.length}** 个分镜 · 总时长约 **${totalSec.toFixed(0)} 秒** · ${okCount} 已出图${failedCount > 0 ? ` · ⚠ ${failedCount} 失败` : ""}

| # | 景别 | 运镜 | 时长 | 对白预览 |
|---|---|---|---|---|
${data.shots
  .slice(0, 10)
  .map(
    (sh) =>
      `| ${sh.index} | ${SHOT_TYPE_LABEL[sh.shotType]} | ${CAMERA_MOVE_LABEL[sh.cameraMove]} | ${sh.durationSec}s | ${sh.dialogue ? truncate(sh.dialogue, 28) : "—"} |`,
  )
  .join("\n")}
${data.shots.length > 10 ? `\n_（仅展示前 10 镜，共 ${data.shots.length} 镜）_` : ""}

请在右侧分镜工作台审阅每镜，对不满意的镜单独重生成或换模型。`;

  return {
    candidates: [buildCandidate({ kind: "storyboard", data, mdSummary: md })],
    needsConfirm: true,
    cost: r.cost + totalImageCost,
    realCost: r.realCost + totalImageRealCost,
    modelSlug: lastImageModel,
    channelId: lastImageChannel,
    meta: {
      shotCount: data.shots.length,
      okCount,
      failedCount,
      llmCost: r.cost,
      imageCost: totalImageCost,
    },
  };
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
