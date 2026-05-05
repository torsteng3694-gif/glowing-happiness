/**
 * Vidu Provider —— 解说剧成片（explain-comic）异步接入
 *
 * 文档：
 *   - 国内：POST https://api.vidu.cn/ent/v1/explain-comic/tasks
 *   - 海外：POST https://api.vidu.com/ent/v1/explain-comic/tasks
 *   - 鉴权头：Authorization: Token {api_key}（注意不是 Bearer）
 *   - 创建返回：{ id: "xxx" }
 *   - 计费：20 积分/秒，按 Vidu 真实视频时长后付费
 *
 * 注意点：
 *   1. 查询任务接口与回调签名算法 Vidu 文档没给齐，
 *      下面 viduQueryTask 按 Vidu 同类接口的常见约定实现，等真文档来按需调字段名。
 *   2. baseUrl 由调用方（Channel.upstream.baseUrl）传入，国内/海外只是不同 Upstream。
 */

import type {
  ExplainComicOptions,
  ExplainComicCreateResult,
  ExplainComicQueryResult,
} from "./types";
import type { UpstreamConfig } from "../upstream";

/** 把 Authorization 头组装成 Vidu 要的 "Token xxx" 形式（兼容用户在 admin 误填 "Bearer xxx" / 纯 key） */
function buildAuthHeader(apiKey: string): string {
  const k = apiKey.trim();
  if (!k) return "";
  if (/^Token\s+/i.test(k)) return k;
  if (/^Bearer\s+/i.test(k)) return "Token " + k.replace(/^Bearer\s+/i, "");
  return "Token " + k;
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

/** 创建解说剧成片任务，返回 Vidu 的 task id */
export async function viduCreateExplainComic(
  opts: ExplainComicOptions,
  cfg: UpstreamConfig,
): Promise<ExplainComicCreateResult> {
  if (!cfg.apiKey) throw new Error("Vidu 上游未配置 apiKey");
  const url = joinUrl(cfg.baseUrl, "/ent/v1/explain-comic/tasks");

  const body: Record<string, unknown> = {
    script_name: opts.scriptName,
    script_content: opts.scriptContent,
  };
  if (opts.assets && opts.assets.length > 0) {
    body.assets = opts.assets.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      image_uri: a.image_uri || "",
      description: a.description || "",
      voice_id: a.voice_id || "",
    }));
  }
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.style) body.style = opts.style;
  if (opts.language) body.language = opts.language;
  if (typeof opts.ttsSpeed === "number") body.tts_speed = opts.ttsSpeed;
  if (typeof opts.enableLipsync === "boolean") body.enable_lipsync = opts.enableLipsync;
  if (opts.callbackUrl) body.callback_url = opts.callbackUrl;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(cfg.apiKey),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Vidu 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || data?.error || text || `HTTP ${res.status}`;
    throw new Error(`Vidu 创建任务失败：${msg}`);
  }
  const id: string | undefined = data?.id ?? data?.task_id ?? data?.data?.id;
  if (!id || typeof id !== "string") {
    throw new Error(`Vidu 返回缺少 id 字段：${JSON.stringify(data).slice(0, 200)}`);
  }
  return { externalId: id };
}

/**
 * 查询任务状态。
 *
 * Vidu explain-comic / 通用任务-资产接口实测路径：
 *   GET /ent/v2/tasks/{id}/creations
 *
 * 兼容老路径 v1（旧账号 / 旧任务），失败再走 v2。
 */
export async function viduQueryTask(
  externalId: string,
  cfg: UpstreamConfig,
): Promise<ExplainComicQueryResult> {
  if (!cfg.apiKey) throw new Error("Vidu 上游未配置 apiKey");
  if (!externalId) throw new Error("externalId 必填");

  const candidates = [
    `/ent/v2/tasks/${encodeURIComponent(externalId)}/creations`,
    `/ent/v1/tasks/${encodeURIComponent(externalId)}/creations`,
  ];

  let lastErr: Error | null = null;
  for (const path of candidates) {
    const url = joinUrl(cfg.baseUrl, path);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: buildAuthHeader(cfg.apiKey),
      },
    });
    const text = await res.text();
    if (res.status === 404) {
      // 路径不对就试下一条
      lastErr = new Error(`Vidu 查询 404 ${path}: ${text.slice(0, 200)}`);
      continue;
    }
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Vidu 查询返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const msg = data?.message || data?.error?.message || data?.error || text || `HTTP ${res.status}`;
      throw new Error(`Vidu 查询任务失败：${msg}`);
    }
    return normalizeViduTask(externalId, data);
  }
  throw lastErr || new Error("Vidu 查询任务失败：所有候选路径都 404");
}

/* =================== Audio Clone（音色复刻，同步接口） =================== */

