export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

export type ChatChunk = {
  delta: string;
  done: boolean;
  inputTokens?: number;
  outputTokens?: number;
};

export type ImageOptions = {
  model: string;
  prompt: string;
  size?: string; // "1024x1024"
  n?: number;
  /** 模型原生参数，会原样透传给上游（如 aspectRatio / imageSize / images） */
  rawParams?: Record<string, any>;
};

export type ImageResult = {
  images: { url: string }[];
  meta?: Record<string, any>;
};

export type VideoOptions = {
  model: string;
  prompt: string;
  duration?: number; // 秒
  aspectRatio?: string;
  /** 模型原生参数，会原样透传给上游 */
  rawParams?: Record<string, any>;
};

export type VideoResult = {
  videoUrl: string;
  coverUrl?: string;
  duration: number;
  meta?: Record<string, any>;
};

export type AudioOptions = {
  model: string;
  /** 文生音乐用：场景/氛围 prompt */
  prompt?: string;
  /** TTS 用：要朗读的文本 */
  text?: string;
  duration?: number;
  /** 模型原生参数，会原样透传给上游 */
  rawParams?: Record<string, any>;
};

export type AudioResult = {
  audioUrl: string;
  duration: number;
  /** 文件格式（mp3 / wav 等），从 URL 后缀推断 */
  format?: string;
  meta?: Record<string, any>;
};

export interface ChatProvider {
  chat(opts: ChatOptions): AsyncGenerator<ChatChunk>;
}
export interface ImageProvider {
  image(opts: ImageOptions): Promise<ImageResult>;
}
export interface VideoProvider {
  video(opts: VideoOptions): Promise<VideoResult>;
}

/* =================== Explain-Comic（解说剧成片，异步任务） =================== */

export type ExplainComicAssetType = "character" | "scene" | "tool";

export type ExplainComicAsset = {
  /** "01" / "02" / ... 由调用方维护 */
  id: string;
  type: ExplainComicAssetType;
  /** 资产名，≤ 10 字符 */
  name: string;
  /** 参考图：URL 或 data:image/...;base64,... */
  image_uri?: string;
  description?: string;
  /** 角色音色 id，仅 type=character 有意义 */
  voice_id?: string;
};

export type ExplainComicOptions = {
  model: string;
  /** 剧集名，≤ 20 字符 */
  scriptName: string;
  /** 剧本正文，50-2000 字 */
  scriptContent: string;
  assets?: ExplainComicAsset[];
  resolution?: "720p" | "1080p";
  aspectRatio?: "16:9" | "9:16" | "4:3" | "3:4";
  /** 视频风格描述（≤ 10 字），如 "2D动画" */
  style?: string;
  language?: "zh" | "en";
  /** 1.0 ~ 1.5 */
  ttsSpeed?: number;
  enableLipsync?: boolean;
  /** 透传给上游的回调地址 */
  callbackUrl?: string;
};

/** 创建任务的返回——只拿 externalId，结果走查询/回调 */
export type ExplainComicCreateResult = {
  /** Vidu 返回的任务 id（字符串） */
  externalId: string;
};

/** 查询任务的统一返回 */
export type ExplainComicQueryResult = {
  externalId: string;
  /** Vidu 原始 status 字面值，已规范化到 task-status.ts 能识别的值 */
  status: string;
  /** 0-100，未知则给 0 */
  progress?: number;
  /** 任务成功时的视频 URL（取首个） */
  videoUrl?: string;
  coverUrl?: string;
  /** 视频实际时长（秒），用于后付费结算 */
  durationSec?: number;
  errorMessage?: string;
  /** 上游原始返回，调试用 */
  raw?: Record<string, unknown>;
};
