/**
 * Vidu 语音合成（dashboard 用）
 *
 * POST /api/audio/tts
 *   body: {
 *     modelId,                 // 必填，对应 vidu-audio-tts model
 *     channelId?,
 *     text,                    // 必填，≤ 10000，支持 <#x#> 停顿标记
 *     voiceId,                 // 必填，预设音色 id 或用户复刻得到的 voiceId
 *     speed? (0.5~2),
 *     volume? (0~10),
 *     pitch? (-12~12),
 *     emotion?,
 *     pronunciationDictTone?,
 *   }
 *   → { fileUrl, credits, cost, balance, taskId, voiceActivated? }
 *
 * 计费策略：按 Vidu 真实返回的 credits 计费 ——
 *   cost = credits × sellUnitPrice  （sellUnitPrice 视为"元/积分"）
 * 通过 chargeUsage 的 priceOverride 机制实现，避免污染默认计费链路。
 *
 * 副作用 · 复刻音色激活：
 *   - 若 voiceId 命中本地某条 VoiceClone（属于该用户）且尚未激活，
 *     合成成功后把 isActivated=true / activatedAt=now，对应 Vidu 文档的"7 天内首次合成激活变永久"。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pickChannel } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";
import { viduAudioTts } from "@/lib/providers/vidu";
import { saveMediaAssets } from "@/lib/media-assets";
import { toUpstreamConfig } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMOTIONS = ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "calm"] as const;

export async function POST(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体非法" }, { status: 400 });
  }
  const modelId = typeof body.modelId === "string" ? body.modelId : "";
  const channelId = typeof body.channelId === "string" ? body.channelId : null;
  const text = typeof body.text === "string" ? body.text : "";
  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
  const speed = Number(body.speed);
  const volume = Number(body.volume);
  const pitch = Number(body.pitch);
  const emotionRaw = typeof body.emotion === "string" ? body.emotion : "";

  if (!modelId) return NextResponse.json({ error: "modelId 必填" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "text 必填" }, { status: 400 });
  if (text.length > 10000) {
    return NextResponse.json({ error: "text 不能超过 10000 字" }, { status: 400 });
  }
  if (!voiceId) return NextResponse.json({ error: "voiceId 必填" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 400 });

  const model = await prisma.model.findUnique({ where: { id: modelId } });
  if (!model || !model.enabled) {
    return NextResponse.json({ error: "模型不可用" }, { status: 400 });
  }
  const channel = await pickChannel(model.id, channelId);
  if (!channel) {
    return NextResponse.json({ error: "该模型没有可用渠道，请联系管理员" }, { status: 503 });
  }

  // 余额预检（按 1 积分/字符的悲观估算 + 元/积分单价；最终以 Vidu 真实 credits 为准结算）
  const cnyPerCredit = channel.sellUnitPrice || model.unitPrice;
  if (cnyPerCredit <= 0) {
    return NextResponse.json({ error: "渠道单价未配置（应设为元/积分）" }, { status: 500 });
  }
  const estCredits = Math.max(1, Math.ceil(text.length * 1.0)); // 极保守
  const estCost = +(cnyPerCredit * estCredits).toFixed(4);
  if (user.balance < cnyPerCredit) {
    return NextResponse.json(
      { error: `余额不足：至少 ¥${cnyPerCredit.toFixed(2)}，当前 ¥${user.balance.toFixed(2)}` },
      { status: 402 },
    );
  }

  const cfg = {
    ...toUpstreamConfig(channel.upstream),
    apiKey: (channel.apiKey && channel.apiKey.trim()) || channel.upstream.apiKey,
  };

  const emotion = (EMOTIONS as readonly string[]).includes(emotionRaw)
    ? (emotionRaw as (typeof EMOTIONS)[number])
    : undefined;

  let result;
  try {
    result = await viduAudioTts(
      {
        text,
        voiceId,
        speed: Number.isFinite(speed) && speed >= 0.5 && speed <= 2 ? speed : undefined,
        volume: Number.isFinite(volume) && volume >= 0 && volume <= 10 ? Math.round(volume) : undefined,
        pitch: Number.isFinite(pitch) && pitch >= -12 && pitch <= 12 ? Math.round(pitch) : undefined,
        emotion,
        pronunciationDictTone: Array.isArray(body.pronunciationDictTone)
          ? body.pronunciationDictTone.filter((s: unknown) => typeof s === "string").slice(0, 64)
          : undefined,
      },
      cfg,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (result.state === "failed") {
    return NextResponse.json({ error: "Vidu TTS 任务失败", raw: result.raw }, { status: 502 });
  }

  // 真实结算：按 Vidu 返回的 credits × cnyPerCredit
  const credits = result.credits ?? estCredits;
  const billing = await chargeUsage({
    userId: user.id,
    modelId: model.id,
    channelId: channel.id,
    type: "video", // 走单价×秒/单位通用计费分支（不影响金额计算）
    units: credits,
    meta: {
      source: "audio-tts",
      voiceId,
      taskId: result.taskId,
      credits,
    },
    // 把渠道单价覆盖为真实 credits × cnyPerCredit；同时按比例算成本
    priceOverride: {
      sellUnitPrice: cnyPerCredit,
      costUnitPrice: channel.costUnitPrice || cnyPerCredit * 0.6,
    },
  });

  // 媒资入库
  if (result.fileUrl) {
    saveMediaAssets({
      userId: user.id,
      modelId: model.id,
      type: "audio",
      urls: [result.fileUrl],
      prompt: text.slice(0, 400),
      params: { voiceId, speed, volume, pitch, emotion, credits },
      totalCost: billing.cost,
    }).catch((e) => console.error("[audio-tts] saveMediaAssets:", e));
  }

  // 复刻音色激活（首次合成）
  let voiceActivated = false;
  const matched = await prisma.voiceClone.findUnique({ where: { voiceId } });
  if (matched && matched.userId === user.id && !matched.isActivated) {
    await prisma.voiceClone.update({
      where: { id: matched.id },
      data: {
        isActivated: true,
        activatedAt: new Date(),
        activationCost: billing.cost,
        // 文档：激活后变永久 → 清除 expiresAt
        expiresAt: null,
      },
    });
    voiceActivated = true;
  }

  return NextResponse.json({
    fileUrl: result.fileUrl,
    credits,
    cost: billing.cost,
    balance: billing.balance,
    taskId: result.taskId,
    state: result.state,
    voiceActivated,
    estimated: { credits: estCredits, cost: estCost },
  });
}
