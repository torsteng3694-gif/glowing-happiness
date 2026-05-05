import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { routeChat } from "@/lib/providers";
import { chargeUsage } from "@/lib/billing";
import { getChannelsForModel, pickChannel } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 多模型协作对话
 *
 * Body:
 * {
 *   modelIds: string[]                 // 要并行调用的模型（2~5 个最佳）
 *   messages: {role,content}[]         // 标准 OpenAI 格式
 *   fuserModelId?: string              // 指定一个"融合评审模型"；不传 = 不做融合
 *   channelIdByModelId?: Record<string,string>  // 可选：每个模型指定渠道
 * }
 *
 * Response: NDJSON 流（每行一个 JSON 事件）
 *   {type:"init", turnId, models:[{id,slug,name,logo}], fuserModelId}
 *   {type:"delta", modelId, delta}
 *   {type:"error", modelId, error}
 *   {type:"done",  modelId, inputTokens, outputTokens, cost, latencyMs}
 *   {type:"fuse-start", modelId}
 *   {type:"fuse-delta", delta}
 *   {type:"fuse-done",  inputTokens, outputTokens, cost, latencyMs}
 *   {type:"all-done", totalCost}
 */

type Msg = { role: "system" | "user" | "assistant"; content: string };

function buildFusePrompt(userQuestion: string, branches: { label: string; text: string }[]): string {
  const parts = branches
    .map((b, i) => `【候选答案 ${String.fromCharCode(65 + i)} · ${b.label}】\n${b.text.trim() || "(模型未返回有效内容)"}`)
    .join("\n\n");

  return (
    `你是一位严谨的多模型答案评审与融合专家。下面是 ${branches.length} 个主流大模型对同一问题的独立回答。\n` +
    `你的任务：\n` +
    `1. 对比各答案，识别事实性错误、过时信息、明显幻觉；\n` +
    `2. 吸收每个答案里最有价值、最准确的部分；\n` +
    `3. 用清晰、结构化的方式输出一个"融合后的最佳答案"；\n` +
    `4. 不要自我介绍、不要评价模型，只输出最终答案本身，语言风格跟随用户问题。\n\n` +
    `================ 原始用户问题 ================\n${userQuestion}\n\n` +
    `================ 候选答案 ================\n${parts}\n\n` +
    `================ 融合后的最佳答案 ================\n`
  );
}

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    !Array.isArray(body.modelIds) ||
    body.modelIds.length < 1 ||
    body.modelIds.length > 6 ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    return NextResponse.json({ error: "参数错误：需要 1~6 个 modelIds 和非空 messages" }, { status: 400 });
  }

  const messages: Msg[] = body.messages;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json({ error: "messages 中需要至少一条 user 消息" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 400 });
  if (user.balance <= 0) {
    return NextResponse.json({ error: "余额不足，请先充值" }, { status: 402 });
  }

  // 去重、校验每个 model 都存在且是 chat
  const modelIds: string[] = Array.from(new Set(body.modelIds));
  const models = await prisma.model.findMany({
    where: { id: { in: modelIds }, type: "chat" },
    include: { provider: true },
  });
  if (models.length === 0) {
    return NextResponse.json({ error: "没有可用的 chat 模型" }, { status: 400 });
  }
  // 按用户传进来的顺序排
  const orderedModels = modelIds
    .map((id) => models.find((m) => m.id === id))
    .filter((m): m is (typeof models)[number] => Boolean(m));

  // 融合模型（可选）
  const fuserModelId: string | null =
    typeof body.fuserModelId === "string" && body.fuserModelId ? body.fuserModelId : null;
  let fuserModel: (typeof models)[number] | null = null;
  if (fuserModelId) {
    fuserModel =
      models.find((m) => m.id === fuserModelId) ||
      (await prisma.model
        .findUnique({ where: { id: fuserModelId }, include: { provider: true } })
        .then((m) => (m && m.type === "chat" ? m : null)));
  }

  // 预载渠道
  const channelIdByModelId: Record<string, string | undefined> =
    body.channelIdByModelId && typeof body.channelIdByModelId === "object"
      ? body.channelIdByModelId
      : {};

  const turnId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ turnId, ...ev }) + "\n"));
        } catch {
          // 前端可能已经断开
        }
      };

      // init
      emit({
        type: "init",
        models: orderedModels.map((m) => ({
          id: m.id,
          slug: m.slug,
          name: m.name,
          logo: m.provider.logo || "🤖",
          provider: m.provider.name,
        })),
        fuserModelId: fuserModel?.id ?? null,
        fuser: fuserModel
          ? { id: fuserModel.id, name: fuserModel.name, logo: fuserModel.provider.logo || "🤖" }
          : null,
      });

      let totalCost = 0;

      // 并行跑每个模型
      const perModelResults = await Promise.all(
        orderedModels.map(async (model) => {
          const chId = channelIdByModelId[model.id] ?? null;
          const channel = await pickChannel(model.id, chId);
          // 每模型显式指定渠道且命中时，固定该渠道，不自动降级
          const fallbackChannels = channel ? (chId && channel.id === chId ? [] : await getChannelsForModel(model.id)) : [];

          const started = Date.now();
          let acc = "";
          let inputTokens = 0;
          let outputTokens = 0;
          let hadError = false;
          let errorMsg = "";

          try {
            const gen = routeChat(
              {
                model: model.slug,
                messages,
                temperature: typeof body.temperature === "number" ? body.temperature : undefined,
                maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
                stream: true,
              },
              model.provider.slug,
              channel,
              fallbackChannels,
            );

            for await (const chunk of gen) {
              if (chunk.delta) {
                acc += chunk.delta;
                emit({ type: "delta", modelId: model.id, delta: chunk.delta });
              }
              if (chunk.done) {
                inputTokens = chunk.inputTokens || 0;
                outputTokens = chunk.outputTokens || 0;
              }
            }
          } catch (e) {
            hadError = true;
            errorMsg = e instanceof Error ? e.message : String(e);
            emit({ type: "error", modelId: model.id, error: errorMsg });
          }

          const latencyMs = Date.now() - started;

          // 计费（失败也记 usage 但 status=failed，cost=0）
          let cost = 0;
          try {
            const billing = await chargeUsage({
              userId: session!.id,
              modelId: model.id,
              channelId: channel?.id ?? null,
              type: "chat",
              inputTokens,
              outputTokens,
              latencyMs,
              meta: {
                multi: true,
                turnId,
                firstMessage: messages[0]?.content?.slice(0, 80),
              },
              status: hadError ? "failed" : "success",
            });
            cost = billing.cost;
            totalCost += cost;
          } catch (e) {
            console.error("[chat-multi] billing error:", e);
          }

          emit({
            type: "done",
            modelId: model.id,
            inputTokens,
            outputTokens,
            cost,
            latencyMs,
            ok: !hadError,
            error: hadError ? errorMsg : undefined,
          });

          return {
            modelId: model.id,
            label: `${model.name}（${model.provider.name}）`,
            text: acc,
            ok: !hadError,
          };
        }),
      );

      // 融合（需要至少 2 个成功的 + 指定了 fuser）
      const successResults = perModelResults.filter((r) => r.ok && r.text.trim().length > 0);
      if (fuserModel && successResults.length >= 2) {
        const fuser = fuserModel;
        emit({ type: "fuse-start", modelId: fuser.id, name: fuser.name, logo: fuser.provider.logo || "🤖" });

        const fPrompt = buildFusePrompt(lastUser.content, successResults);
        const fChannel = await pickChannel(fuser.id, null);
        const fFallbacks = fChannel ? await getChannelsForModel(fuser.id) : [];

        const fStarted = Date.now();
        let fIn = 0,
          fOut = 0,
          fErr = false,
          fErrMsg = "";

        try {
          // 保留原始对话中的历史（去掉最后一条 user），外加一个综合 user 消息，
          // 让 fuser 依然能看到上下文，但最后是明确的"请融合"请求。
          const historyExceptLast = messages.slice(0, -1);
          const fuseMessages: Msg[] = [
            ...historyExceptLast,
            { role: "user", content: fPrompt },
          ];
          const gen = routeChat(
            {
              model: fuser.slug,
              messages: fuseMessages,
              temperature: 0.3,
              stream: true,
            },
            fuser.provider.slug,
            fChannel,
            fFallbacks,
          );

          for await (const chunk of gen) {
            if (chunk.delta) emit({ type: "fuse-delta", delta: chunk.delta });
            if (chunk.done) {
              fIn = chunk.inputTokens || 0;
              fOut = chunk.outputTokens || 0;
            }
          }
        } catch (e) {
          fErr = true;
          fErrMsg = e instanceof Error ? e.message : String(e);
          emit({ type: "fuse-error", error: fErrMsg });
        }

        const fLatency = Date.now() - fStarted;
        let fCost = 0;
        try {
          const billing = await chargeUsage({
            userId: session!.id,
            modelId: fuser.id,
            channelId: fChannel?.id ?? null,
            type: "chat",
            inputTokens: fIn,
            outputTokens: fOut,
            latencyMs: fLatency,
            meta: { multi: true, fuse: true, turnId },
            status: fErr ? "failed" : "success",
          });
          fCost = billing.cost;
          totalCost += fCost;
        } catch (e) {
          console.error("[chat-multi] fuser billing error:", e);
        }

        emit({
          type: "fuse-done",
          inputTokens: fIn,
          outputTokens: fOut,
          cost: fCost,
          latencyMs: fLatency,
          ok: !fErr,
          error: fErr ? fErrMsg : undefined,
        });
      }

      // 读取最终余额
      const updated = await prisma.user.findUnique({ where: { id: session!.id } });
      emit({
        type: "all-done",
        totalCost: Math.round(totalCost * 10000) / 10000,
        balance: updated?.balance ?? null,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
