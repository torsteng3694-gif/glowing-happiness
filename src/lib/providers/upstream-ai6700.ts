import type {
  ChatOptions, ChatChunk,
  ImageOptions, ImageResult,
  VideoOptions, VideoResult,
  AudioOptions, AudioResult,
} from "./types";
import type { UpstreamConfig } from "../upstream";

/**
 * ai6700.com 风格的聚合上游 provider。
 *
 * 实时类：
 *   - chat → POST /v1/chat/completions (SSE)
 *
 * 异步类（图像 / 视频 / 音频均走此流程）：
 *   - 提交 POST /v1/media/generate   body: { model, prompt, params, count }
 *     返回可能是两种格式：
 *       A) { code:200, data:{ 任务ids:[N], 对话组ID:"..." }, msg }   — 中文字段包络
 *       B) { task_id: N, ... }                                        — 平坦结构
 *   - 轮询 GET /v1/media/status?task_id=xxx
 *     响应：{ state, status, status_group, is_final, progress:"45%", result_url, result_type, error, cost }
 *     - 用 `state`（pending/running/success/failed）做业务判断
 *     - `progress` 是 "45%" 字符串，需要解析
 *     - `result_url` 是单个 URL 字符串（或空）
 */

/* -------------------- Chat：OpenAI 流式 -------------------- */

