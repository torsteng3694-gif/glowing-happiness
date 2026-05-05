import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { routeVideo } from "@/lib/providers";
import { chargeUsage } from "@/lib/billing";
import { saveMediaAssets } from "@/lib/media-assets";
import { getChannelsForModel, pickChannel } from "@/lib/channels";
import { rewriteLocalRefsToBase64 } from "@/lib/media-ref";
import { buildVideoRawParams } from "@/lib/comic-agent/helpers";

export const runtime = "nodejs";
// 视频异步任务（grok-video-3 等）最长可能要 10 分钟
export const maxDuration = 900;

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  if (!body?.modelId || !body?.prompt) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const duration = Math.min(Math.max(parseInt(body.duration) || 5, 1), 30);
  const rawParamsIn =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : undefined;

  // 同 prompt 并发提交时给每次请求加独立 seed，避免上游把"完全一样的 body"
  // 当作重复请求返回同一段视频。
  const rawParams: Record<string, unknown> = { ...(rawParamsIn || {}) };
  if (rawParams.seed === undefined || rawParams.seed === null || rawParams.seed === "" || rawParams.seed === 0) {
    rawParams.seed = Math.floor(Math.random() * 2_147_483_647);
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 400 });

  const model = await prisma.model.findUnique({
    where: { id: body.modelId }, include: { provider: true },
  });
  if (!model || model.type !== "video") return NextResponse.json({ error: "模型不可用" }, { status: 400 });

  // 统一视频参数构造：
  // - 不同模型（veo / grok / 即梦 / 可灵 / SD2.0 等）必填字段不同
  // - buildVideoRawParams 会根据 modelSlug 自动补齐关键参数并做 duration 约束
  const frameUrls: string[] = [];
  const tryPush = (v: unknown) => {
    if (typeof v === "string" && v) frameUrls.push(v);
    else if (Array.isArray(v)) for (const it of v) if (typeof it === "string" && it) frameUrls.push(it);
  };
  tryPush(rawParams.image);
  tryPush(rawParams.image_url);
  tryPush(rawParams.images);
  tryPush(rawParams.image_urls);
  tryPush(rawParams.first_frame_image);
  const uniqueFrameUrls = Array.from(new Set(frameUrls));
  const built = buildVideoRawParams({
    modelSlug: model.slug,
    frameUrls: uniqueFrameUrls,
    duration,
    override: rawParams,
  });

  const channelId: string | null = typeof body.channelId === "string" ? body.channelId : null;
  const channel = await pickChannel(model.id, channelId);
  // 显式指定 channelId 且命中时，固定该渠道，不自动降级
  const fallbackChannels = channel ? (channelId && channel.id === channelId ? [] : await getChannelsForModel(model.id)) : [];
  const unitPrice = channel ? channel.sellUnitPrice : model.unitPrice;
  const estimated = unitPrice * duration;
  if (user.balance < estimated) return NextResponse.json({ error: "余额不足" }, { status: 402 });

  // 本地 /uploads URL 上游访问不到；这里自动改写为 base64 data URL 再下发
  let rewrittenParams = await rewriteLocalRefsToBase64(built.params);
  let effectiveDuration = built.effectiveDuration;
  let servedModel = model;
  let servedChannel = channel;
  let fallbackUsed = false;

  const start = Date.now();
  let result;
  try {
    result = await routeVideo(
      {
        model: model.slug,
        prompt: body.prompt,
        duration: effectiveDuration,
        aspectRatio: body.aspectRatio,
        rawParams: rewrittenParams,
      },
      model.provider.slug,
      channel,
      fallbackChannels,
    );
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);

    // 自动兜底：即梦 3.5 Pro 失败后，自动切到 grok-video-3 重试一次
    if (model.slug === "doubao-seedance-1-5-pro-251215") {
      try {
        const grok = await prisma.model.findFirst({
          where: { slug: "grok-video-3", type: "video", enabled: true },
          include: { provider: true },
        });
        if (!grok) throw new Error("兜底模型 grok-video-3 不可用");

        const grokBuilt = buildVideoRawParams({
          modelSlug: grok.slug,
          frameUrls: uniqueFrameUrls,
          duration,
          override: rawParams,
        });
        const grokParams = await rewriteLocalRefsToBase64(grokBuilt.params);
        const grokChannel = await pickChannel(grok.id, null);
        const grokFallbacks = grokChannel ? await getChannelsForModel(grok.id) : [];
        result = await routeVideo(
          {
            model: grok.slug,
            prompt: body.prompt,
            duration: grokBuilt.effectiveDuration,
            aspectRatio: body.aspectRatio,
            rawParams: grokParams,
          },
          grok.provider.slug,
          grokChannel,
          grokFallbacks,
        );
        servedModel = grok;
        servedChannel = grokChannel;
        rewrittenParams = grokParams;
        effectiveDuration = grokBuilt.effectiveDuration;
        fallbackUsed = true;
        console.warn("[api/video] primary failed, fallback to grok-video-3 succeeded:", raw);
      } catch (e2) {
        const raw2 = e2 instanceof Error ? e2.message : String(e2);
        const hint =
          /参数格式错误|格式不对|invalid image|unreachable/i.test(raw2)
            ? "（上游无法访问首帧图，请用可公网访问的 URL，或配置 PUBLIC_BASE_URL 指向公网隧道）"
            : "";
        console.error("[api/video] upstream failed with fallback:", raw, "=>", raw2);
        return NextResponse.json({ error: `视频生成失败：${raw2}${hint}` }, { status: 502 });
      }
    } else {
      const hint =
        /参数格式错误|格式不对|invalid image|unreachable/i.test(raw)
          ? "（上游无法访问首帧图，请用可公网访问的 URL，或配置 PUBLIC_BASE_URL 指向公网隧道）"
          : "";
      console.error("[api/video] upstream failed:", raw);
      return NextResponse.json(
        { error: `视频生成失败：${raw}${hint}` },
        { status: 502 },
      );
    }
  }
  const billing = await chargeUsage({
    userId: user.id, modelId: servedModel.id, channelId: servedChannel?.id ?? null, type: "video",
    units: result.duration, latencyMs: Date.now() - start,
    meta: { prompt: String(body.prompt).slice(0, 200), aspectRatio: body.aspectRatio, ...(rewrittenParams || {}) },
  });

  await saveMediaAssets({
    userId: user.id,
    modelId: servedModel.id,
    type: "video",
    urls: [result.videoUrl],
    prompt: String(body.prompt),
    params: {
      duration: effectiveDuration,
      aspectRatio: body.aspectRatio,
      requestedModel: model.slug,
      servedModel: servedModel.slug,
      fallbackUsed,
      ...(rewrittenParams || {}),
    },
    totalCost: billing.cost,
    thumbnailUrl: result.coverUrl || null,
    durationSec: result.duration,
  }).catch((e) => console.error("saveMediaAssets error", e));

  return NextResponse.json({
    id: crypto.randomUUID(),
    videoUrl: result.videoUrl,
    coverUrl: result.coverUrl,
    duration: result.duration,
    cost: billing.cost,
    balance: billing.balance,
    requestedModel: model.slug,
    servedModel: servedModel.slug,
    fallbackUsed,
  });
}