export type ViduAudioCloneOptions = {
  /** 原音频 URL（mp3/m4a/wav，10s~5min，≤20MB） */
  audioUrl: string;
  /** 用户自定义 voice_id，长度 8~256，首字符英文，结尾不能是 - / _ / * */
  voiceId: string;
  /** 可选：试听文本，≤ 1000 字 */
  text?: string;
  /** 可选：示例音频 URL（< 8s）+ 对应文本，提升复刻相似度 */
  promptAudioUrl?: string;
  promptText?: string;
  /** 透传参数 */
  payload?: string;
};

export type ViduAudioCloneResult = {
  taskId: string;
  /** queueing | success | failed —— 同步接口大概率直接 success */
  state: "queueing" | "success" | "failed" | string;
  voiceId?: string;
  /** 试听音频 URL（如果传了 text） */
  demoAudio?: string;
  /** 任务创建时间（ISO 字符串） */
  createdAt?: string;
  /** 上游原样返回，调试用 */
  raw?: Record<string, unknown>;
};

/**
 * Vidu 音色复刻：POST /ent/v2/audio-clone
 * 同步接口：直接拿到 task_id / state / voice_id / demo_audio。
 */
export async function viduAudioClone(
  opts: ViduAudioCloneOptions,
  cfg: UpstreamConfig,
): Promise<ViduAudioCloneResult> {
  if (!cfg.apiKey) throw new Error("Vidu 上游未配置 apiKey");
  if (!opts.audioUrl) throw new Error("audioUrl 必填");
  if (!opts.voiceId) throw new Error("voiceId 必填");

  const url = joinUrl(cfg.baseUrl, "/ent/v2/audio-clone");
  const body: Record<string, unknown> = {
    audio_url: opts.audioUrl,
    voice_id: opts.voiceId,
  };
  if (opts.text) body.text = opts.text;
  if (opts.promptAudioUrl) body.prompt_audio_url = opts.promptAudioUrl;
  if (opts.promptText) body.prompt_text = opts.promptText;
  if (opts.payload) body.payload = opts.payload;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(cfg.apiKey),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Vidu 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || data?.error || text || `HTTP ${res.status}`;
    throw new Error(`Vidu 音色复刻失败：${msg}`);
  }
  return {
    taskId: String(data?.task_id ?? ""),
    state: String(data?.state ?? "queueing"),
    voiceId: data?.voice_id ? String(data.voice_id) : undefined,
    demoAudio: data?.demo_audio ? String(data.demo_audio) : undefined,
    createdAt: data?.created_at ? String(data.created_at) : undefined,
    raw: data,
  };
}

/* =================== Audio TTS（语音合成，同步接口） =================== */

export type ViduTtsEmotion = "happy" | "sad" | "angry" | "fearful" | "disgusted" | "surprised" | "calm";

export type ViduAudioTtsOptions = {
  /** 待合成文本，≤ 10000 字。支持 <#x#> 停顿标记，x 秒（0.01~99.99） */
  text: string;
  /** 音色 id（预设音色 / 用户复刻得到的 voice_id） */
  voiceId: string;
  /** 0.5 ~ 2.0，默认 1.0 */
  speed?: number;
  /** 0 ~ 10，默认 0（= 正常） */
  volume?: number;
  /** -12 ~ 12，默认 0 */
  pitch?: number;
  emotion?: ViduTtsEmotion;
  /** 多音字发音字典，例如 ["燕少飞/(yan4)(shao3)(fei1)"] */
  pronunciationDictTone?: string[];
  payload?: string;
};

export type ViduAudioTtsResult = {
  taskId: string;
  state: "queueing" | "success" | "failed" | string;
  /** 合成后的音频 URL */
  fileUrl?: string;
  /** Vidu 实际扣的积分数（用于按量计费） */
  credits?: number;
  createdAt?: string;
  raw?: Record<string, unknown>;
};

/**
 * Vidu 语音合成：POST /ent/v2/audio-tts
 * 同步接口：直接拿到 file_url + credits（实际消耗积分）。
 */
