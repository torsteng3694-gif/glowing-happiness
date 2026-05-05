import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { routeImage } from "@/lib/providers";
import { chargeUsage } from "@/lib/billing";
import { saveMediaAssets } from "@/lib/media-assets";
import { getChannelsForModel, pickChannel } from "@/lib/channels";
import { resolveEffectivePriceFromLoaded } from "@/lib/channel-option-pricing";
import { rewriteLocalRefsToBase64 } from "@/lib/media-ref";

export const runtime = "nodejs";
// 寮傛鍥惧儚锛坣ano-banana-pro 绛夛級+ 鍥剧敓鍥惧彲鑳借 1~3 鍒嗛挓
export const maxDuration = 800;

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "璇峰厛鐧诲綍" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  if (!body?.modelId || !body?.prompt) return NextResponse.json({ error: "鍙傛暟閿欒" }, { status: 400 });
  const n = Math.min(Math.max(parseInt(body.n) || 1, 1), 4);
  const size = typeof body.size === "string" ? body.size : undefined;
  const rawParamsIn =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : undefined;

  // 骞跺彂鎻愪氦鍚?prompt 鏃讹紝涓婃父锛圢ano Banana Pro 绛夛級鍙兘浼氬洜璇锋眰 payload
  // 瀹屽叏涓?鑷磋?岃繑鍥炲悓涓?寮犵紦瀛樺浘銆傝繖閲屽鏋滆皟鐢ㄦ柟娌′紶 seed锛屽氨鍏滃簳琛ヤ竴涓?  // 闅忔満 seed锛岃姣忔璇锋眰鐨?body 涓嶅悓銆?  const rawParams: Record<string, unknown> = { ...(rawParamsIn || {}) };
  if (rawParams.seed === undefined || rawParams.seed === null || rawParams.seed === "" || rawParams.seed === 0) {
    rawParams.seed = Math.floor(Math.random() * 2_147_483_647);
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "鐢ㄦ埛涓嶅瓨鍦? }, { status: 400 });

  const model = await prisma.model.findUnique({
    where: { id: body.modelId }, include: { provider: true },
  });
  if (!model || model.type !== "image") return NextResponse.json({ error: "妯″瀷涓嶅彲鐢? }, { status: 400 });

  const channelId: string | null = typeof body.channelId === "string" ? body.channelId : null;
  const channel = await pickChannel(model.id, channelId);
  // 鏄惧紡鎸囧畾 channelId 涓斿懡涓椂锛屽浐瀹氳娓犻亾锛屼笉鑷姩闄嶇骇
  const fallbackChannels = channel ? (channelId && channel.id === channelId ? [] : await getChannelsForModel(model.id)) : [];

  // 鍔犺浇 optionPrices 鈥斺??闇?瑕佺敤瀹冪畻閫夐」绾т环鏍?  const primaryWithOverrides = channel
    ? await prisma.channel.findUnique({ where: { id: channel.id }, include: { optionPrices: true } })
    : null;

  // 浼颁环鐢?primary 鐨?override 浠凤紙鎮茶锛氳嫢澶辫触闄嶇骇锛屽啀鎸夌湡姝ｅ懡涓殑娓犻亾绠楋級
  const estimatedEffective = primaryWithOverrides
    ? resolveEffectivePriceFromLoaded(primaryWithOverrides, rawParams)
    : { costUnitPrice: 0, sellUnitPrice: model.unitPrice, matched: null };
  const estimated = estimatedEffective.sellUnitPrice * n;
  if (user.balance < estimated) return NextResponse.json({ error: "浣欓涓嶈冻" }, { status: 402 });

  // 鏈湴 /uploads URL 涓婃父璁块棶涓嶅埌锛涜繖閲岃嚜鍔ㄦ敼鍐欎负 base64 data URL 鍐嶄笅鍙?  const rewrittenParams = await rewriteLocalRefsToBase64(rawParams);

  const start = Date.now();
  let result;
  try {
    result = await routeImage(
      { model: model.slug, prompt: body.prompt, size, n, rawParams: rewrittenParams },
      model.provider.slug,
      channel,
      fallbackChannels,
    );
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const hint =
      /鍙傛暟鏍煎紡閿欒|鏍煎紡涓嶅|invalid image|unreachable/i.test(raw)
        ? "锛堜笂娓镐笉鎺ュ彈 base64锛屾垨鏃犳硶璁块棶鍙傝?冨浘 URL銆傝浣跨敤鍙叕缃戣闂殑鍥剧墖 URL锛屾垨閰嶇疆 PUBLIC_BASE_URL 鎸囧悜浣犵殑鍏綉闅ч亾锛?
        : /context deadline exceeded|client\.timeout|timeout|timed out|etimedout|econnreset/i.test(raw)
          ? "锛堜笂娓稿綋鍓嶇箒蹇?瓒呮椂锛岀郴缁熷凡鑷姩閲嶈瘯锛涗粛澶辫触鍙敼鐢ㄨ嚜鍔ㄦ笭閬撴垨绋嶅悗閲嶈瘯锛?
        : "";
    console.error("[api/image] upstream failed:", raw);
    return NextResponse.json(
      { error: `鍥惧儚鐢熸垚澶辫触锛?{raw}${hint}` },
      { status: 502 },
    );
  }

  // 鐪熸鏈嶅姟鎴戜滑鐨勯偅鏉℃笭閬擄紙闄嶇骇鍚庡彲鑳藉拰 primary 涓嶅悓锛?  const servedChannelId =
    typeof result.meta?.served_channel_id === "string"
      ? (result.meta.served_channel_id as string)
      : channel?.id ?? null;

  // 鎸夊疄闄呭懡涓殑娓犻亾閲嶆柊绠椾竴娆￠?夐」浠凤紙涓嶅悓娓犻亾鐨?4K 瀹氫环鍙兘涓嶅悓锛?  let effective = estimatedEffective;
  if (servedChannelId && servedChannelId !== channel?.id) {
    const served = await prisma.channel.findUnique({
      where: { id: servedChannelId },
      include: { optionPrices: true },
    });
    if (served) effective = resolveEffectivePriceFromLoaded(served, rawParams);
  }

  const billing = await chargeUsage({
    userId: user.id,
    modelId: model.id,
    channelId: servedChannelId,
    type: "image",
    units: result.images.length,
    latencyMs: Date.now() - start,
    meta: {
      prompt: String(body.prompt).slice(0, 200),
      size,
      params: rawParams,
      pricing: {
        sellUnitPrice: effective.sellUnitPrice,
        costUnitPrice: effective.costUnitPrice,
        matched: effective.matched,
      },
    },
    priceOverride: effective.matched
      ? { costUnitPrice: effective.costUnitPrice, sellUnitPrice: effective.sellUnitPrice }
      : null,
  });

  await saveMediaAssets({
    userId: user.id,
    modelId: model.id,
    type: "image",
    urls: result.images.map((i) => i.url),
    prompt: String(body.prompt),
    params: { size, n, ...rawParams },
    totalCost: billing.cost,
  }).catch((e) => console.error("saveMediaAssets error", e));

  return NextResponse.json({
    id: crypto.randomUUID(),
    images: result.images,
    cost: billing.cost,
    balance: billing.balance,
    pricing: {
      sellUnitPrice: effective.sellUnitPrice,
      matched: effective.matched,
      servedChannelId,
    },
  });
}
