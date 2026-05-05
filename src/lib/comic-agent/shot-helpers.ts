/**
 * 分镜级（per-shot）操作的可复用 helper：
 *   - regenerateShotKeyframe   单镜重生关键帧（写回到 keyframes step.output 与 artifacts）
 *   - regenerateShotVideo      单镜重生视频片段（写回到 video_gen step.output）
 *   - reviseShotPrompt         AI 改写某镜的 imagePrompt 或 motionPrompt
 *
 * 这些 helper 与"整个 step runner"共享底层调用 (callImage / callVideo / callLLM)，
 * 但只对单个 shotIndex 操作，扣对应单元的费用。
 */

import { prisma } from "@/lib/db";
import { callImage, callVideo, callLLM } from "./helpers";
import { getStylePrefix, anglesForType } from "./visual-styles";
import type {
  StoryboardScriptOutput,
  KeyframesOutput,
  VideoGenOutput,
  MotionPromptOutput,
  ArtifactItem,
} from "./types";

/** 从 DB 读 step output（已 JSON.parse） */
async function loadStepOutput<T>(projectId: string, stepKey: string): Promise<T | null> {
  const row = await prisma.comicProjectStep.findUnique({
    where: { projectId_stepKey: { projectId, stepKey } },
  });
  if (!row?.output) return null;
  try {
    return JSON.parse(row.output) as T;
  } catch {
    return null;
  }
}

async function saveStepOutput(
  projectId: string,
  stepKey: string,
  patch: { output?: unknown; artifacts?: unknown[] | null; cost?: number; realCost?: number },
) {
  const row = await prisma.comicProjectStep.findUnique({
    where: { projectId_stepKey: { projectId, stepKey } },
  });
  if (!row) throw new Error(`step ${stepKey} 不存在`);

  const data: {
    output?: string;
    artifacts?: string;
    cost?: number;
    realCost?: number;
  } = {};
  if (patch.output !== undefined) data.output = JSON.stringify(patch.output);
  if (patch.artifacts !== undefined)
    data.artifacts = patch.artifacts ? JSON.stringify(patch.artifacts) : "[]";
  if (typeof patch.cost === "number") data.cost = +(row.cost + patch.cost).toFixed(4);
  if (typeof patch.realCost === "number") data.realCost = +(row.realCost + patch.realCost).toFixed(4);

  await prisma.comicProjectStep.update({
    where: { projectId_stepKey: { projectId, stepKey } },
    data,
  });

  // 同步项目 totalCost
  if (typeof patch.cost === "number" && patch.cost > 0) {
    await prisma.comicProject.update({
      where: { id: projectId },
      data: { totalCost: { increment: patch.cost } },
    });
  }
}

/* ================================================================
 * 单镜重生关键帧
 * ================================================================ */
