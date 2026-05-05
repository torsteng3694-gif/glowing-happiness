/**
 * 对外 v1 接口：语音合成（兼容 Vidu 文档 + 部分 OpenAI 命名习惯）
 *
 * POST /v1/audio/speech
 *   Header: Authorization: Bearer sk-aihub-xxx
 *   Body：
 *     {
 *       model: "vidu-audio-tts",            // 必填
 *       channel_id?: string,
 *       input: string,                       // OpenAI 风格："input"；同时也接受 "text"
 *       voice: string,                       // OpenAI 风格："voice" 字段；同时也接受 voice_id / voice_setting_voice_id
 *       speed?, volume?, pitch?, emotion?,
 *       voice_setting_speed?, voice_setting_volume?, voice_setting_pitch?, voice_setting_emotion?,
 *       pronunciation_dict_tone?,
 *       payload?,
 *     }
 *   返回（混合 OpenAI + Vidu 字段，便于不同客户端使用）：
 *     { task_id, state, file_url, url, credits, cost, balance, voice_activated, created_at }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, extractApiKey } from "@/lib/auth";
import { resolveChannelsForCall } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";
import { saveMediaAssets } from "@/lib/media-assets";
import { viduAudioTts } from "@/lib/providers/vidu";
import { toUpstreamConfig } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMOTIONS = ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "calm"] as const;

async function getApiKeyIdFromReq(req: Request): Promise<string | null> {
  const token = extractApiKey(req);
  if (!token) return null;
  const enc = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const k = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  return k?.id ?? null;
}

export async function POST(req: Request) {
  if (!extractApiKey(req)) {
    return NextResponse.json(
      { error: { message: "missing api key", code: "unauthorized" } },
      { status: 401 },
    );
  }
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: { message: "invalid api key", code: "unauthorized" } },
      { status: 401 },
    );
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      { error: { message: "invalid request body", code: "invalid_request" } },
      { status: 400 },
    );
  }

  const modelSlug = typeof raw.model === "string" ? raw.model : "";
  const text = typeof raw.input === "string" ? raw.input : typeof raw.text === "string" ? raw.text : "";
  const voiceId =
    (typeof raw.voice === "string" && raw.voice) ||
    (typeof raw.voice_id === "string" && raw.voice_id) ||
    (typeof raw.voice_setting_voice_id === "string" && raw.voice_setting_voice_id) ||
    "";
  const speed = Number(raw.voice_setting_speed ?? raw.speed);
  const volume = Number(raw.voice_setting_volume ?? raw.volume);
  const pitch = Number(raw.voice_setting_pitch ?? raw.pitch);
  const emotionRaw =
    (typeof raw.voice_setting_emotion === "string" && raw.voice_setting_emotion) ||
    (typeof raw.emotion === "string" && raw.emotion) ||
    "";

  if (!modelSlug) {
    return NextResponse.json(
      { error: { message: "field 'model' is required", code: "invalid_request" } },
      { status: 400 },
    );
  }
  if (!text) {
    return NextResponse.json(
      { error: { message: "field 'input' (or 'text') is required", code: "invalid_request" } },
      { status: 400 },
    );
  }
  if (text.length > 10000) {
    return NextResponse.json(
      { error: { message: "input/text exceeds 10000 chars", code: "invalid_request" } },
      { status: 400 },
    );
  }
  if (!voiceId) {
    return NextResponse.json(
      { error: { message: "field 'voice' (or 'voice_id') is required", code: "invalid_request" } },
      { status: 400 },
    );
  }

  const model = await prisma.model.findUnique({ where: { slug: modelSlug } });
  if (!model || !model.enabled) {
    return NextResponse.json(
      { error: { message: `model '${modelSlug}' not available`, code: "invalid_request" } },
      { status: 400 },
    );
  }

  const apiKeyId = await getApiKeyIdFromReq(req);
  const preferredChannelId = typeof raw.channel_id === "string" ? raw.channel_id : null;
  const { primary: channel, scoped } = await resolveChannelsForCall({
    apiKeyId,
    modelId: model.id,
    preferredChannelId,
  });
  if (!channel) {
    return NextResponse.json(
      {
        error: {
          message: scoped ? "this api key has no binding for this model" : "no available channel",
          code: scoped ? "forbidden" : "service_unavailable",
        },
      },
      { status: scoped ? 403 : 503 },
    );
  }

  const userRow = await prisma.user.findUnique({ where: { id: user.id } });
  if (!userRow) {
    return NextResponse.json(
      { error: { message: "user not found", code: "unauthorized" } },
      { status: 401 },
    );
  }
  const cnyPerCredit = channel.sellUnitPrice || model.unitPrice;
  if (cnyPerCredit <= 0) {
    return NextResponse.json(
      { error: { message: "channel sell price not configured (¥/credit)", code: "server_error" } },
      { status: 500 },
    );
  }
  if (userRow.balance < cnyPerCredit) {
    return NextResponse.json(
      {
        error: {
          message: `insufficient balance: need at least ¥${cnyPerCredit.toFixed(2)}, have ¥${userRow.balance.toFixed(2)}`,
          code: "insufficient_balance",
        },
      },
      { status: 402 },
    );
  }

  const emotion = (EMOTIONS as readonly string[]).includes(emotionRaw)
    ? (emotionRaw as (typeof EMOTIONS)[number])
    : undefined;

  const cfg = {
    ...toUpstreamConfig(channel.upstream),
    apiKey: (channel.apiKey && channel.apiKey.trim()) || channel.upstream.apiKey,
  };
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
        pronunciationDictTone: Array.isArray(raw.pronunciation_dict_tone)
          ? raw.pronunciation_dict_tone.filter((s: unknown) => typeof s === "string").slice(0, 64)
          : undefined,
        payload: typeof raw.payload === "string" ? raw.payload : undefined,
      },
      cfg,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: { message: msg, code: "upstream_error" } },
      { status: 502 },
    );
  }

  if (result.state === "failed") {
    return NextResponse.json(
      { error: { message: "Vidu TTS task failed", code: "upstream_error" }, raw: result.raw },
      { status: 502 },
    );
  }

  const credits = result.credits ?? Math.max(1, Math.ceil(text.length * 1.0));
  const billing = await chargeUsage({
    userId: user.id,
    modelId: model.id,
    channelId: channel.id,
    type: "video",
    units: credits,
    meta: {
      source: "audio-tts-v1",
      voiceId,
      taskId: result.taskId,
      credits,
    },
    priceOverride: {
      sellUnitPrice: cnyPerCredit,
      costUnitPrice: channel.costUnitPrice || cnyPerCredit * 0.6,
    },
  });

  if (result.fileUrl) {
    saveMediaAssets({
      userId: user.id,
      modelId: model.id,
      type: "audio",
      urls: [result.fileUrl],
      prompt: text.slice(0, 400),
      params: { voiceId, speed, volume, pitch, emotion, credits },
      totalCost: billing.cost,
    }).catch((e) => console.error("[v1/audio/speech] saveMediaAssets:", e));
  }

  let voiceActivated = false;
  const matched = await prisma.voiceClone.findUnique({ where: { voiceId } });
  if (matched && matched.userId === user.id && !matched.isActivated) {
    await prisma.voiceClone.update({
      where: { id: matched.id },
      data: {
        isActivated: true,
        activatedAt: new Date(),
        activationCost: billing.cost,
        expiresAt: null,
      },
    });
    voiceActivated = true;
  }

  return NextResponse.json({
    task_id: result.taskId,
    state: result.state,
    file_url: result.fileUrl,
    url: result.fileUrl, // OpenAI 兼容客户端可能取 .url
    credits,
    cost: billing.cost,
    balance: billing.balance,
    voice_activated: voiceActivated,
    created_at: result.createdAt || new Date().toISOString(),
  });
}
