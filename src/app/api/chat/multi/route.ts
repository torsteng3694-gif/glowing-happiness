import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { routeChat } from "@/lib/providers";
import { chargeUsage } from "@/lib/billing";
import { getChannelsForModel, pickChannel } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * 澶氭ā鍨嬪崗浣滃璇? *
 * Body:
 * {
 *   modelIds: string[]                 // 瑕佸苟琛岃皟鐢ㄧ殑妯″瀷锛?~5 涓渶浣筹級
 *   messages: {role,content}[]         // 鏍囧噯 OpenAI 鏍煎紡
 *   fuserModelId?: string              // 鎸囧畾涓?涓?铻嶅悎璇勫妯″瀷"锛涗笉浼?= 涓嶅仛铻嶅悎
 *   channelIdByModelId?: Record<string,string>  // 鍙?夛細姣忎釜妯″瀷鎸囧畾娓犻亾
 * }
 *
 * Response: NDJSON 娴侊紙姣忚涓?涓?JSON 浜嬩欢锛? *   {type:"init", turnId, models:[{id,slug,name,logo}], fuserModelId}
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
    .map((b, i) => `銆愬?欓?夌瓟妗?${String.fromCharCode(65 + i)} 路 ${b.label}銆慭n${b.text.trim() || "(妯″瀷鏈繑鍥炴湁鏁堝唴瀹?"}`)
    .join("\n\n");

  return (
    `浣犳槸涓?浣嶄弗璋ㄧ殑澶氭ā鍨嬬瓟妗堣瘎瀹′笌铻嶅悎涓撳銆備笅闈㈡槸 ${branches.length} 涓富娴佸ぇ妯″瀷瀵瑰悓涓?闂鐨勭嫭绔嬪洖绛斻?俓n` +
    `浣犵殑浠诲姟锛歕n` +
    `1. 瀵规瘮鍚勭瓟妗堬紝璇嗗埆浜嬪疄鎬ч敊璇?佽繃鏃朵俊鎭?佹槑鏄惧够瑙夛紱\n` +
    `2. 鍚告敹姣忎釜绛旀閲屾渶鏈変环鍊笺?佹渶鍑嗙‘鐨勯儴鍒嗭紱\n` +
    `3. 鐢ㄦ竻鏅般?佺粨鏋勫寲鐨勬柟寮忚緭鍑轰竴涓?铻嶅悎鍚庣殑鏈?浣崇瓟妗?锛沑n` +
    `4. 涓嶈鑷垜浠嬬粛銆佷笉瑕佽瘎浠锋ā鍨嬶紝鍙緭鍑烘渶缁堢瓟妗堟湰韬紝璇█椋庢牸璺熼殢鐢ㄦ埛闂銆俓n\n` +
    `================ 鍘熷鐢ㄦ埛闂 ================\n${userQuestion}\n\n` +
    `================ 鍊欓?夌瓟妗?================\n${parts}\n\n` +
    `================ 铻嶅悎鍚庣殑鏈?浣崇瓟妗?================\n`
  );
}

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "error" }, { status: 401 }); }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    !Array.isArray(body.modelIds) ||
    body.modelIds.length < 1 ||
    body.modelIds.length > 6 ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const messages: Msg[] = body.messages;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "鐢ㄦ埛涓嶅瓨鍦? }, { status: 400 });
  if (user.balance <= 0) {
    return NextResponse.json({ error: "浣欓涓嶈冻锛岃鍏堝厖鍊? }, { status: 402 });
  }

  // 鍘婚噸銆佹牎楠屾瘡涓?model 閮藉瓨鍦ㄤ笖鏄?chat
  const modelIds: string[] = Array.from(new Set(body.modelIds));
  const models = await prisma.model.findMany({
    where: { id: { in: modelIds }, type: "chat" },
    include: { provider: true },
  });
  if (models.length === 0) {
    return NextResponse.json({ error: "娌℃湁鍙敤鐨?chat 妯″瀷" }, { status: 400 });
  }
  // 鎸夌敤鎴蜂紶杩涙潵鐨勯『搴忔帓
  const orderedModels = modelIds
    .map((id) => models.find((m) => m.id === id))
    .filter((m): m is (typeof models)[number] => Boolean(m));

  // 铻嶅悎妯″瀷锛堝彲閫夛級
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

  // 棰勮浇娓犻亾
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
          // 鍓嶇鍙兘宸茬粡鏂紑
        }
      };

      // init
      emit({
        type: "init",
        models: orderedModels.map((m) => ({
          id: m.id,
          slug: m.slug,
          name: m.name,
          logo: m.provider.logo || "馃",
          provider: m.provider.name,
        })),
        fuserModelId: fuserModel?.id ?? null,
        fuser: fuserModel
          ? { id: fuserModel.id, name: fuserModel.name, logo: fuserModel.provider.logo || "馃" }
          : null,
      });

      let totalCost = 0;

      // 骞惰璺戞瘡涓ā鍨?      const perModelResults = await Promise.all(
        orderedModels.map(async (model) => {
          const chId = channelIdByModelId[model.id] ?? null;
          const channel = await pickChannel(model.id, chId);
          // 姣忔ā鍨嬫樉寮忔寚瀹氭笭閬撲笖鍛戒腑鏃讹紝鍥哄畾璇ユ笭閬擄紝涓嶈嚜鍔ㄩ檷绾?          const fallbackChannels = channel ? (chId && channel.id === chId ? [] : await getChannelsForModel(model.id)) : [];

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

          // 璁¤垂锛堝け璐ヤ篃璁?usage 浣?status=failed锛宑ost=0锛?          let cost = 0;
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
            label: `${model.name}锛?{model.provider.name}锛塦,
            text: acc,
            ok: !hadError,
          };
        }),
      );

      // 铻嶅悎锛堥渶瑕佽嚦灏?2 涓垚鍔熺殑 + 鎸囧畾浜?fuser锛?      const successResults = perModelResults.filter((r) => r.ok && r.text.trim().length > 0);
      if (fuserModel && successResults.length >= 2) {
        const fuser = fuserModel;
        emit({ type: "fuse-start", modelId: fuser.id, name: fuser.name, logo: fuser.provider.logo || "馃" });

        const fPrompt = buildFusePrompt(lastUser.content, successResults);
        const fChannel = await pickChannel(fuser.id, null);
        const fFallbacks = fChannel ? await getChannelsForModel(fuser.id) : [];

        const fStarted = Date.now();
        let fIn = 0,
          fOut = 0,
          fErr = false,
          fErrMsg = "";

        try {
          // 淇濈暀鍘熷瀵硅瘽涓殑鍘嗗彶锛堝幓鎺夋渶鍚庝竴鏉?user锛夛紝澶栧姞涓?涓患鍚?user 娑堟伅锛?          // 璁?fuser 渚濈劧鑳界湅鍒颁笂涓嬫枃锛屼絾鏈?鍚庢槸鏄庣‘鐨?璇疯瀺鍚?璇锋眰銆?          const historyExceptLast = messages.slice(0, -1);
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

      // 璇诲彇鏈?缁堜綑棰?      const updated = await prisma.user.findUnique({ where: { id: session!.id } });
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