export async function* upstreamChat(
  opts: ChatOptions,
  cfg: UpstreamConfig,
): AsyncGenerator<ChatChunk> {
  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`upstream chat ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let inputTokens = 0, outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const data = l.slice(5).trim();
      if (data === "[DONE]") {
        yield { delta: "", done: true, inputTokens, outputTokens };
        return;
      }
      try {
        const json = JSON.parse(data);
        const delta: string = json.choices?.[0]?.delta?.content || "";
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens || inputTokens;
          outputTokens = json.usage.completion_tokens || outputTokens;
        }
        if (delta) yield { delta, done: false };
      } catch { /* ignore */ }
    }
  }
  yield { delta: "", done: true, inputTokens, outputTokens };
}

/* -------------------- Async media 统一实现 -------------------- */

export type UpstreamMediaSubmit = {
  model: string;
  prompt: string;
  /** 直接按照模型文档定义的参数原样传递（例如 aspectRatio/imageSize/images/duration 等） */
  params?: Record<string, any>;
  /** 生成数量 */
  count?: number;
};

export type UpstreamTaskStatus = {
  state: "pending" | "running" | "success" | "failed";
  status_display?: string;           // status 中文显示
  status_group?: string;             // 等待中 / 进行中 / 已完成 / 失败
  is_final: boolean;
  progress: number;                  // 0-100
  result_url: string;                // 单个 URL（如有）
  result_urls: string[];             // 兼容数组结构
  result_type: string;               // image / video / audio
  error: string;
  cost: number;
};

function parseProgress(v: unknown): number {
  if (typeof v === "number") return Math.max(0, Math.min(100, Math.round(v)));
  if (typeof v === "string") {
    const m = v.match(/(\d+(?:\.\d+)?)/);
    if (m) return Math.max(0, Math.min(100, Math.round(Number(m[1]))));
  }
  return 0;
}

function inferState(json: any): UpstreamTaskStatus["state"] {
  const s = String(json.state || "").toLowerCase();
  if (s === "pending" || s === "running" || s === "success" || s === "failed") return s;

  // 兼容旧版 / 无 state 的响应：用 is_final + error / result_url 判断
  const isFinal = Boolean(json.is_final);
  if (!isFinal) {
    // 旧版 group 字段
    if (json.group === "waiting") return "pending";
    return "running";
  }
  if (json.error) return "failed";
  // 旧版 group
  if (json.group === "failed") return "failed";
  if (json.result_url || (json.result && Array.isArray(json.result.urls) && json.result.urls.length)) return "success";
  return "failed";
}

/** 把 params 里的 base64 / 超长字段缩短后再打印，避免日志被 data: URL 撑爆 */
function debugParams(p: Record<string, any> | undefined): Record<string, any> {
  if (!p) return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "string") {
      out[k] = v.length > 80 ? v.slice(0, 60) + `…(len=${v.length})` : v;
    } else if (Array.isArray(v)) {
      out[k] = v.map((x) =>
        typeof x === "string" && x.length > 80 ? x.slice(0, 60) + `…(len=${x.length})` : x,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** 兼容管理员把 baseUrl 配成 /v1 或 /v1/chat/completions 的情况。 */
function mediaBaseUrl(baseUrl: string): string {
  const raw = String(baseUrl || "").trim().replace(/\/+$/, "");
  return raw
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/v1$/i, "");
}

/** 发起异步媒体任务（图片/视频/音频），返回上游的 task_id */
export async function upstreamSubmitMedia(
  opts: UpstreamMediaSubmit,
  cfg: UpstreamConfig,
): Promise<{ taskId: string | number }> {
  // 并发提交同 prompt 时，上游（Nano Banana Pro 等异步模型）会把 body
  // 完全一致的请求视为重复，返回同一张缓存图。这里在 provider 层兜底：
  // 如果调用方没显式传 seed（或 seed=0/空），自动注入一个随机 seed，
  // 让每次请求的 body 不同。用户若显式传 seed 想复现结果则尊重其值。
  const params: Record<string, any> = { ...(opts.params || {}) };
  const seedVal = params.seed;
  const missingSeed =
    seedVal === undefined ||
    seedVal === null ||
    seedVal === "" ||
    seedVal === 0 ||
    seedVal === "0";
  if (missingSeed) {
    params.seed = Math.floor(Math.random() * 2_147_483_647);
  }

  const body: any = {
    model: opts.model,
    prompt: opts.prompt,
    params,
    count: opts.count || 1,
  };

  console.log(
    `[upstream submit] model=${opts.model} count=${body.count} seed=${params.seed} prompt="${String(opts.prompt).slice(0, 60)}…" params=`,
    debugParams(body.params),
  );

  const base = mediaBaseUrl(cfg.baseUrl);
  const res = await fetch(`${base}/v1/media/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upstream submit ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();

  // 兼容两种响应外壳
  // A) { code:200, data:{ 任务ids:[N], 对话组ID }, msg }
  // B) { task_id:N, ... }
  let tid: any =
    json?.data?.["任务ids"]?.[0] ??
    json?.data?.task_ids?.[0] ??
    json?.task_id ??
    json?.id;

  if (tid === undefined || tid === null) {
    // ai6700 业务错误格式：{ code:400, data:{ "详情":"参数 X 的值 Y 不合法" }, msg:"参数验证失败" }
    const msg = (json?.msg as string) || "请求被上游拒绝";
    const detail =
      (json?.data?.["详情"] as string) ||
      (json?.data?.detail as string) ||
      (json?.error?.message as string) ||
      "";
    const code = json?.code ?? "?";
    throw new Error(
      `upstream submit ${code}: ${msg}${detail ? `（${detail}）` : ""}. raw=${JSON.stringify(json).slice(0, 240)}`,
    );
  }
  return { taskId: tid };
}

