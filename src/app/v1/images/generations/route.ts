import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequestWithKey } from "@/lib/auth";
import { routeImage } from "@/lib/providers";
import { chargeUsage } from "@/lib/billing";
import { resolveChannelsForCall } from "@/lib/channels";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const pair = await authenticateRequestWithKey(req);
  if (!pair) return NextResponse.json({ error: { message: "invalid api key" } }, { status: 401 });
  const { user, apiKey } = pair;
  if (user.balance <= 0) return NextResponse.json({ error: { message: "insufficient balance" } }, { status: 402 });

  const body = await req.json().catch(() => null);
  const model = await prisma.model.findUnique({
    where: { slug: body?.model || "dall-e-3" }, include: { provider: true },
  });
  if (!model || model.type !== "image") {
    return NextResponse.json({ error: { message: `model not found` } }, { status: 404 });
  }

  const headerChannelId = req.headers.get("x-channel-id");
  const channelId = typeof body.channel_id === "string" ? body.channel_id : headerChannelId || null;
  const resolved = await resolveChannelsForCall({
    apiKeyId: apiKey.id,
    modelId: model.id,
    preferredChannelId: channelId,
  });
  if (resolved.scoped && !resolved.primary) {
    return NextResponse.json({
      error: {
        message: `API Key 未授权调用模型 '${model.slug}'。请在 /dashboard/apikeys 中为该 Key 绑定对应渠道。`,
        type: "model_not_allowed_for_api_key",
        code: "model_not_allowed",
      },
    }, { status: 403 });
  }
  const channel = resolved.primary;
  const fallbackChannels = resolved.fallbacks;

  const start = Date.now();
  const n = Math.min(Math.max(parseInt(body.n) || 1, 1), 4);
  try {
    const result = await routeImage({
      model: model.slug, prompt: body.prompt, size: body.size, n,
    }, model.provider.slug, channel, fallbackChannels);
    await chargeUsage({
      userId: user.id, modelId: model.id, channelId: channel?.id ?? null, type: "image",
      units: result.images.length, latencyMs: Date.now() - start, status: "success",
    });
    return NextResponse.json({
      created: Math.floor(Date.now() / 1000),
      data: result.images.map((img) => ({ url: img.url })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await chargeUsage({
      userId: user.id, modelId: model.id, channelId: channel?.id ?? null, type: "image",
      units: 0, latencyMs: Date.now() - start, status: "failed",
      meta: { error: msg.slice(0, 200) },
    }).catch(() => {});
    return NextResponse.json({ error: { message: msg } }, { status: 502 });
  }
}