export async function regenerateShotKeyframe(opts: {
  userId: string;
  projectId: string;
  shotIndex: number;
  /** 可选：使用新的 imagePrompt（覆盖原 storyboard_script 里的） */
  overridePrompt?: string;
}) {
  const ss = await loadStepOutput<StoryboardScriptOutput>(opts.projectId, "storyboard_script");
  if (!ss) throw new Error("分镜脚本尚未生成");
  const shot = ss.shots.find((s) => s.index === opts.shotIndex);
  if (!shot) throw new Error(`分镜 ${opts.shotIndex} 不存在`);

  const project = await prisma.comicProject.findUnique({ where: { id: opts.projectId } });
  if (!project) throw new Error("项目不存在");

  // 如果用户传了 overridePrompt，先 patch 到 storyboard_script 里持久化
  if (opts.overridePrompt && opts.overridePrompt !== shot.imagePrompt) {
    shot.imagePrompt = opts.overridePrompt;
    await saveStepOutput(opts.projectId, "storyboard_script", { output: ss });
  }

  const aspect = /^\d+:\d+$/.test(project.aspectRatio) ? project.aspectRatio : "16:9";
  const stylePrefix = getStylePrefix(project.visualStyle);
  const img = await callImage({
    userId: opts.userId,
    modelSlug: project.imageSlug,
    prompt: stylePrefix + shot.imagePrompt,
    n: 1,
    rawParams: { aspectRatio: aspect },
    metaTag: `comic-agent:keyframes:shot${opts.shotIndex}#manual`,
    saveAs: {
      projectId: opts.projectId,
      category: "keyframe",
      label: `shot-${opts.shotIndex}`,
    },
  });
  const url = img.data.urls[0];
  if (!url) throw new Error("图像模型未返回 URL");

  // 写回 keyframes step
  const kf = (await loadStepOutput<KeyframesOutput>(opts.projectId, "keyframes")) ||
    ({ count: 0, items: [] } as KeyframesOutput);

  // 替换 / 新增 该 shot 的 item
  const without = kf.items.filter((it) => it.shotIndex !== opts.shotIndex);
  const newItem: ArtifactItem = { url, type: "image", shotIndex: opts.shotIndex };
  const items = [...without, newItem].sort((a, b) => (a.shotIndex || 0) - (b.shotIndex || 0));
  // 从 failed 列表移除
  const failed = (kf.failed || []).filter((f) => f.shotIndex !== opts.shotIndex);

  const newOutput: KeyframesOutput = {
    count: items.length,
    items,
    failed: failed.length > 0 ? failed : undefined,
  };
  await saveStepOutput(opts.projectId, "keyframes", {
    output: newOutput,
    artifacts: items,
    cost: img.cost,
    realCost: img.realCost,
  });

  // 如果这是第一帧成功，把整步 status 从 failed 拉到 succeeded
  await maybeRecoverStepStatus(opts.projectId, "keyframes", items.length > 0);

  return { url, shotIndex: opts.shotIndex, cost: img.cost };
}

/* ================================================================
 * 单镜重生视频
 * ================================================================ */
export async function regenerateShotVideo(opts: {
  userId: string;
  projectId: string;
  shotIndex: number;
  overrideMotionPrompt?: string;
}) {
  const project = await prisma.comicProject.findUnique({ where: { id: opts.projectId } });
  if (!project) throw new Error("项目不存在");

  const ss = await loadStepOutput<StoryboardScriptOutput>(opts.projectId, "storyboard_script");
  const mp = await loadStepOutput<MotionPromptOutput>(opts.projectId, "motion_prompt");
  const kf = await loadStepOutput<KeyframesOutput>(opts.projectId, "keyframes");
  const frame = kf?.items.find((it) => it.shotIndex === opts.shotIndex);
  if (!frame) throw new Error(`分镜 ${opts.shotIndex} 没有关键帧，请先生成关键帧`);

  const motion =
    opts.overrideMotionPrompt ||
    mp?.items.find((m) => m.shotIndex === opts.shotIndex)?.motionPrompt ||
    ss?.shots.find((s) => s.index === opts.shotIndex)?.motionPrompt ||
    ss?.shots.find((s) => s.index === opts.shotIndex)?.imagePrompt ||
    "";
  const duration =
    mp?.items.find((m) => m.shotIndex === opts.shotIndex)?.durationSec ||
    ss?.shots.find((s) => s.index === opts.shotIndex)?.durationSec ||
    5;

  // 持久化覆盖 motionPrompt
  if (opts.overrideMotionPrompt && mp) {
    const existing = mp.items.find((m) => m.shotIndex === opts.shotIndex);
    if (existing) existing.motionPrompt = opts.overrideMotionPrompt;
    else
      mp.items.push({
        shotIndex: opts.shotIndex,
        motionPrompt: opts.overrideMotionPrompt,
        durationSec: duration,
      });
    await saveStepOutput(opts.projectId, "motion_prompt", { output: mp });
  }

  const aspect = /^\d+:\d+$/.test(project.aspectRatio) ? project.aspectRatio : "16:9";
  const v = await callVideo({
    userId: opts.userId,
    modelSlug: project.videoSlug,
    prompt: motion || "cinematic camera move",
    duration,
    aspectRatio: aspect,
    rawParams: {
      image: frame.url,
      image_url: frame.url,
      images: [frame.url],
      first_frame_image: frame.url,
    },
    metaTag: `comic-agent:video_gen:shot${opts.shotIndex}#manual`,
    saveAs: {
      projectId: opts.projectId,
      category: "shot",
      label: `shot-${opts.shotIndex}`,
    },
  });

  // 写回 video_gen step
  const vg = (await loadStepOutput<VideoGenOutput>(opts.projectId, "video_gen")) || {
    count: 0,
    totalDurationSec: 0,
    items: [],
  };
  const without = vg.items.filter((it) => it.shotIndex !== opts.shotIndex);
  const newItem: ArtifactItem = {
    url: v.data.url,
    type: "video",
    shotIndex: opts.shotIndex,
    durationSec: v.data.duration,
  };
  const items = [...without, newItem].sort((a, b) => (a.shotIndex || 0) - (b.shotIndex || 0));
  const totalDur = items.reduce((s, x) => s + (x.durationSec || 0), 0);
  const newOutput: VideoGenOutput = {
    count: items.length,
    totalDurationSec: +totalDur.toFixed(2),
    items,
  };
  await saveStepOutput(opts.projectId, "video_gen", {
    output: newOutput,
    artifacts: items,
    cost: v.cost,
    realCost: v.realCost,
  });
  await maybeRecoverStepStatus(opts.projectId, "video_gen", items.length > 0);

  return { url: v.data.url, durationSec: v.data.duration, shotIndex: opts.shotIndex, cost: v.cost };
}

