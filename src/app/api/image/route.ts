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
// 异步图像（nano-banana-pro 等）+ 图生图可能要 1~3 分钟
export const maxDuration = 600;

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  if (!body?.modelId || !body?.prompt) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const n = Math.min(Math.max(parseInt(body.n) || 1, 1), 4);
  const size = typeof body.size === "string" ? body.size : undefined;
  const rawParamsIn =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : undefined;

  // 并发提交同 prompt 时，上游（Nano Banana Pro 等）可能会因请求 payload
  // 完全一致而返回同一张缓存图。这里如果调用方没传 seed，就兜底补一个
  // 随机 seed，让每次请求的 body 不同。
  const rawParams: Record<string, unknown> = { ...(rawParamsIn || {}) };
  if (rawParams.seed === undefined || rawParams.seed === null || rawParams.seed === "" || rawParams.seed === 0) {
    rawParams.seed = Math.floor(Math.random() * 2_147_483_647);
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 400 });

  const model = await prisma.model.findUnique({
    where: { id: body.modelId }, include: { provider: true },
  });
  if (!model || model.type !== "image") return NextResponse.json({ error: "模型不可用" }, { status: 400 });

  const channelId: string | null = typeof body.channelId === "string" ? body.channelId : null;
  const channel = await pickChannel(model.id, channelId);
  // 显式指定 channelId 且命中时，固定该渠道，不自动降级
  const fallbackChannels = channel ? (channelId && channel.id === channelId ? [] : await getChannelsForModel(model.id)) : [];

  // 加载 optionPrices —— 需要用它算选项级价格
  const primaryWithOverrides = channel
    ? await prisma.channel.findUnique({ where: { id: channel.id }, include: { optionPrices: true } })
    : null;

  // 估价用 primary 的 override 价（悲观：若失败降级，再按真正命中的渠道算）
  const estimatedEffective = primaryWithOverrides
    ? resolveEffectivePriceFromLoaded(primaryWithOverrides, rawParams)
    : { costUnitPrice: 0, sellUnitPrice: model.unitPrice, matched: null };
  const estimated = estimatedEffective.sellUnitPrice * n;
  if (user.balance < estimated) return NextResponse.json({ error: "余额不足" }, { status: 402 });

  // 本地 /uploads URL 上游访问不到；这里自动改写为 base64 data URL 再下发
  const rewrittenParams = await rewriteLocalRefsToBase64(rawParams);

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
      /参数格式错误|格式不对|invalid image|unreachable/i.test(raw)
        ? "（上游不接受 base64，或无法访问参考图 URL。请使用可公网访问的图片 URL，或配置 PUBLIC_BASE_URL 指向你的公网隧道）"
        : /context deadline exceeded|client\.timeout|timeout|timed out|etimedout|econnreset/i.test(raw)
          ? "（上游当前繁忙/超时，系统已自动重试；仍失败可改用自动渠道或稍后重试）"
        : "";
    console.error("[api/image] upstream failed:", raw);
    return NextResponse.json(
      { error: `图像生成失败：${raw}${hint}` },
      { status: 502 },
    );
  }

  // 真正服务我们的那条渠道（降级后可能和 primary 不同）
  const servedChannelId =
    typeof result.meta?.served_channel_id === "string"
      ? (result.meta.served_channel_id as string)
      : channel?.id ?? null;

  // 按实际命中的渠道重新算一次选项价（不同渠道的 4K 定价可能不同）
  let effective = estimatedEffective;
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
