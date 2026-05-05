"use client";
import { useState } from "react";
import { Button, Card, Select, Textarea, Badge, Spinner, Label } from "@/components/ui";
import { SafeVideo } from "@/components/media/SafeMedia";
import { ReferenceImagesInput } from "@/components/media/ReferenceImagesInput";
import { Film, Download, AlertTriangle, Clock } from "lucide-react";
import { formatMoney, relativeTime, uid } from "@/lib/utils";

type ChannelOpt = { id: string; name: string; tier: string; sellUnitPrice: number };
type Model = {
  id: string; slug: string; name: string; provider: string; logo: string; unitPrice: number;
  channels: ChannelOpt[];
};

type TaskStatus = "pending" | "running" | "success" | "failed";
type Task = {
  id: string;
  status: TaskStatus;
  prompt: string;
  modelName: string;
  mode: "文生视频" | "图生视频";
  videoUrl?: string;
  coverUrl?: string;
  duration: number;
  cost: number;
  fallbackUsed?: boolean;
  servedModel?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

// 黑猪ai · grok-video-3 专用参数
const GROK_VIDEO_SLUG = "grok-video-3";
const GROK_ASPECT_RATIOS = ["2:3", "3:2", "1:1"] as const;
const GROK_SIZES = ["720P", "1080P"] as const;
const GROK_DURATIONS = [6, 10] as const;

// 字节跳动即梦 · SD 2.0 参考生（kwvideo-v2-ref）专用参数
// 文档：POST /v1/media/generate，params 固定为 { version, duration, aspect_ratio?, resolution?, images }
const KW_VIDEO_REF_SLUG = "kwvideo-v2-ref";
const KW_VERSIONS = ["标准", "快速"] as const;
const KW_DURATIONS = ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const KW_ASPECTS = ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const;
const KW_RESOLUTIONS = ["480p", "720p"] as const;
const KW_MAX_IMAGES = 9;

// OpenAI Sora-2 官转版（sora-2 / sora-2-2）专用参数
// 文档：params 固定为 { seconds, size, input_reference? }
const SORA2_SLUGS = ["sora-2", "sora-2-2"] as const;
const SORA2_SECONDS = ["4", "8", "12"] as const;
const SORA2_SIZES = ["1280x720", "720x1280"] as const;

const MAX_IN_FLIGHT = 10;

type VideoConstraint = {
  durations: number[];
  aspects: string[];
  resolutions?: string[];
  resolutionParam?: "resolution" | "size";
};

// 通用模型参数约束：用于锁定前端下拉，避免用户提交非法组合
const MODEL_CONSTRAINTS: Record<string, VideoConstraint> = {
  "grok-video-3-plus": { durations: [10, 15, 20, 25], aspects: ["16:9", "9:16", "3:2", "2:3", "1:1"], resolutions: ["720P", "1080P"], resolutionParam: "size" },
  "kling-v1": { durations: [5, 10], aspects: ["16:9", "9:16", "1:1"], resolutions: ["720P", "1080P"], resolutionParam: "resolution" },
  "runway-gen3": { durations: [5, 10], aspects: ["16:9", "9:16"], resolutions: ["720P", "1080P"], resolutionParam: "resolution" },
  "luma-dream-machine": { durations: [5, 10], aspects: ["16:9", "9:16"], resolutions: ["720P", "1080P"], resolutionParam: "resolution" },
  "veo-2": { durations: [8], aspects: ["16:9", "9:16"], resolutions: ["720P", "1080P"], resolutionParam: "resolution" },
  "veo3.1": { durations: [8], aspects: ["16:9", "9:16"], resolutions: ["720P", "1080P"], resolutionParam: "resolution" },
  "doubao-seedance-1-5-pro-251215": { durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], aspects: ["16:9", "9:16", "1:1"], resolutions: ["720p", "1080p"], resolutionParam: "resolution" },
};

