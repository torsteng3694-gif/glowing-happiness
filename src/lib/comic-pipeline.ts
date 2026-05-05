/**
 * 解说漫剧管线配置
 *
 * 双层管理：
 *   - 全局默认：Setting 表（comic_pipeline_*），仅 admin 通过 /admin/comic-pipeline 改
 *   - 用户私有覆盖：UserPreference 表（同样的 4 个 key）
 *
 * 读取优先级：UserPreference > Setting > 代码内 DEFAULT_PIPELINE
 *
 * 默认值与你项目里实际 seed 过的 slug 对齐：
 *   - LLM    → gemini-2.5-flash（用户选 Gemini）
 *   - TTS    → vidu-audio-tts
 *   - Image  → nano-banana-pro
 *   - Video  → vidu-img2video（待 seed）
 */

import { prisma } from "./db";

export type ComicPipeline = {
  llmSlug: string;
  ttsSlug: string;
  imageSlug: string;
  videoSlug: string;
};

const KEYS = {
  llm: "comic_pipeline_llm_slug",
  tts: "comic_pipeline_tts_slug",
  image: "comic_pipeline_image_slug",
  video: "comic_pipeline_video_slug",
} as const;

export const DEFAULT_PIPELINE: ComicPipeline = {
  llmSlug: "gemini-2.5-flash",
  ttsSlug: "vidu-audio-tts",
  imageSlug: "nano-banana-pro",
  videoSlug: "vidu-img2video",
};

/** 全局默认（admin 设置） */
export async function getGlobalComicPipeline(): Promise<ComicPipeline> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    llmSlug:   map.get(KEYS.llm)   || DEFAULT_PIPELINE.llmSlug,
    ttsSlug:   map.get(KEYS.tts)   || DEFAULT_PIPELINE.ttsSlug,
    imageSlug: map.get(KEYS.image) || DEFAULT_PIPELINE.imageSlug,
    videoSlug: map.get(KEYS.video) || DEFAULT_PIPELINE.videoSlug,
  };
}

/** 用户层 override；返回的字段是该用户真正会用到的 4 个 slug。 */
export async function getUserComicPipeline(userId: string): Promise<ComicPipeline> {
  const [globals, prefs] = await Promise.all([
    getGlobalComicPipeline(),
    prisma.userPreference.findMany({
      where: { userId, key: { in: Object.values(KEYS) } },
    }),
  ]);
  const m = new Map(prefs.map((p) => [p.key, p.value]));
  return {
    llmSlug:   m.get(KEYS.llm)   || globals.llmSlug,
    ttsSlug:   m.get(KEYS.tts)   || globals.ttsSlug,
    imageSlug: m.get(KEYS.image) || globals.imageSlug,
    videoSlug: m.get(KEYS.video) || globals.videoSlug,
  };
}

/** 返回 { effective, global, userOverrides } —— effective 是最终生效，
 *  userOverrides 仅记 key→value 的纯用户覆盖项（用于前端区分"这是用户改过的"）。 */
export async function getUserComicPipelineDetailed(userId: string): Promise<{
  effective: ComicPipeline;
  global: ComicPipeline;
  userOverrides: Partial<ComicPipeline>;
}> {
  const [globals, prefs] = await Promise.all([
    getGlobalComicPipeline(),
    prisma.userPreference.findMany({
      where: { userId, key: { in: Object.values(KEYS) } },
    }),
  ]);
  const m = new Map(prefs.map((p) => [p.key, p.value]));
  const userOverrides: Partial<ComicPipeline> = {};
  if (m.has(KEYS.llm))   userOverrides.llmSlug   = m.get(KEYS.llm);
  if (m.has(KEYS.tts))   userOverrides.ttsSlug   = m.get(KEYS.tts);
  if (m.has(KEYS.image)) userOverrides.imageSlug = m.get(KEYS.image);
  if (m.has(KEYS.video)) userOverrides.videoSlug = m.get(KEYS.video);
  return {
    effective: { ...globals, ...userOverrides },
    global: globals,
    userOverrides,
  };
}

/** Admin 写全局 */
export async function setGlobalComicPipeline(input: Partial<ComicPipeline>) {
  const updates: { key: string; value: string }[] = [];
  if (typeof input.llmSlug   === "string") updates.push({ key: KEYS.llm,   value: input.llmSlug.trim() });
  if (typeof input.ttsSlug   === "string") updates.push({ key: KEYS.tts,   value: input.ttsSlug.trim() });
  if (typeof input.imageSlug === "string") updates.push({ key: KEYS.image, value: input.imageSlug.trim() });
  if (typeof input.videoSlug === "string") updates.push({ key: KEYS.video, value: input.videoSlug.trim() });
  for (const { key, value } of updates) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

/**
 * 用户私有覆盖。
 *  - 字段值非空字符串 → upsert（覆盖）
 *  - 字段值是空字符串 → 删除该用户的这一条 override（恢复全局默认）
 *  - 字段未传 → 不动
 */
export async function setUserComicPipeline(userId: string, input: Partial<ComicPipeline>) {
  const ops: { key: string; value: string | null }[] = [];
  if (input.llmSlug   !== undefined) ops.push({ key: KEYS.llm,   value: input.llmSlug   || null });
  if (input.ttsSlug   !== undefined) ops.push({ key: KEYS.tts,   value: input.ttsSlug   || null });
  if (input.imageSlug !== undefined) ops.push({ key: KEYS.image, value: input.imageSlug || null });
  if (input.videoSlug !== undefined) ops.push({ key: KEYS.video, value: input.videoSlug || null });
  for (const { key, value } of ops) {
    if (value === null) {
      await prisma.userPreference.deleteMany({ where: { userId, key } });
    } else {
      await prisma.userPreference.upsert({
        where: { userId_key: { userId, key } },
        update: { value },
        create: { userId, key, value },
      });
    }
  }
}

/* =================== 兼容旧 API =================== */
/** @deprecated 用 getGlobalComicPipeline 或 getUserComicPipeline。
 *  兼容你之前 /admin/comic-pipeline 页面里用的 getComicPipeline。 */
export const getComicPipeline = getGlobalComicPipeline;
/** @deprecated 用 setGlobalComicPipeline */
export const setComicPipeline = setGlobalComicPipeline;