/* ================================================================
 * AI 改写 prompt（imagePrompt 或 motionPrompt）
 * ================================================================ */
export async function reviseShotPrompt(opts: {
  userId: string;
  projectId: string;
  shotIndex: number;
  /** 改写哪一个字段 */
  field: "imagePrompt" | "motionPrompt";
  /** 改写指令，例如"更 cinematic"、"更细腻情感"、"加快节奏" */
  instruction: string;
}) {
  const project = await prisma.comicProject.findUnique({ where: { id: opts.projectId } });
  if (!project) throw new Error("项目不存在");

  const ss = await loadStepOutput<StoryboardScriptOutput>(opts.projectId, "storyboard_script");
  if (!ss) throw new Error("分镜脚本不存在");
  const shot = ss.shots.find((s) => s.index === opts.shotIndex);
  if (!shot) throw new Error(`分镜 ${opts.shotIndex} 不存在`);

  const original = shot[opts.field] || "";
  const r = await callLLM({
    userId: opts.userId,
    modelSlug: project.llmSlug,
    system:
      "你是漫剧分镜导演助理。根据用户的改写指令，重写一段图像或视频的英文提示词。仅输出改写后的纯文本，不要加任何前后缀、引号或解释。",
    user: `请按以下指令改写这段 ${opts.field === "imagePrompt" ? "图像" : "运动"} 提示词：

指令：${opts.instruction}

原文：
${original}

输出（仅一段改写后的英文文本）：`,
    temperature: 0.7,
    maxTokens: 600,
    metaTag: `comic-agent:revise_prompt:shot${opts.shotIndex}`,
  });

  const revised = r.data.text.trim().replace(/^["'`]+|["'`]+$/g, "");

  // 写回
  shot[opts.field] = revised;
  await saveStepOutput(opts.projectId, "storyboard_script", { output: ss });

  // 如果改的是 motionPrompt，同步到 motion_prompt step
  if (opts.field === "motionPrompt") {
    const mp = await loadStepOutput<MotionPromptOutput>(opts.projectId, "motion_prompt");
    if (mp) {
      const existing = mp.items.find((m) => m.shotIndex === opts.shotIndex);
      if (existing) existing.motionPrompt = revised;
      else mp.items.push({ shotIndex: opts.shotIndex, motionPrompt: revised, durationSec: shot.durationSec });
      await saveStepOutput(opts.projectId, "motion_prompt", { output: mp });
    }
  }

  return { original, revised, cost: r.cost, shotIndex: opts.shotIndex, field: opts.field };
}

/* ================================================================
 * 手动 patch shot 字段（imagePrompt / motionPrompt / dialogue / durationSec）
 * ================================================================ */
export async function patchShotFields(opts: {
  projectId: string;
  shotIndex: number;
  patch: Partial<{
    imagePrompt: string;
    motionPrompt: string;
    dialogue: string;
    durationSec: number;
  }>;
}) {
  const ss = await loadStepOutput<StoryboardScriptOutput>(opts.projectId, "storyboard_script");
  if (!ss) throw new Error("分镜脚本不存在");
  const shot = ss.shots.find((s) => s.index === opts.shotIndex);
  if (!shot) throw new Error(`分镜 ${opts.shotIndex} 不存在`);

  if (opts.patch.imagePrompt !== undefined) shot.imagePrompt = opts.patch.imagePrompt;
  if (opts.patch.motionPrompt !== undefined) shot.motionPrompt = opts.patch.motionPrompt;
  if (opts.patch.dialogue !== undefined) shot.dialogue = opts.patch.dialogue;
  if (opts.patch.durationSec !== undefined) shot.durationSec = opts.patch.durationSec;

  await saveStepOutput(opts.projectId, "storyboard_script", { output: ss });

  if (opts.patch.motionPrompt !== undefined) {
    const mp = await loadStepOutput<MotionPromptOutput>(opts.projectId, "motion_prompt");
    if (mp) {
      const existing = mp.items.find((m) => m.shotIndex === opts.shotIndex);
      if (existing) existing.motionPrompt = opts.patch.motionPrompt;
      else
        mp.items.push({
          shotIndex: opts.shotIndex,
          motionPrompt: opts.patch.motionPrompt,
          durationSec: shot.durationSec,
        });
      await saveStepOutput(opts.projectId, "motion_prompt", { output: mp });
    }
  }
  return shot;
}

/* ================================================================
 * 单资产多角度生图（用于资产识别面板，逐张刷到 DB）
 *
 * - 已 ready 的角色直接跳过（来自全局复用，referenceUrls 已经齐了）
 * - 否则按 anglesForType(type) 数组逐角度调用 callImage
 * - 每生成一张就把当前 referenceUrls 写回 DB，让前端 SSE/轮询能看到增量
 * - 全部完成后把 genStatus 置为 ready；中途连续失败置为 failed
 * - 生完一张后顺手 upsert 到全局 Asset 表（同 userId+type+name 唯一）
 * ================================================================ */
export async function generateAssetImagesForCharacter(opts: {
  userId: string;
  projectId: string;
  charId: string;
  /** 是否强制重生（即便 referenceUrls 已经存在） */
  force?: boolean;
}): Promise<{ urls: string[]; genStatus: "ready" | "failed" }> {
  const ch = await prisma.comicCharacter.findUnique({ where: { id: opts.charId } });
  if (!ch || ch.projectId !== opts.projectId) throw new Error("角色不存在");

  if (!opts.force && ch.genStatus === "ready") {
    const existing = ch.referenceUrls ? safeParseStrArray(ch.referenceUrls) : ch.referenceUrl ? [ch.referenceUrl] : [];
    return { urls: existing, genStatus: "ready" };
  }

  const project = await prisma.comicProject.findUnique({ where: { id: opts.projectId } });
  if (!project) throw new Error("项目不存在");

  await prisma.comicCharacter.update({
    where: { id: opts.charId },
    data: { genStatus: "analyzing", genError: null },
  });

  const type = (ch.type || "character") as "character" | "scene" | "prop" | "skill";
  const angles = anglesForType(type);
  const stylePrefix = getStylePrefix(project.visualStyle);
  const styleHint = project.style ? `画风：${project.style}。` : "";
  const visualAnchor = ch.visualAnchor || `${ch.name}：${ch.description || ""}`;

  const urls: string[] = [];
  let lastErr: string | undefined;

  for (const angle of angles) {
    const prompt = type === "character"
      ? `${stylePrefix}${styleHint}character reference sheet, ${angle.suffix}. Subject: ${visualAnchor}. Clean background.`
      : type === "scene"
      ? `${stylePrefix}${styleHint}${angle.suffix}. Location: ${visualAnchor}. Empty environment, no people.`
      : type === "prop"
      ? `${stylePrefix}${styleHint}${angle.suffix}. Object: ${visualAnchor}.`
      : `${stylePrefix}${styleHint}${angle.suffix}. Theme: ${visualAnchor}.`;

    try {
      const img = await callImage({
        userId: opts.userId,
        modelSlug: project.imageSlug,
        prompt,
        n: 1,
        rawParams: { aspectRatio: type === "character" ? "3:4" : "16:9" },
        metaTag: `comic-agent:asset-gen:${ch.name}:${angle.id}`,
        saveAs: { projectId: opts.projectId, category: "subject", label: `${ch.name}-${angle.label}` },
      });
      const url = img.data.urls[0];
      if (url) {
        urls.push(url);
        // 增量写回 — 让前端能在生成过程中看到每一张刚出炉的图
        await prisma.comicCharacter.update({
          where: { id: opts.charId },
          data: {
            referenceUrl: urls[0],
            referenceUrls: JSON.stringify(urls),
          },
        });
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.warn(`[comic-agent] 资产 ${ch.name} 生 ${angle.id} 角度失败:`, lastErr);
    }
  }

  if (urls.length === 0) {
    await prisma.comicCharacter.update({
      where: { id: opts.charId },
      data: { genStatus: "failed", genError: lastErr || "未生成任何参考图" },
    });
    return { urls: [], genStatus: "failed" };
  }

  await prisma.comicCharacter.update({
    where: { id: opts.charId },
    data: { genStatus: "ready", genError: null },
  });

  // 同步到全局 Asset（upsert）
  try {
    await prisma.asset.upsert({
      where: { userId_type_name: { userId: opts.userId, type: ch.type, name: ch.name } },
      update: {
        description: ch.description,
        referenceUrl: urls[0],
        referenceUrls: JSON.stringify(urls),
        visualAnchor: ch.visualAnchor,
        visualStyle: project.visualStyle,
      },
      create: {
        userId: opts.userId,
        type: ch.type,
        name: ch.name,
        description: ch.description,
        referenceUrl: urls[0],
        referenceUrls: JSON.stringify(urls),
        visualAnchor: ch.visualAnchor,
        visualStyle: project.visualStyle,
        sourceProjectId: opts.projectId,
      },
    });
  } catch (e) {
    console.warn("[comic-agent] upsert Asset failed:", e);
  }

  return { urls, genStatus: "ready" };
}

function safeParseStrArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/* ================================================================
 * 工具：如果 step 之前是 failed，但现在已经有产物，把它拉回 succeeded
 * ================================================================ */
async function maybeRecoverStepStatus(projectId: string, stepKey: string, hasArtifact: boolean) {
  const row = await prisma.comicProjectStep.findUnique({
    where: { projectId_stepKey: { projectId, stepKey } },
  });
  if (!row) return;
  if (hasArtifact && (row.status === "failed" || row.status === "running")) {
    await prisma.comicProjectStep.update({
      where: { projectId_stepKey: { projectId, stepKey } },
      data: { status: "succeeded", errorMessage: null, finishedAt: new Date(), progress: 100 },
    });
    // 项目状态：如果之前 failed，且这一步现在 ok，先回到 running（让用户继续推进）
    const project = await prisma.comicProject.findUnique({ where: { id: projectId } });
    if (project && project.status === "failed") {
      await prisma.comicProject.update({
        where: { id: projectId },
        data: { status: "running", errorMessage: null },
      });
    }
  }
}
