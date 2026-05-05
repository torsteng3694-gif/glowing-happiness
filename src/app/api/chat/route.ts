import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { routeChat } from "@/lib/providers";
import { chargeUsage } from "@/lib/billing";
import { getChannelsForModel, pickChannel } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  if (!body?.modelId || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 400 });
  if (user.balance <= 0) {
    return NextResponse.json({ error: "余额不足，请先充值" }, { status: 402 });
  }

  const model = await prisma.model.findUnique({
    where: { id: body.modelId },
    include: { provider: true },
  });
  if (!model || model.type !== "chat") {
    return NextResponse.json({ error: "模型不可用" }, { status: 400 });
  }

  const channelId: string | null = typeof body.channelId === "string" ? body.channelId : null;
  const channel = await pickChannel(model.id, channelId);
  // 显式指定 channelId 且命中时，固定该渠道，不自动降级
  const fallbackChannels = channel ? (channelId && channel.id === channelId ? [] : await getChannelsForModel(model.id)) : [];

  const start = Date.now();
  const encoder = new TextEncoder();
  let inputTokens = 0, outputTokens = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = routeChat(
          {
            model: model.slug,
            messages: body.messages,
            temperature: body.temperature,
            maxTokens: body.maxTokens,
            stream: true,
          },
          model.provider.slug,
          channel,
          fallbackChannels,
        );
        for await (const chunk of gen) {
          if (chunk.delta) controller.enqueue(encoder.encode(chunk.delta));
          if (chunk.done) {
            inputTokens = chunk.inputTokens || 0;
            outputTokens = chunk.outputTokens || 0;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`\n\n[调用出错：${msg}]`));
      } finally {
        controller.close();
        try {
          await chargeUsage({
            userId: session!.id,
            modelId: model.id,
            channelId: channel?.id ?? null,
            type: "chat",
            inputTokens,
            outputTokens,
            latencyMs: Date.now() - start,
            meta: { firstMessage: body.messages[0]?.content?.slice(0, 80) },
          });
        } catch (e) { console.error("billing error:", e); }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