export default function VideoClient({ models }: { models: Model[] }) {
  const [modelId, setModelId] = useState(models[0]?.id || "");
  const [channelId, setChannelId] = useState<string>(models[0]?.channels?.[0]?.id || "");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState("16:9");
  const [genericResolution, setGenericResolution] = useState("720P");
  // grok-video-3 专用
  const [grokAspect, setGrokAspect] = useState<(typeof GROK_ASPECT_RATIOS)[number]>("3:2");
  const [grokSize, setGrokSize] = useState<(typeof GROK_SIZES)[number]>("1080P");
  const [grokDuration, setGrokDuration] = useState<(typeof GROK_DURATIONS)[number]>(6);
  // kwvideo-v2-ref（即梦 SD 2.0 参考生）专用
  const [kwVersion, setKwVersion] = useState<(typeof KW_VERSIONS)[number]>("快速");
  const [kwDuration, setKwDuration] = useState<(typeof KW_DURATIONS)[number]>("auto");
  const [kwAspect, setKwAspect] = useState<(typeof KW_ASPECTS)[number]>("adaptive");
  const [kwResolution, setKwResolution] = useState<(typeof KW_RESOLUTIONS)[number]>("720p");
  const [kwImages, setKwImages] = useState<string[]>([]); // 1~9 张参考图，必填
  // sora-2（OpenAI 官转视频）专用
  const [sora2Seconds, setSora2Seconds] = useState<(typeof SORA2_SECONDS)[number]>("4");
  const [sora2Size, setSora2Size] = useState<(typeof SORA2_SIZES)[number]>("1280x720");
  const [concurrency, setConcurrency] = useState(1);
  const [firstFrame, setFirstFrame] = useState<string[]>([]); // 最多 1
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");

  const currentModel = models.find((m) => m.id === modelId);
  const currentConstraint = currentModel ? MODEL_CONSTRAINTS[currentModel.slug] : undefined;
  const isGrokVideo = currentModel?.slug === GROK_VIDEO_SLUG;
  const isKwVideoRef = currentModel?.slug === KW_VIDEO_REF_SLUG;
  const isSora2 = !!currentModel?.slug && SORA2_SLUGS.includes(currentModel.slug as (typeof SORA2_SLUGS)[number]);
  const currentChannel = currentModel?.channels.find((c) => c.id === channelId) || currentModel?.channels[0];
  const effectiveUnitPrice = currentChannel ? currentChannel.sellUnitPrice : currentModel?.unitPrice ?? 0;
  // kwvideo duration=auto 时按 15 秒保守估价（上游会返回真实秒数，到时候 backend 以 result.duration 为准计费）
  const effectiveDuration = isGrokVideo
    ? grokDuration
    : isKwVideoRef
      ? (kwDuration === "auto" ? 15 : parseInt(kwDuration, 10))
      : isSora2
        ? parseInt(sora2Seconds, 10)
      : duration;

  const inFlightCount = tasks.filter((t) => t.status === "pending" || t.status === "running").length;
  const capacityLeft = Math.max(0, MAX_IN_FLIGHT - inFlightCount);
  const willLaunch = Math.min(concurrency, capacityLeft);
  const busy = inFlightCount >= MAX_IN_FLIGHT;

  function onModelChange(id: string) {
    setModelId(id);
    const m = models.find((x) => x.id === id);
    setChannelId(m?.channels?.[0]?.id || "");
    const c = m ? MODEL_CONSTRAINTS[m.slug] : undefined;
    if (c) {
      setDuration(c.durations[0] ?? 5);
      setAspect(c.aspects[0] ?? "16:9");
      if (c.resolutions?.length) setGenericResolution(c.resolutions[0]);
    }
  }

  async function runOne(taskId: string, payload: Record<string, unknown>) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status: "running" } : t)));
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { error: `服务返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200) || "空响应"}` };
      }
      if (!res.ok) {
        setTasks((ts) =>
          ts.map((t) =>
            t.id === taskId
              ? { ...t, status: "failed", error: data?.error || `生成失败 (HTTP ${res.status})`, finishedAt: Date.now() }
              : t,
          ),
        );
        return;
      }
      setTasks((ts) =>
        ts.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "success",
                videoUrl: data?.videoUrl,
                coverUrl: data?.coverUrl,
                duration: data?.duration || t.duration,
                cost: data?.cost || 0,
                fallbackUsed: Boolean(data?.fallbackUsed),
                servedModel: data?.servedModel,
                finishedAt: Date.now(),
              }
            : t,
        ),
      );
    } catch (e) {
      setTasks((ts) =>
        ts.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "failed",
                error: e instanceof Error ? e.message : "请求失败",
                finishedAt: Date.now(),
              }
            : t,
        ),
      );
    }
  }

  function generate() {
    if (!prompt.trim() || !modelId || busy || willLaunch === 0) return;
    setError("");

    // kwvideo-v2-ref 强约束：1~9 张参考图，少一张直接报错不发请求
    if (isKwVideoRef) {
      if (kwImages.length < 1) {
        setError("SD 2.0 参考生必须至少上传 1 张参考图片");
        return;
      }
      if (kwImages.length > KW_MAX_IMAGES) {
        setError(`最多上传 ${KW_MAX_IMAGES} 张参考图`);
        return;
      }
    }

    const basePayload: Record<string, unknown> = {
      modelId,
      channelId: channelId || undefined,
      prompt: prompt.trim(),
    };
    const params: Record<string, unknown> = {};

    if (isGrokVideo) {
      basePayload.duration = grokDuration;
      basePayload.aspectRatio = grokAspect;
      params.aspect_ratio = grokAspect;
      params.size = grokSize;
      params.duration = String(grokDuration);
    } else if (isKwVideoRef) {
      // 参考星爷ai 接入文档：params 里固定字段是 version/duration/aspect_ratio/resolution/images
      // duration 可能是 "auto" 或 "4"~"15" 字符串，body.duration 给 backend 计费用（auto→15）
      basePayload.duration = effectiveDuration;
      basePayload.aspectRatio = kwAspect === "adaptive" ? "16:9" : kwAspect;
      params.version = kwVersion;
      params.duration = kwDuration;
      params.aspect_ratio = kwAspect;
      params.resolution = kwResolution;
      params.images = kwImages;
    } else if (isSora2) {
      // sora-2 文档约定：params.seconds / params.size / params.input_reference?
      basePayload.duration = parseInt(sora2Seconds, 10);
      basePayload.aspectRatio = sora2Size === "1280x720" ? "16:9" : "9:16";
      params.seconds = sora2Seconds;
      params.size = sora2Size;
    } else {
      const d = currentConstraint ? (currentConstraint.durations.includes(duration) ? duration : currentConstraint.durations[0]) : duration;
      const a = currentConstraint ? (currentConstraint.aspects.includes(aspect) ? aspect : currentConstraint.aspects[0]) : aspect;
      basePayload.duration = d;
      basePayload.aspectRatio = a;
      if (currentConstraint?.resolutions?.length && currentConstraint.resolutionParam) {
        const fallbackRes = currentConstraint.resolutions[0];
        const pickedRes = currentConstraint.resolutions.includes(genericResolution) ? genericResolution : fallbackRes;
        params[currentConstraint.resolutionParam] = pickedRes;
      }
    }

    // 图生视频：把首帧参考图塞到上游。不同上游字段名不一致，全部覆盖一遍，
    // 上游自己取它认识的那个（ai6700 / 黑猪 / 可灵 / MiniMax 常见字段都覆盖）。
    // kwvideo-v2-ref 自己用 params.images 多图参考，不走这条路径。
    if (firstFrame.length > 0 && !isKwVideoRef) {
      const u = firstFrame[0];
      params.image = u;
      params.image_url = u;
      params.first_frame_image = u;
      params.images = [u];
      if (isSora2) {
        params.input_reference = u;
      }
    }

    if (Object.keys(params).length > 0) basePayload.params = params;

    const isImg2Video = firstFrame.length > 0 || (isKwVideoRef && kwImages.length > 0);
    const newTasks: Task[] = [];
    for (let i = 0; i < willLaunch; i++) {
      newTasks.push({
        id: uid(),
        status: "pending",
        prompt: prompt.trim(),
        modelName: currentModel?.name || "",
        mode: isImg2Video ? "图生视频" : "文生视频",
        duration: effectiveDuration,
        cost: 0,
        startedAt: Date.now(),
      });
    }
    setTasks((ts) => [...newTasks, ...ts]);

    // 每个任务独立 seed，避免并发提交完全相同的 payload
    // 被上游按相同请求去重，返回同一段视频
    for (const t of newTasks) {
      const perTaskParams: Record<string, unknown> = {
        ...((basePayload.params as Record<string, unknown> | undefined) ?? {}),
        seed: Math.floor(Math.random() * 2_147_483_647),
      };
      const perTaskPayload = { ...basePayload, params: perTaskParams };
      runOne(t.id, perTaskPayload);
    }
  }

  function clearCompleted() {
    setTasks((ts) => ts.filter((t) => t.status === "pending" || t.status === "running"));
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">视频生成</h1>
        <p className="text-slate-500 mt-1 text-sm">
          文生视频 / 图生视频 · 支持最多同时跑 <b>{MAX_IN_FLIGHT}</b> 个任务
        </p>
      </div>

      <Card className="p-6">
        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-4">
            <div>
              <Label>描述 Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例：太空中漂浮的宇航员向地球挥手，星云背景，电影质感，镜头缓慢拉近"
                className="min-h-[120px]"
              />
            </div>

            {isKwVideoRef ? (
              <ReferenceImagesInput
                value={kwImages}
                onChange={setKwImages}
                max={KW_MAX_IMAGES}
                label={`参考图片（必填，1~${KW_MAX_IMAGES} 张）`}
                hint="SD 2.0 参考生要求至少 1 张、最多 9 张。模型会智能融合风格/元素/构图生成新视频。支持 JPEG/PNG/WebP/BMP/TIFF/GIF，单张 ≤ 30MB。"
              />
            ) : (
              <ReferenceImagesInput
                value={firstFrame}
                onChange={setFirstFrame}
                max={1}
                label={isSora2 ? "参考图（可选，最多 1 张）" : "首帧参考图 / 图生视频（可选）"}
                hint={
                  isSora2
                    ? "Sora-2 支持可选 1 张 input_reference。建议横版(1280x720) 传横图、竖版(720x1280) 传竖图。"
                    : "上传或粘贴 URL；附上后，本次调用将作为「图生视频」，视频会从这一帧开始生成。单张 ≤ 5MB。"
                }
              />
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label>模型</Label>
              <Select value={modelId} onChange={(e) => onModelChange(e.target.value)} className="w-full">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.logo} {m.name}</option>
                ))}
              </Select>
              {currentModel && <div className="mt-2 text-xs text-slate-500">¥ {effectiveUnitPrice} / 秒</div>}
            </div>
            {currentModel && currentModel.channels.length > 0 && (
              <div>
                <Label>渠道档位</Label>
                <Select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full">
                  {currentModel.channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · ¥{c.sellUnitPrice}/秒</option>
                  ))}
                </Select>
              </div>
            )}
            {isGrokVideo ? (
              <>
                <div>
                  <Label>时长</Label>
                  <Select
                    value={grokDuration}
                    onChange={(e) => setGrokDuration(parseInt(e.target.value) as (typeof GROK_DURATIONS)[number])}
                    className="w-full"
                  >
                    {GROK_DURATIONS.map((d) => <option key={d} value={d}>{d} 秒</option>)}
                  </Select>
                </div>
                <div>
                  <Label>画面比例</Label>
                  <Select
                    value={grokAspect}
                    onChange={(e) => setGrokAspect(e.target.value as (typeof GROK_ASPECT_RATIOS)[number])}
                    className="w-full"
                  >
                    {GROK_ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>画质</Label>
                  <Select
                    value={grokSize}
                    onChange={(e) => setGrokSize(e.target.value as (typeof GROK_SIZES)[number])}
                    className="w-full"
                  >
                    {GROK_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                <div className="text-[11px] leading-5 text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  该模型为<b>异步任务</b>，通常需要 1 ~ 10 分钟。请求发起后卡片会保持 running 直到拿到结果。
                </div>
              </>
            ) : isKwVideoRef ? (
              <>
                <div>
                  <Label>速度版本</Label>
                  <Select
                    value={kwVersion}
                    onChange={(e) => setKwVersion(e.target.value as (typeof KW_VERSIONS)[number])}
                    className="w-full"
                  >
                    {KW_VERSIONS.map((v) => (
                      <option key={v} value={v}>
                        {v === "标准" ? "标准版（质量更高）" : "快速版（更快更便宜）"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>视频时长</Label>
                  <Select
                    value={kwDuration}
                    onChange={(e) => setKwDuration(e.target.value as (typeof KW_DURATIONS)[number])}
                    className="w-full"
                  >
                    {KW_DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d === "auto" ? "自动（模型决定）" : `${d} 秒`}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>宽高比</Label>
                  <Select
                    value={kwAspect}
                    onChange={(e) => setKwAspect(e.target.value as (typeof KW_ASPECTS)[number])}
                    className="w-full"
                  >
                    {KW_ASPECTS.map((r) => (
                      <option key={r} value={r}>
                        {r === "adaptive" ? "自适应（按参考图）" : r}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>分辨率</Label>
                  <Select
                    value={kwResolution}
                    onChange={(e) => setKwResolution(e.target.value as (typeof KW_RESOLUTIONS)[number])}
                    className="w-full"
                  >
                    {KW_RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r === "480p" ? "480p（更便宜）" : "720p（高清）"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="text-[11px] leading-5 text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <div><b>即梦 Seedance 2.0</b> · 字节跳动参考生视频，自动生成<b>有声视频</b>。</div>
                  <div className="mt-1">
                    必须上传 <b>1~9 张</b> 参考图，模型会融合风格/元素/构图。异步任务，通常 1~10 分钟。
                  </div>
                </div>
              </>
            ) : isSora2 ? (
              <>
                <div>
                  <Label>视频时长</Label>
                  <Select
                    value={sora2Seconds}
                    onChange={(e) => setSora2Seconds(e.target.value as (typeof SORA2_SECONDS)[number])}
                    className="w-full"
                  >
                    {SORA2_SECONDS.map((s) => <option key={s} value={s}>{s} 秒</option>)}
                  </Select>
                </div>
                <div>
                  <Label>画面比例</Label>
                  <Select
                    value={sora2Size}
                    onChange={(e) => setSora2Size(e.target.value as (typeof SORA2_SIZES)[number])}
                    className="w-full"
                  >
                    <option value="1280x720">横屏 1280×720</option>
                    <option value="720x1280">竖屏 720×1280</option>
                  </Select>
                </div>
                <div className="text-[11px] leading-5 text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <div><b>Sora-2 官转版</b> · 价格较高但成功率和质量更稳，异步任务通常 1~10 分钟。</div>
                  <div className="mt-1">
                    智能调度大概率命中高价分组；建议横版传横图、竖版传竖图，避免比例错配。
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>时长（秒）</Label>
                  <Select value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} className="w-full">
                    {(currentConstraint?.durations ?? [3, 5, 8, 10]).map((d) => <option key={d} value={d}>{d} 秒</option>)}
                  </Select>
                </div>
                <div>
                  <Label>画幅</Label>
                  <Select value={aspect} onChange={(e) => setAspect(e.target.value)} className="w-full">
                    {(currentConstraint?.aspects ?? ["16:9", "9:16", "1:1"]).map((a) => (
                      <option key={a} value={a}>
                        {a === "16:9" ? "横屏 16:9" : a === "9:16" ? "竖屏 9:16" : a === "1:1" ? "方形 1:1" : a}
                      </option>
                    ))}
                  </Select>
                </div>
                {currentConstraint?.resolutions?.length ? (
                  <div>
                    <Label>分辨率</Label>
                    <Select
                      value={genericResolution}
                      onChange={(e) => setGenericResolution(e.target.value)}
                      className="w-full"
                    >
                      {currentConstraint.resolutions.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </>
            )}

            <div>
              <Label>并发任务数</Label>
              <Select
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                className="w-full"
              >
                {Array.from({ length: MAX_IN_FLIGHT }, (_, i) => i + 1).map((i) => (
                  <option key={i} value={i}>{i} 个任务</option>
                ))}
              </Select>
              <div className="mt-1 text-[11px] text-slate-400">
                在跑 {inFlightCount}/{MAX_IN_FLIGHT}，这次会发起 {willLaunch} 个
              </div>
            </div>

            <div className="text-sm text-slate-600">
              单任务预计消费：<span className="font-semibold text-slate-900">¥ {formatMoney(effectiveUnitPrice * effectiveDuration)}</span>
              {willLaunch > 1 && (
                <span className="ml-2 text-xs text-slate-400">
                  × {willLaunch} = ¥ {formatMoney(effectiveUnitPrice * effectiveDuration * willLaunch)}
                </span>
              )}
            </div>
            <Button
              onClick={generate}
              disabled={
                busy ||
                !prompt.trim() ||
                willLaunch === 0 ||
                (isKwVideoRef && kwImages.length === 0)
              }
              className="w-full"
              size="lg"
            >
              <Film className="w-4 h-4" />
              {busy
                ? "已达最大并发"
                : isKwVideoRef
                  ? kwImages.length === 0
                    ? "请先上传参考图"
                    : `开始参考生视频（${willLaunch} 任务）`
                  : firstFrame.length > 0
                    ? `开始图生视频（${willLaunch} 任务）`
                    : `开始生成（${willLaunch} 任务）`}
            </Button>
            {error && <div className="text-sm text-rose-600">{error}</div>}
          </div>
        </div>
      </Card>

      {tasks.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            共 <b>{tasks.length}</b> 个任务，
            在跑 <b>{inFlightCount}</b>，
            已完成 <b>{tasks.filter((t) => t.status === "success").length}</b>，
            失败 <b>{tasks.filter((t) => t.status === "failed").length}</b>
          </div>
          <Button size="sm" variant="outline" onClick={clearCompleted} disabled={tasks.every((t) => t.status === "pending" || t.status === "running")}>
            清理已结束
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {tasks.map((t) => (
          <Card key={t.id} className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-sm text-slate-500 inline-flex items-center gap-2">
                  {t.modelName}
                  <Badge color={t.mode === "图生视频" ? "violet" : "amber"}>{t.mode}</Badge>
                  <span>· {t.duration}s</span>
                  {t.status === "success" && <span>· ¥ {formatMoney(t.cost, 4)}</span>}
                  {t.status === "success" && t.fallbackUsed && (
                    <Badge color="amber">已自动切模型：{t.servedModel || "fallback"}</Badge>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {t.finishedAt
                      ? `${Math.round((t.finishedAt - t.startedAt) / 1000)}s`
                      : `${Math.round((Date.now() - t.startedAt) / 1000)}s`}
                  </span>
                </div>
                <div className="font-medium mt-1 line-clamp-1 max-w-2xl">{t.prompt}</div>
              </div>
              <div>
                {t.status === "pending" && <Badge color="slate">排队中</Badge>}
                {t.status === "running" && (
                  <Badge color="brand" className="inline-flex items-center gap-1">
                    <Spinner /> 生成中
                  </Badge>
                )}
                {t.status === "success" && <Badge color="green">{relativeTime(new Date(t.startedAt).toISOString())}</Badge>}
                {t.status === "failed" && (
                  <Badge color="rose" className="inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> 失败
                  </Badge>
                )}
              </div>
            </div>

            {t.status === "failed" && t.error && (
              <div className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
                {t.error}
              </div>
            )}

            {t.status === "pending" || t.status === "running" ? (
              <div className="mt-4 rounded-xl bg-slate-900/80 aspect-video flex items-center justify-center text-white text-sm gap-2">
                <Spinner /> 视频生成中，请稍候…
              </div>
            ) : t.status === "success" && t.videoUrl ? (
              <>
                <div className="mt-4 rounded-xl overflow-hidden bg-black aspect-video">
                  <SafeVideo src={t.videoUrl} poster={t.coverUrl} controls className="w-full h-full" />
                </div>
                <div className="mt-3 flex justify-end">
                  <a href={t.videoUrl} download target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                    <Download className="w-4 h-4" /> 下载视频
                  </a>
                </div>
              </>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