export async function viduAudioTts(
  opts: ViduAudioTtsOptions,
  cfg: UpstreamConfig,
): Promise<ViduAudioTtsResult> {
  if (!cfg.apiKey) throw new Error("Vidu 上游未配置 apiKey");
  if (!opts.text) throw new Error("text 必填");
  if (!opts.voiceId) throw new Error("voiceId 必填");
  if (opts.text.length > 10000) throw new Error("text 不能超过 10000 字");

  const url = joinUrl(cfg.baseUrl, "/ent/v2/audio-tts");
  const body: Record<string, unknown> = {
    text: opts.text,
    voice_setting_voice_id: opts.voiceId,
  };
  if (typeof opts.speed === "number") body.voice_setting_speed = opts.speed;
  if (typeof opts.volume === "number") body.voice_setting_volume = opts.volume;
  if (typeof opts.pitch === "number") body.voice_setting_pitch = opts.pitch;
  if (opts.emotion) body.voice_setting_emotion = opts.emotion;
  if (opts.pronunciationDictTone && opts.pronunciationDictTone.length > 0) {
    body.pronunciation_dict_tone = opts.pronunciationDictTone;
  }
  if (opts.payload) body.payload = opts.payload;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthHeader(cfg.apiKey),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Vidu 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || data?.error || text || `HTTP ${res.status}`;
    throw new Error(`Vidu 语音合成失败：${msg}`);
  }
  const credits = Number(data?.credits);
  return {
    taskId: String(data?.task_id ?? ""),
    state: String(data?.state ?? "queueing"),
    fileUrl: data?.file_url ? String(data.file_url) : undefined,
    credits: Number.isFinite(credits) && credits > 0 ? credits : undefined,
    createdAt: data?.created_at ? String(data.created_at) : undefined,
    raw: data,
  };
}

/**
 * 把 Vidu 任意状态返回 / 回调体规范化成统一形态。
 * 兼容若干种字段命名（state / status / creations / data / video_url …），
 * 文档完善后可精简。
 */
export function normalizeViduTask(
  externalId: string,
  raw: any,
): ExplainComicQueryResult {
  const r = raw || {};

  // 1) status：兼容 state / status，归一到 task-status.ts 已知字面值
  const rawStatus: string =
    String(r.state || r.status || r.data?.state || r.data?.status || "").toLowerCase();
  let status = rawStatus || "processing";
  if (rawStatus === "queueing" || rawStatus === "queued") status = "queueing";
  if (rawStatus === "created") status = "created";
  if (rawStatus === "processing" || rawStatus === "running") status = "processing";
  if (rawStatus === "success" || rawStatus === "succeed" || rawStatus === "succeeded") status = "success";
  if (rawStatus === "completed" || rawStatus === "complete" || rawStatus === "done" || rawStatus === "finish") {
    status = "success";
  }
  if (rawStatus === "failed" || rawStatus === "failure" || rawStatus === "error") status = "failed";

  // 2) 结果资产：creations / data.creations / outputs / 顶层 url 字段
  let videoUrl: string | undefined;
  let coverUrl: string | undefined;
  let durationSec: number | undefined;
  const creations: any[] =
    (Array.isArray(r.creations) && r.creations) ||
    (Array.isArray(r.data?.creations) && r.data.creations) ||
    (Array.isArray(r.outputs) && r.outputs) ||
    [];
  const pickUrl = (o: Record<string, unknown>): string | undefined => {
    const cand = [
      o.url,
      o.video_url,
      o.video_uri,
      o.file_url,
      o.result_url,
      o.output_url,
      o.uri,
      (o.result as Record<string, unknown>)?.video_url,
      (o.result as Record<string, unknown>)?.url,
      (o.video as Record<string, unknown>)?.url,
    ];
    for (const x of cand) {
      if (typeof x === "string" && x.startsWith("http")) return x;
    }
    for (const x of cand) {
      if (typeof x === "string" && x.length > 4) return x;
    }
    return undefined;
  };
  if (creations.length > 0) {
    const first = creations[0] || {};
    videoUrl = pickUrl(first as Record<string, unknown>);
    coverUrl =
      (first.cover_url || first.cover_uri || first.thumbnail_url || first.poster_url) as string | undefined;
    const d = Number(first.duration ?? first.duration_sec ?? first.video_duration);
    if (Number.isFinite(d) && d > 0) durationSec = d;
  } else {
    videoUrl =
      pickUrl(r as Record<string, unknown>) ||
      pickUrl((r.data || {}) as Record<string, unknown>) ||
      (typeof r.data?.video_url === "string" ? r.data.video_url : undefined) ||
      (typeof r.data?.url === "string" ? r.data.url : undefined);
    coverUrl = r.cover_url || r.data?.cover_url;
    const d = Number(r.duration ?? r.duration_sec ?? r.data?.duration);
    if (Number.isFinite(d) && d > 0) durationSec = d;
  }

  const errorMessage: string | undefined =
    r.err_message || r.error_message || r.message || r.data?.err_message;

  // 进度（Vidu 不一定返回，给个粗略值）
  let progress = Number(r.progress ?? r.data?.progress);
  if (!Number.isFinite(progress)) {
    progress = status === "success" ? 100 : status === "failed" ? 0 : status === "processing" ? 50 : 10;
  }

  return {
    externalId,
    status,
    progress,
    videoUrl,
    coverUrl,
    durationSec,
    errorMessage: errorMessage && status === "failed" ? errorMessage : undefined,
    raw: r,
  };
}
