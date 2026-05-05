"use client";
import { useMemo, useState } from "react";
import { Button, Card, Select, Textarea, Badge, Spinner, Label } from "@/components/ui";
import { SafeImage } from "@/components/media/SafeMedia";
import { ReferenceImagesInput } from "@/components/media/ReferenceImagesInput";
import { Sparkles, Download, AlertTriangle, Clock } from "lucide-react";
import { formatMoney, uid } from "@/lib/utils";

type ChannelOpt = {
  id: string;
  name: string;
  tier: string;
  priority: number;
  sellUnitPrice: number;
  upstreamName: string;
  upstreamSlug: string;
  optionPrices: { paramKey: string; optionValue: string; sellUnitPrice: number }[];
};

/** 按 (channel, params) 算出这次调用会被扣多少钱。和后端 resolveEffectivePriceFromLoaded 保持一致。 */
function pickDisplayUnitPrice(channel: ChannelOpt, params: Record<string, unknown>): number {
  for (const key of ["imageSize"]) {
    const v = params[key];
    if (v === undefined || v === null) continue;
    const vs = String(v);
    const hit = channel.optionPrices.find((o) => o.paramKey === key && o.optionValue === vs);
    if (hit) return hit.sellUnitPrice;
  }
  return channel.sellUnitPrice;
}

type Model = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  logo: string;
  unitPrice: number;
  tags: string[];
  channels: ChannelOpt[];
};

type TaskStatus = "pending" | "running" | "success" | "failed";
type Task = {
  id: string;
  status: TaskStatus;
  prompt: string;
  modelName: string;
  mode: "文生图" | "图生图";
  images: { url: string }[];
  cost: number;
  error?: string;
  startedAt: number;
  finishedAt?: number;
};

const SIZES = ["1024x1024", "1024x1792", "1792x1024", "512x512"];

// 星爷ai · Nano Banana 系列专用参数
const NANO_BANANA_SLUGS = ["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"] as const;
const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];
const IMAGE_SIZES = ["0.5K", "1K", "2K", "4K"] as const;

// 星爷ai · GPT Image 2.0 专用参数
const GPT_IMAGE2_SLUG = "gpt-image-2-all";
const GPT_IMAGE2_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
const GPT_IMAGE2_MAX_REFS = 10;
const MIDJOURNEY_SLUG = "mj_imagine";
const MIDJOURNEY_BOT_TYPES = ["MID_JOURNEY", "NIJI_JOURNEY"] as const;
const MIDJOURNEY_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9"] as const;
const MIDJOURNEY_QUALITY = ["0.25", "0.5", "1", "2"] as const;
const MIDJOURNEY_STYLIZE = ["0", "50", "100", "250", "500", "750", "1000"] as const;
const MIDJOURNEY_CHAOS = ["0", "25", "50", "75", "100"] as const;
const MIDJOURNEY_STYLE = ["", "raw"] as const;
const GROK42_IMAGE_SLUG = "grok-4.2-image";
const GROK42_IMAGE_SIZES = [
  "1024x1024", "1080x1080", "1200x1200", "2048x2048", "2160x2160",
  "1280x720", "1366x768", "1600x900", "1920x1080", "2048x1152", "2560x1440",
  "1024x768", "1280x960", "2048x1536",
  "720x1280", "768x1366", "900x1600", "1080x1920", "1440x2560",
] as const;

/** 前端/后端共识：系统允许的同时在跑的任务数上限 */
const MAX_IN_FLIGHT = 10;