export async function upstreamPollTask(
  taskId: string | number,
  cfg: UpstreamConfig,
): Promise<UpstreamTaskStatus> {
  const base = mediaBaseUrl(cfg.baseUrl);
  const url = `${base}/v1/media/status?task_id=${encodeURIComponent(String(taskId))}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upstream poll ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();

  // 兼容被 {code,data,msg} 包裹的返回
  const body = json?.data && json?.code ? json.data : json;

  const state = inferState(body);
  const progress = parseProgress(body.progress);
  const singleUrl: string = body.result_url || "";
  const urlsArr: string[] =
    Array.isArray(body?.result?.urls) ? body.result.urls :
    Array.isArray(body?.result_urls) ? body.result_urls :
    singleUrl ? [singleUrl] : [];

  const isFinal = Boolean(body.is_final) || state === "success" || state === "failed";

  return {
    state,
    status_display: body.status,
    status_group: body.status_group || body.fenzu,
    is_final: isFinal,
    progress,
    result_url: singleUrl || urlsArr[0] || "",
    result_urls: urlsArr,
    result_type: body.result_type || "",
    error: body.error || "",
    cost: Number(body.cost || 0),
  };
}

/** 阻塞等待上游任务完成（3s 轮询一次，最多 70min） */
export async function upstreamAwaitTask(
  taskId: string | number,
  cfg: UpstreamConfig,
  onProgress?: (s: UpstreamTaskStatus) => void,
  intervalMs = 3000,
  maxWaitMs = 70 * 60 * 1000,
): Promise<UpstreamTaskStatus> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const s = await upstreamPollTask(taskId, cfg);
    onProgress?.(s);
    if (s.is_final) return s;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("upstream poll timed out");
}

/* -------------------- 按我们内部类型的封装 -------------------- */

/** 图像异步生成：支持 nano-banana-pro 等需要 /v1/media/generate 的模型 */
export async function upstreamImage(
  opts: ImageOptions,
  cfg: UpstreamConfig,
  extraParams?: Record<string, any>,
): Promise<ImageResult> {
  // 默认参数（OpenAI 风格）映射到 ai6700 的参数约定
  const params: Record<string, any> = { ...extraParams };

  // 若调用方传了 size（如 "1024x1024"）则保留，但对于 nano-banana-pro 用 aspectRatio/imageSize 更合适
  if (opts.size && !params.size) params.size = opts.size;

  try {
    // 上游偶发 context deadline exceeded（网关/队列超时）时，自动重试一次。
    let lastErr: unknown = null;
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const sub = await upstreamSubmitMedia(
          {
            model: opts.model,
            prompt: opts.prompt,
            params,
            count: opts.n || 1,
          },
          cfg,
        );
        const done = await upstreamAwaitTask(sub.taskId, cfg);
        if (done.state !== "success" || !done.result_urls.length) {
          throw new Error(done.error || `upstream image task failed: state=${done.state}`);
        }
        return {
          images: done.result_urls.map((url) => ({ url })),
          meta: {
            upstream_task_id: sub.taskId,
            result_type: done.result_type,
            upstream_cost: done.cost,
          },
        };
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        const transientTimeout =
          /context deadline exceeded|client\.timeout|timeout|timed out|etimedout|econnreset/i.test(msg);
        if (!transientTimeout || attempt >= maxAttempts) break;
        console.warn(
          `[upstream image] transient timeout, retrying (${attempt}/${maxAttempts}) model=${opts.model}: ${msg}`,
        );
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 部分中转站不支持 /v1/media/generate（返回 Invalid URL），
    // 但支持 OpenAI 风格 /v1/images/generations。这里自动降级兜底。
    const isMediaRoute404 =
      /upstream submit 404/i.test(msg) &&
      (/Invalid URL/i.test(msg) || /\/v1\/media\/generate/i.test(msg) || /404 Not Found|nginx/i.test(msg));
    if (!isMediaRoute404) throw err;

    const base = mediaBaseUrl(cfg.baseUrl);
    const n = Math.min(Math.max(opts.n || 1, 1), 4);
    const res = await fetch(`${base}/v1/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        prompt: opts.prompt,
        size: params.size || opts.size || "1024x1024",
        n,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`upstream image fallback ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const arr: any[] = Array.isArray(json?.data) ? json.data : [];
    const urls = arr.map((x) => String(x?.url || "")).filter(Boolean);
    if (!urls.length) {
      throw new Error(`upstream image fallback: empty data. raw=${JSON.stringify(json).slice(0, 300)}`);
    }
    return {
      images: urls.map((url) => ({ url })),
      meta: {
        result_type: "image",
        fallback_api: "/v1/images/generations",
      },
    };
  }
}

/** 音频异步生成（TTS / 音乐 / 克隆），走和 image/video 同一套 /v1/media/generate 流程 */
export async function upstreamAudio(
  opts: AudioOptions,
  cfg: UpstreamConfig,
  extraParams?: Record<string, any>,
): Promise<AudioResult> {
  const params: Record<string, any> = { ...extraParams };
  if (opts.duration !== undefined && params.duration === undefined) {
    params.duration = String(opts.duration);
  }
  // 大多数 TTS 模型把要念的文本放在 text 字段里而不是 prompt
  if (opts.text && !params.text) params.text = opts.text;

  // ai6700 约定 prompt 必填；TTS 类没有 prompt 时用 text 顶上，实在都没有就给空串
  const prompt = opts.prompt || opts.text || "";

  const sub = await upstreamSubmitMedia(
    {
      model: opts.model,
      prompt,
      params,
      count: 1,
    },
    cfg,
  );
  const done = await upstreamAwaitTask(sub.taskId, cfg);
  if (done.state !== "success" || !done.result_urls.length) {
    throw new Error(done.error || `upstream audio task failed: state=${done.state}`);
  }

  const url = done.result_urls[0];
  const ext = (url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|#|$)/)?.[1] || "mp3").toLowerCase();
  return {
    audioUrl: url,
    duration: opts.duration || 0,
    format: ext,
    meta: {
      upstream_task_id: sub.taskId,
      result_type: done.result_type,
      upstream_cost: done.cost,
    },
  };
}

export async function upstreamVideo(
  opts: VideoOptions,
  cfg: UpstreamConfig,
  extraParams?: Record<string, any>,
): Promise<VideoResult> {
  const params: Record<string, any> = { ...extraParams };
  // ai6700 上游对 duration 要求 int64（Go 后端反序列化），不能用字符串。
  if (opts.duration !== undefined && params.duration === undefined) {
    const n = typeof opts.duration === "number" ? opts.duration : parseInt(String(opts.duration), 10);
    if (!Number.isNaN(n)) params.duration = n;
  } else if (typeof params.duration === "string") {
    const n = parseInt(params.duration, 10);
    if (!Number.isNaN(n)) params.duration = n;
  }
  if (opts.aspectRatio && params.aspect_ratio === undefined && params.aspectRatio === undefined) {
    params.aspect_ratio = opts.aspectRatio;
  }

  let sub: { taskId: string | number };
  let done: UpstreamTaskStatus;
  let usedOpenAIVideo = false;
  try {
    sub = await upstreamSubmitMedia(
      {
        model: opts.model,
        prompt: opts.prompt,
        params,
        count: 1,
      },
      cfg,
    );
    done = await upstreamAwaitTask(sub.taskId, cfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const shouldTryOpenAIVideo =
      /upstream submit 404/i.test(msg) &&
      (/Invalid URL|404 Not Found|nginx|模型不存在或未启用/i.test(msg));
    if (!shouldTryOpenAIVideo) throw e;
    const fallback = await upstreamOpenAIVideo(opts, cfg, params);
    sub = { taskId: fallback.taskId };
    done = fallback.done;
    usedOpenAIVideo = true;
  }
  if (done.state !== "success" || !done.result_urls.length) {
    const err = done.error || `upstream video task failed: state=${done.state}`;
    let hint = "";
    if (err.includes("格式")) {
      hint = "（常见原因：图生视频的 image 字段需要上游可访问的公网 URL，不接受本地 URL/base64）";
    } else if (err.includes("int64") || err.includes("类型") || err.includes("type")) {
      hint = "（常见原因：duration 等数值字段被传成了字符串，应为整数）";
    } else if (err.includes("不合法")) {
      hint = "（常见原因：generation_mode 等枚举字段值不被该模型支持）";
    }
    throw new Error(err + hint);
  }
  return {
    videoUrl: done.result_urls[0],
    duration: opts.duration || 5,
    meta: {
      upstream_task_id: sub.taskId,
      result_type: done.result_type,
      upstream_cost: done.cost,
      fallback_api: usedOpenAIVideo ? "/v1/videos/generations" : undefined,
    },
  };
}

async function upstreamOpenAIVideo(
  opts: VideoOptions,
  cfg: UpstreamConfig,
  params: Record<string, any>,
): Promise<{ taskId: string; done: UpstreamTaskStatus }> {
  const base = mediaBaseUrl(cfg.baseUrl);
  const secondsRaw = params.seconds ?? params.duration ?? opts.duration ?? 4;
  const secondsNum = Number(secondsRaw);
  const seconds = secondsNum === 8 || secondsNum === 12 ? secondsNum : 4;
  const size = params.size === "720x1280" || params.size === "1280x720" ? params.size : undefined;
  const refUrl = params.input_reference || params.image || params.image_url || params.first_frame_image;

  // 星镜AI的视频接口是 OpenAI 风格；只发它实际识别的字段，避免额外 params
  // 被上游转发到模型服务后引发临时 poll timeout。
  const body = stripUndefined({
    model: opts.model,
    prompt: opts.prompt,
    seconds,
    size,
    // 星镜AI图生视频使用 metadata.image_urls；不要传 input_reference，
    // 否则上游可能按错误格式转发并在轮询阶段报 poll timeout。
    metadata: refUrl ? { image_urls: [refUrl] } : undefined,
  });

  let last: { taskId: string; done: UpstreamTaskStatus } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    last = await submitAndPollOpenAIVideo(base, cfg.apiKey, body);
    if (last.done.state !== "failed" || !/temporary|poll timeout|timeout/i.test(last.done.error)) {
      return last;
    }
    console.warn(
      `[upstream video fallback] temporary failure, retrying (${attempt}/2) task=${last.taskId}: ${last.done.error}`,
    );
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return last!;
}

async function submitAndPollOpenAIVideo(
  base: string,
  apiKey: string,
  body: Record<string, any>,
): Promise<{ taskId: string; done: UpstreamTaskStatus }> {
  const submit = await fetch(`${base}/v1/videos/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!submit.ok) {
    const text = await submit.text();
    throw new Error(`upstream video fallback ${submit.status}: ${text.slice(0, 300)}`);
  }
  const created = await submit.json();
  const taskId = String(created?.id || created?.task_id || "");
  if (!taskId) {
    throw new Error(`upstream video fallback: missing task id. raw=${JSON.stringify(created).slice(0, 300)}`);
  }
  console.log(`[upstream video fallback] submitted task=${taskId} model=${body.model} seconds=${body.seconds}`);

  const started = Date.now();
  while (Date.now() - started < 70 * 60 * 1000) {
    const res = await fetch(`${base}/v1/videos/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`upstream video fallback poll ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const status = String(json?.status || "").toLowerCase();
    const errorText = String(json?.error?.message || json?.error || json?.message || "");
    const videoUrl =
      String(json?.videoUrl || json?.video_url || json?.url || json?.output || json?.result_url || "") ||
      (Array.isArray(json?.data) ? String(json.data[0]?.url || "") : "") ||
      (Array.isArray(json?.result_urls) ? String(json.result_urls[0] || "") : "");
    if (status === "succeeded" || status === "success" || status === "completed" || videoUrl) {
      return {
        taskId,
        done: {
          state: "success",
          is_final: true,
          progress: 100,
          result_url: videoUrl,
          result_urls: videoUrl ? [videoUrl] : [],
          result_type: "video",
          error: "",
          cost: Number(json?.cost || 0),
        },
      };
    }
    if (status === "failed" || status === "error" || status === "cancelled" || errorText) {
      return {
        taskId,
        done: {
          state: "failed",
          is_final: true,
          progress: parseProgress(json?.progress),
          result_url: "",
          result_urls: [],
          result_type: "video",
          error: errorText || "video task failed",
          cost: Number(json?.cost || 0),
        },
      };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("upstream video fallback poll timed out");
}
