import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequestWithKey } from "@/lib/auth";
import { routeChat } from "@/lib/providers";
import { chargeUsage } from "@/lib/billing";
import { resolveChannelsForCall } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OpenAI 兼容 /v1/chat/completions
 * 支持 stream=true / false
 */
export async function POST(req: Request) {
  const pair = await authenticateRequestWithKey(req);
  if (!pair) return NextResponse.json({ error: { message: "invalid api key" } }, { status: 401 });
  const { user, apiKey } = pair;
  if (user.balance <= 0) return NextResponse.json({ error: { message: "insufficient balance" } }, { status: 402 });

  const body = await req.json().catch(() => null);
  if (!body?.model || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: { message: "invalid request" } }, { status: 400 });
  }

  const model = await prisma.model.findUnique({
    where: { slug: body.model }, include: { provider: true },
  });
  if (!model || model.type !== "chat") {
    return NextResponse.json({ error: { message: `model '${body.model}' not found` } }, { status: 404 });
  }

  const stream = body.stream === true;
  const start = Date.now();
  const completionId = `chatcmpl-${crypto.randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);
  let inputTokens = 0, outputTokens = 0, fullContent = "";

  // 渠道选择：body.channel_id 或 header x-channel-id；否则按 API Key 绑定/全局 priority 决定
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
        message: `API Key 未授权调用模型 '${body.model}'。请在 /dashboard/apikeys 中为该 Key 绑定对应渠道。`,
        type: "model_not_allowed_for_api_key",
        code: "model_not_allowed",
      },
    }, { status: 403 });
  }
  const channel = resolved.primary;
  const fallbackChannels = resolved.fallbacks;

  const gen = routeChat({
    model: model.slug, messages: body.messages,
    temperature: body.temperature, maxTokens: body.max_tokens, stream: true,
  }, model.provider.slug, channel, fallbackChannels);

  if (!stream) {
    let errorMsg: string | null = null;
    try {
      for await (const chunk of gen) {
        if (chunk.delta) fullContent += chunk.delta;
        if (chunk.done) { inputTokens = chunk.inputTokens || 0; outputTokens = chunk.outputTokens || 0; }
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
    try {
      await chargeUsage({
        userId: user.id, modelId: model.id, channelId: channel?.id ?? null, type: "chat",
        inputTokens, outputTokens, latencyMs: Date.now() - start,
        status: errorMsg ? "failed" : "success",
        meta: errorMsg ? { error: errorMsg.slice(0, 200) } : undefined,
      });
    } catch (e) { console.error(e); }
    if (errorMsg) {
      return NextResponse.json({ error: { message: errorMsg } }, { status: 502 });
    }
    return NextResponse.json({
      id: completionId, object: "chat.completion", created, model: model.slug,
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: fullContent } }],
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    });
  }

  const encoder = new TextEncoder();
  const body_stream = new ReadableStream({
    async start(controller) {
      function send(obj: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }
      let streamError: string | null = null;
      try {
        for await (const chunk of gen) {
          if (chunk.delta) {
            fullContent += chunk.delta;
            send({
              id: completionId, object: "chat.completion.chunk", created, model: model.slug,
              choices: [{ index: 0, delta: { content: chunk.delta }, finish_reason: null }],
            });
          }
          if (chunk.done) {
            inputTokens = chunk.inputTokens || 0;
            outputTokens = chunk.outputTokens || 0;
            send({
              id: completionId, object: "chat.completion.chunk", created, model: model.slug,
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            });
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        streamError = e instanceof Error ? e.message : String(e);
        send({ error: { message: streamError } });
      } finally {
        controller.close();
        try {
          await chargeUsage({
            userId: user.id, modelId: model.id, channelId: channel?.id ?? null, type: "chat",
            inputTokens, outputTokens, latencyMs: Date.now() - start,
            status: streamError ? "failed" : "success",
            meta: streamError ? { error: streamError.slice(0, 200) } : undefined,
          });
        } catch (e) { console.error(e); }
      }
    },
  });

  return new Response(body_stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