export default function ImageClient({ models }: { models: Model[] }) {
  const [modelId, setModelId] = useState(models[0]?.id || "");
  // channelId = "" 表示「自动（按优先级 · 故障自动降级）」
  const [channelId, setChannelId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(SIZES[0]);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState<(typeof IMAGE_SIZES)[number]>("2K");
  const [gptImage2Size, setGptImage2Size] = useState<(typeof GPT_IMAGE2_SIZES)[number]>("1024x1024");
  const [mjBotType, setMjBotType] = useState<(typeof MIDJOURNEY_BOT_TYPES)[number]>("MID_JOURNEY");
  const [mjAspectRatio, setMjAspectRatio] = useState<(typeof MIDJOURNEY_ASPECTS)[number]>("1:1");
  const [mjQuality, setMjQuality] = useState<(typeof MIDJOURNEY_QUALITY)[number]>("1");
  const [mjStylize, setMjStylize] = useState<(typeof MIDJOURNEY_STYLIZE)[number]>("100");
  const [mjChaos, setMjChaos] = useState<(typeof MIDJOURNEY_CHAOS)[number]>("0");
  const [mjStyle, setMjStyle] = useState<(typeof MIDJOURNEY_STYLE)[number]>("");
  const [grok42Size, setGrok42Size] = useState<(typeof GROK42_IMAGE_SIZES)[number]>("1024x1024");
  const [n, setN] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [refImages, setRefImages] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");

  const currentModel = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const isNanoBanana = !!currentModel?.slug && NANO_BANANA_SLUGS.includes(currentModel.slug as (typeof NANO_BANANA_SLUGS)[number]);
  const isGptImage2 = currentModel?.slug === GPT_IMAGE2_SLUG;
  const isMidjourney = currentModel?.slug === MIDJOURNEY_SLUG;
  const isGrok42Image = currentModel?.slug === GROK42_IMAGE_SLUG;

  // 当前模型允许的参考图上限：GPT Image 2.0 最多 10 张，其它 4 张
  const maxRefs = isGptImage2 ? GPT_IMAGE2_MAX_REFS : isGrok42Image ? 1 : 4;
  // 未选渠道时（自动模式）用优先级最高的那一条估价
  const currentChannel = useMemo(
    () => currentModel?.channels.find((c) => c.id === channelId) || currentModel?.channels[0],
    [currentModel, channelId],
  );
  const isAutoChannel = !channelId;

  // 本次调用会发给后端的参数（用于估价显示）
  const requestParams = useMemo(
    () =>
      isNanoBanana
        ? { aspectRatio, imageSize }
        : isMidjourney
          ? {
              botType: mjBotType,
              aspectRatio: mjAspectRatio,
              quality: mjQuality,
              stylize: mjStylize,
              chaos: mjChaos,
              ...(mjStyle ? { style: mjStyle } : {}),
            }
        : isGrok42Image
          ? { size: grok42Size }
        : isGptImage2
          ? { size: gptImage2Size }
          : { size },
    [isNanoBanana, isMidjourney, isGrok42Image, isGptImage2, aspectRatio, imageSize, mjBotType, mjAspectRatio, mjQuality, mjStylize, mjChaos, mjStyle, grok42Size, gptImage2Size, size],
  );

  const effectiveUnitPrice = currentChannel
    ? pickDisplayUnitPrice(currentChannel, requestParams)
    : currentModel?.unitPrice ?? 0;
  const hitOptionOverride =
    currentChannel &&
    currentChannel.optionPrices.some((o) => o.paramKey === "imageSize" && o.optionValue === imageSize);

  const inFlightCount = tasks.filter((t) => t.status === "pending" || t.status === "running").length;
  const capacityLeft = Math.max(0, MAX_IN_FLIGHT - inFlightCount);
  const willLaunch = Math.min(concurrency, capacityLeft);
  const busy = inFlightCount >= MAX_IN_FLIGHT;
  const nPerTask = isGrok42Image ? 2 : n;

  function onModelChange(id: string) {
    setModelId(id);
    setChannelId("");
    // 切模型时，如果当前参考图数量超过新模型允许的上限，裁掉多余的
    const next = models.find((m) => m.id === id);
    const nextMax = next?.slug === GPT_IMAGE2_SLUG ? GPT_IMAGE2_MAX_REFS : 4;
    setRefImages((arr) => (arr.length > nextMax ? arr.slice(0, nextMax) : arr));
  }

  async function runOne(taskId: string, payload: Record<string, unknown>) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status: "running" } : t)));
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // 兼容后端崩了返回 HTML / 空 body：先读文本，再尽力 parse
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
                images: data?.images || [],
                cost: data?.cost || 0,
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
    const effectiveN = isGrok42Image ? 2 : n;

    // 为图生图，reference images 附在 params 里（NanoBanana / GPT Image 2 风格都用 `images` 数组）。
    const commonParams: Record<string, unknown> = isNanoBanana
      ? { aspectRatio, imageSize }
      : isMidjourney
        ? {
            botType: mjBotType,
            aspectRatio: mjAspectRatio,
            quality: mjQuality,
            stylize: mjStylize,
            chaos: mjChaos,
            ...(mjStyle ? { style: mjStyle } : {}),
          }
      : isGrok42Image
        ? { size: grok42Size }
      : isGptImage2
        ? { size: gptImage2Size }
        : {};
    if (refImages.length > 0) {
      commonParams.images = refImages;
    }

    const basePayload: Record<string, unknown> = {
      modelId,
      prompt: prompt.trim(),
      n: effectiveN,
    };
    if (channelId) basePayload.channelId = channelId;
    // 仅普通 OpenAI DALL·E 风格模型使用顶层 size；NanoBanana / GPT Image 2 的 size 走 params
    if (!isNanoBanana && !isGptImage2 && !isMidjourney && !isGrok42Image) basePayload.size = size;
    if (Object.keys(commonParams).length > 0) basePayload.params = commonParams;

    const isImg2Img = refImages.length > 0;
    const newTasks: Task[] = [];
    for (let i = 0; i < willLaunch; i++) {
      newTasks.push({
        id: uid(),
        status: "pending",
        prompt: prompt.trim(),
        modelName: currentModel?.name || "",
        mode: isImg2Img ? "图生图" : "文生图",
        images: [],
        cost: 0,
        startedAt: Date.now(),
      });
    }
    setTasks((ts) => [...newTasks, ...ts]);

    // 并发发起（不 await，UI 异步更新）
    // 每个任务注入独立的随机 seed，避免上游对完全相同的 payload
    // 返回同一张缓存图（Nano Banana Pro 等确定性模型尤其明显）
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
        <h1 className="text-2xl font-bold">图像生成</h1>
        <p className="text-slate-500 mt-1 text-sm">
          文生图 / 图生图 · 支持最多同时跑 <b>{MAX_IN_FLIGHT}</b> 个任务
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
                placeholder="例：未来赛博朋克风格的城市夜景，霓虹灯，潮湿街道，电影感，8K 高清"
                className="min-h-[120px]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "一只戴着墨镜的柴犬，在冲浪板上，热带海滩背景，卡通风格",
                "极简几何图形，柔和粉彩配色，作为 app 启动页背景",
                "蒸汽朋克风格的机械蝴蝶，金属质感，特写，工作室灯光",
              ].map((p) => (
                <button key={p} onClick={() => setPrompt(p)} className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700">
                  {p.slice(0, 16)}...
                </button>
              ))}
            </div>

            <ReferenceImagesInput
              value={refImages}
              onChange={setRefImages}
              max={maxRefs}
              label="参考图 / 图生图（可选）"
              hint={`上传或粘贴 URL；附上参考图后，本次调用将作为「图生图」发给上游。单张 ≤ 10MB，最多 ${maxRefs} 张。`}
            />
          </div>

          <div className="space-y-4">
            <div>
              <Label>模型</Label>
              <Select value={modelId} onChange={(e) => onModelChange(e.target.value)} className="w-full">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.logo} {m.name}</option>
                ))}
              </Select>
              {currentModel && (
                <div className="mt-2 text-xs text-slate-500">
                  ¥ {effectiveUnitPrice} / 张 · {currentModel.provider}
                </div>
              )}
              {currentModel && currentModel.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {currentModel.tags.map((t) => (
                    <Badge key={t} color="brand">{t}</Badge>
                  ))}
                </div>
              )}
            </div>

            {currentModel && currentModel.channels.length > 0 && (
              <div>
                <Label>渠道档位</Label>
                <Select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full">
                  <option value="">自动（按优先级 · 故障自动降级）</option>
                  {currentModel.channels.map((c) => {
                    const p = pickDisplayUnitPrice(c, requestParams);
                    const hasOverride = c.optionPrices.some((o) => o.paramKey === "imageSize" && o.optionValue === imageSize);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name}（{c.upstreamName}）· ¥{p}/张{hasOverride ? ` · ${imageSize} 专属价` : ""}
                      </option>
                    );
                  })}
                </Select>
                <div className="mt-1 text-[11px] text-slate-400">
                  {isAutoChannel
                    ? `当前：自动挑选最高优先级的可用渠道，上游失败会自动降级`
                    : `已锁定一条渠道，不会自动降级`}
                </div>
              </div>
            )}

            {isNanoBanana ? (
              <>
                <div>
                  <Label>图片比例</Label>
                  <Select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full">
                    {ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>分辨率</Label>
                  <Select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as (typeof IMAGE_SIZES)[number])}
                    className="w-full"
                  >
                    {IMAGE_SIZES.map((s) => {
                      const p = currentChannel ? pickDisplayUnitPrice(currentChannel, { ...requestParams, imageSize: s }) : null;
                      return (
                        <option key={s} value={s}>{s}{p !== null ? ` · ¥${p}/张` : ""}</option>
                      );
                    })}
                  </Select>
                  {hitOptionOverride && (
                    <div className="mt-1 text-[11px] text-violet-600">
                      当前分辨率在此渠道走专属价 ¥{effectiveUnitPrice}/张
                    </div>
                  )}
                </div>
                <div className="text-[11px] leading-5 text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  该模型为<b>异步任务</b>，通常需要 20 秒 ~ 2 分钟。请求发起后卡片会进入 running 状态直到拿到结果。
                </div>
              </>
            ) : isMidjourney ? (
              <>
                <div>
                  <Label>模型风格</Label>
                  <Select value={mjBotType} onChange={(e) => setMjBotType(e.target.value as (typeof MIDJOURNEY_BOT_TYPES)[number])} className="w-full">
                    {MIDJOURNEY_BOT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>图片比例</Label>
                  <Select value={mjAspectRatio} onChange={(e) => setMjAspectRatio(e.target.value as (typeof MIDJOURNEY_ASPECTS)[number])} className="w-full">
                    {MIDJOURNEY_ASPECTS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>质量</Label>
                    <Select value={mjQuality} onChange={(e) => setMjQuality(e.target.value as (typeof MIDJOURNEY_QUALITY)[number])} className="w-full">
                      {MIDJOURNEY_QUALITY.map((v) => <option key={v} value={v}>{v}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>风格</Label>
                    <Select value={mjStyle} onChange={(e) => setMjStyle(e.target.value as (typeof MIDJOURNEY_STYLE)[number])} className="w-full">
                      {MIDJOURNEY_STYLE.map((v) => <option key={v} value={v}>{v || "default"}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>风格化</Label>
                    <Select value={mjStylize} onChange={(e) => setMjStylize(e.target.value as (typeof MIDJOURNEY_STYLIZE)[number])} className="w-full">
                      {MIDJOURNEY_STYLIZE.map((v) => <option key={v} value={v}>{v}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>混乱度</Label>
                    <Select value={mjChaos} onChange={(e) => setMjChaos(e.target.value as (typeof MIDJOURNEY_CHAOS)[number])} className="w-full">
                      {MIDJOURNEY_CHAOS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="text-[11px] leading-5 text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Midjourney 为<b>异步任务</b>，支持最多 4 张参考图作为垫图（图生图）。
                </div>
              </>
            ) : isGrok42Image ? (
              <>
                <div>
                  <Label>图片尺寸</Label>
                  <Select
                    value={grok42Size}
                    onChange={(e) => setGrok42Size(e.target.value as (typeof GROK42_IMAGE_SIZES)[number])}
                    className="w-full"
                  >
                    {GROK42_IMAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                <div className="text-[11px] leading-5 text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  该模型固定每次返回 <b>2 张</b> 图片，最多 1 张参考图。
                </div>
              </>
            ) : isGptImage2 ? (
              <>
                <div>
                  <Label>尺寸</Label>
                  <Select
                    value={gptImage2Size}
                    onChange={(e) => setGptImage2Size(e.target.value as (typeof GPT_IMAGE2_SIZES)[number])}
                    className="w-full"
                  >
                    {GPT_IMAGE2_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                        {s === "1024x1024" ? " · 方形" : s === "1536x1024" ? " · 横向" : " · 纵向"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="text-[11px] leading-5 text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  该模型为<b>异步任务</b>，通常需要 20 秒 ~ 2 分钟。支持最多 {GPT_IMAGE2_MAX_REFS} 张参考图做图生图。
                </div>
              </>
            ) : (
              <div>
                <Label>尺寸</Label>
                <Select value={size} onChange={(e) => setSize(e.target.value)} className="w-full">
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>单次张数</Label>
                {isGrok42Image ? (
                  <div className="h-10 px-3 rounded-lg border border-slate-300 bg-slate-50 text-sm flex items-center text-slate-600">
                    固定 2 张
                  </div>
                ) : (
                  <Select value={n} onChange={(e) => setN(parseInt(e.target.value))} className="w-full">
                    {[1, 2, 3, 4].map((i) => <option key={i} value={i}>{i} 张</option>)}
                  </Select>
                )}
              </div>
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
            </div>

            <div className="text-sm text-slate-600">
              单任务预计消费：<span className="font-semibold text-slate-900">¥ {formatMoney(effectiveUnitPrice * nPerTask)}</span>
              {willLaunch > 1 && (
                <span className="ml-2 text-xs text-slate-400">
                  × {willLaunch} = ¥ {formatMoney(effectiveUnitPrice * nPerTask * willLaunch)}
                </span>
              )}
            </div>
            <Button onClick={generate} disabled={busy || !prompt.trim() || willLaunch === 0} className="w-full" size="lg">
              <Sparkles className="w-4 h-4" />
              {busy ? "已达最大并发" : refImages.length > 0 ? `开始图生图（${willLaunch} 任务）` : `开始生成（${willLaunch} 任务）`}
            </Button>
            {error && <div className="text-sm text-rose-600">{error}</div>}
          </div>
        </div>
      </Card>

      {/* Tasks */}
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
                  <Badge color={t.mode === "图生图" ? "violet" : "slate"}>{t.mode}</Badge>
                  {t.status === "success" && <span>¥ {formatMoney(t.cost, 4)}</span>}
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
                {t.status === "success" && <Badge color="green">{t.images.length} 张</Badge>}
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

            {t.status !== "success" ? (
              t.status === "pending" || t.status === "running" ? (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Array.from({ length: nPerTask }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse flex items-center justify-center"
                    >
                      <Spinner />
                    </div>
                  ))}
                </div>
              ) : null
            ) : (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {t.images.map((img, i) => (
                  <div key={i} className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                    <SafeImage src={img.url} alt="" className="w-full h-full object-cover" />
                    <a href={img.url} download target="_blank" rel="noreferrer"
                       className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition w-8 h-8 rounded-lg bg-black/60 text-white flex items-center justify-center">
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
