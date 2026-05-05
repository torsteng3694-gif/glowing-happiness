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
// 瑙嗛寮傛浠诲姟锛坓rok-video-3 绛夛級鏈?闀垮彲鑳借 10 鍒嗛挓
export const maxDuration = 800; // Vercel Hobby 涓婇檺

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "璇峰厛鐧诲綍" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  if (!body?.modelId || !body?.prompt) return NextResponse.json({ error: "鍙傛暟閿欒" }, { status: 400 });
  const duration = Math.min(Math.max(parseInt(body.duration) || 5, 1), 30);
  const rawParamsIn =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : undefined;

  // 鍚?prompt 骞跺彂鎻愪氦鏃剁粰姣忔璇锋眰鍔犵嫭绔?seed锛岄伩鍏嶄笂娓告妸"瀹屽叏涓?鏍风殑 body"
  // 褰撲綔閲嶅璇锋眰杩斿洖鍚屼竴娈佃棰戙??  const rawParams: Record<string, unknown> = { ...(rawParamsIn || {}) };
  if (rawParams.seed === undefined || rawParams.seed === null || rawParams.seed === "" || rawParams.seed === 0) {
    rawParams.seed = Math.floor(Math.random() * 2_147_483_647);
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "鐢ㄦ埛涓嶅瓨鍦? }, { status: 400 });

  const model = await prisma.model.findUnique({
    where: { id: body.modelId }, include: { provider: true },
  });
  if (!model || model.type !== "video") return NextResponse.json({ error: "妯″瀷涓嶅彲鐢? }, { status: 400 });

  // 缁熶竴瑙嗛鍙傛暟鏋勯?狅細
  // - 涓嶅悓妯″瀷锛坴eo / grok / 鍗虫ⅵ / 鍙伒 / SD2.0 绛夛級蹇呭～瀛楁涓嶅悓
  // - buildVideoRawParams 浼氭牴鎹?modelSlug 鑷姩琛ラ綈鍏抽敭鍙傛暟骞跺仛 duration 绾︽潫
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
  // 鏄惧紡鎸囧畾 channelId 涓斿懡涓椂锛屽浐瀹氳娓犻亾锛屼笉鑷姩闄嶇骇
  const fallbackChannels = channel ? (channelId && channel.id === channelId ? [] : await getChannelsForModel(model.id)) : [];
  const unitPrice = channel ? channel.sellUnitPrice : model.unitPrice;
  const estimated = unitPrice * duration;
  if (user.balance < estimated) return NextResponse.json({ error: "浣欓涓嶈冻" }, { status: 402 });

  // 鏈湴 /uploads URL 涓婃父璁块棶涓嶅埌锛涜繖閲岃嚜鍔ㄦ敼鍐欎负 base64 data URL 鍐嶄笅鍙?  let rewrittenParams = await rewriteLocalRefsToBase64(built.params);
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

    // 鑷姩鍏滃簳锛氬嵆姊?3.5 Pro 澶辫触鍚庯紝鑷姩鍒囧埌 grok-video-3 閲嶈瘯涓?娆?    if (model.slug === "doubao-seedance-1-5-pro-251215") {
      try {
        const grok = await prisma.model.findFirst({
          where: { slug: "grok-video-3", type: "video", enabled: true },
          include: { provider: true },
        });
        if (!grok) throw new Error("鍏滃簳妯″瀷 grok-video-3 涓嶅彲鐢?);

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
          /鍙傛暟鏍煎紡閿欒|鏍煎紡涓嶅|invalid image|unreachable/i.test(raw2)
            ? "锛堜笂娓告棤娉曡闂甯у浘锛岃鐢ㄥ彲鍏綉璁块棶鐨?URL锛屾垨閰嶇疆 PUBLIC_BASE_URL 鎸囧悜鍏綉闅ч亾锛?
            : "";
        console.error("[api/video] upstream failed with fallback:", raw, "=>", raw2);
        return NextResponse.json({ error: `瑙嗛鐢熸垚澶辫触锛?{raw2}${hint}` }, { status: 502 });
      }
    } else {
      const hint =
        /鍙傛暟鏍煎紡閿欒|鏍煎紡涓嶅|invalid image|unreachable/i.test(raw)
          ? "锛堜笂娓告棤娉曡闂甯у浘锛岃鐢ㄥ彲鍏綉璁块棶鐨?URL锛屾垨閰嶇疆 PUBLIC_BASE_URL 鎸囧悜鍏綉闅ч亾锛?
          : "";
      console.error("[api/video] upstream failed:", raw);
      return NextResponse.json(
        { error: `瑙嗛鐢熸垚澶辫触锛?{raw}${hint}` },
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
