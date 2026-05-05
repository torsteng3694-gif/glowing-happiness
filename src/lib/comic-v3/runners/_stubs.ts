/**
 * Step 7-10 stub runners — 待 P4 替换为真实实现
 * （P2 已实现 step 1-4；P3 已实现 step 5-6）
 */

import {
  KeyframesOutputSchema,
  MotionOutputSchema,
  VideosOutputSchema,
  ComposeOutputSchema,
} from "../schemas";
import { buildCandidate, STUB_TAG, type RunnerV3 } from "./_shared";

/* ============================================================
 * Step 8. keyframes — 汇总（生图已合并到 storyboard 步内）
 *
 * 这一步现在仅从 ComicShotV3 表里读 keyframeUrl 汇总成 KeyframesOutput，
 * 给下游 motion / videos 步使用。零额外 LLM/图像成本。
 * ============================================================ */
export const runKeyframes: RunnerV3 = async (ctx) => {
  // 注意：这里直接 import prisma 而不是从 ../helpers-llm 透传，避免循环引用
  const { prisma } = await import("@/lib/db");
  const shots = await prisma.comicShotV3.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { shotIndex: "asc" },
  });

  const items = shots
    .filter((s) => !!s.keyframeUrl)
    .map((s) => ({
      shotIndex: s.shotIndex,
      url: s.keyframeUrl as string,
    }));
  const failed = shots
    .filter((s) => s.genStatus === "failed")
    .map((s) => ({
      shotIndex: s.shotIndex,
      error: s.genError || "unknown",
    }));

  const data = KeyframesOutputSchema.parse({
    count: items.length,
    items,
    failed,
  });

  const md = `### 关键帧汇总\n\n共 **${items.length}/${shots.length}** 个分镜已出图${failed.length > 0 ? ` · ⚠ ${failed.length} 失败` : ""}\n\n关键帧已在「分镜脚本」步骤中生成，本步仅汇总。如需重新生成，请回到「分镜脚本」步对单镜重生成。`;

  return {
    candidates: [
      buildCandidate({
        kind: "keyframes",
        data,
        mdSummary: md,
      }),
    ],
    needsConfirm: false,
    cost: 0,
    realCost: 0,
    meta: { okCount: items.length, failedCount: failed.length },
  };
};

/* ============================================================
 * Step 8. motion（stub - P4 实现）
 * ============================================================ */
export const runMotion: RunnerV3 = async () => {
  const data = MotionOutputSchema.parse({ items: [] });
  return {
    candidates: [
      buildCandidate({
        kind: "motion",
        data,
        mdSummary: `### 运动 Prompt ${STUB_TAG}`,
      }),
    ],
    needsConfirm: false,
    cost: 0,
    realCost: 0,
  };
};

/* ============================================================
 * Step 9. videos（stub - P4 实现）
 * ============================================================ */
export const runVideos: RunnerV3 = async () => {
  const data = VideosOutputSchema.parse({
    count: 0,
    totalDurationSec: 0,
    items: [],
    failed: [],
  });
  return {
    candidates: [
      buildCandidate({
        kind: "videos",
        data,
        mdSummary: `### 视频生成 ${STUB_TAG}`,
      }),
    ],
    needsConfirm: false,
    cost: 0,
    realCost: 0,
  };
};

/* ============================================================
 * Step 10. compose（stub - P4 实现）
 * ============================================================ */
export const runCompose: RunnerV3 = async (ctx) => {
  const data = ComposeOutputSchema.parse({
    videoUrl: "https://placehold.co/640x360/png?text=stub-video",
    durationSec: 0,
    extensionsApplied: {
      bgm: !!ctx.extensions.bgm,
      subtitles: !!ctx.extensions.subtitles,
      multiVoice: !!ctx.extensions.multiVoice,
    },
  });
  return {
    candidates: [
      buildCandidate({
        kind: "compose",
        data,
        mdSummary: `### 成片合成 ${STUB_TAG}\nP4 阶段返回真实视频 URL`,
      }),
    ],
    needsConfirm: false,
    cost: 0,
    realCost: 0,
  };
};
