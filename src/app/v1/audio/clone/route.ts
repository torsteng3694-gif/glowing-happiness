/**
 * 对外 v1 接口：音色复刻（兼容 Vidu 文档形态）
 *
 * POST /v1/audio/clone
 *   Header: Authorization: Bearer sk-aihub-xxx
 *   Body：与 Vidu 官方 audio-clone 几乎一致：
 *     { audio_url, text?, prompt_audio_url?, prompt_text?, payload? }
 *   额外字段：
 *     - model（slug，必填，例如 "vidu-audio-clone"）
 *     - name（必填，本地展示名）
 *     - channel_id（可选）
 *     - voice_id（可选；不传则自动生成符合 Vidu 规范的 id）
 *
 * 返回（兼容 Vidu 原响应字段 + 我们的本地 id）：
 *   { id, voice_id, name, demo_audio, state, task_id, created_at, expires_at, cost }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, extractApiKey } from "@/lib/auth";
import { resolveChannelsForCall } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";
import { viduAudioClone } from "@/lib/providers/vidu";
import { toUpstreamConfig } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOICE_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{6,254}[A-Za-z0-9]$/;

function generateVoiceId(userId: string): string {
  const prefix = userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) || "viduusr";
  const head = /^[A-Za-z]/.test(prefix) ? prefix : "v" + prefix;
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  let id = `${head}_${rand}`;
  if (id.length < 8) id = id + "abcdef".slice(0, 8 - id.length);
  if (id.length > 256) id = id.slice(0, 256);
  if (/[-_*]$/.test(id)) id = id.slice(0, -1) + "x";
  return id;
}

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
  const audioUrl = typeof raw.audio_url === "string" ? raw.audio_url.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const text = typeof raw.text === "string" ? raw.text.slice(0, 1000) : undefined;
  const promptAudioUrl = typeof raw.prompt_audio_url === "string" ? raw.prompt_audio_url.trim() || undefined : undefined;
  const promptText = typeof raw.prompt_text === "string" ? raw.prompt_text : undefined;
  const payload = typeof raw.payload === "string" ? raw.payload : undefined;
  let voiceId = typeof raw.voice_id === "string" ? raw.voice_id.trim() : "";

  if (!modelSlug) {
    return NextResponse.json(
      { error: { message: "field 'model' is required", code: "invalid_request" } },
      { status: 400 },
    );
  }
  if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
    return NextResponse.json(
      { error: { message: "audio_url must be a public http(s) URL", code: "invalid_request" } },
      { status: 400 },
    );
  }
  if (!name || [...name].length > 30) {
    return NextResponse.json(
      { error: { message: "name required, ≤ 30 chars", code: "invalid_request" } },
      { status: 400 },
    );
  }
  if (voiceId) {
    if (!VOICE_ID_RE.test(voiceId)) {
      return NextResponse.json(
        {
          error: {
            message:
              "voice_id invalid: length 8-256, must start with a letter, only [A-Za-z0-9_-], cannot end with -/_/*",
            code: "invalid_request",
          },
        },
        { status: 400 },
      );
    }
  } else {
    voiceId = generateVoiceId(user.id);
    for (let i = 0; i < 5; i++) {
      const dup = await prisma.voiceClone.findUnique({ where: { voiceId } });
      if (!dup) break;
      voiceId = generateVoiceId(user.id);
    }
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
  const unitPrice = channel.sellUnitPrice || model.unitPrice;
  if (userRow.balance < unitPrice) {
    return NextResponse.json(
      {
        error: {
          message: `insufficient balance: need ¥${unitPrice.toFixed(2)}, have ¥${userRow.balance.toFixed(2)}`,
          code: "insufficient_balance",
        },
      },
      { status: 402 },
    );
  }

  const cfg = {
    ...toUpstreamConfig(channel.upstream),
    apiKey: (channel.apiKey && channel.apiKey.trim()) || channel.upstream.apiKey,
  };
  let result;
  try {
    result = await viduAudioClone(
      { audioUrl, voiceId, text, promptAudioUrl, promptText, payload },
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
      { error: { message: "Vidu clone task failed", code: "upstream_error" }, raw: result.raw },
      { status: 502 },
    );
  }

  const billing = await chargeUsage({
    userId: user.id,
    modelId: model.id,
    channelId: channel.id,
    type: "video",
    units: 1,
    meta: {
      source: "voice-clone",
      voiceId: result.voiceId || voiceId,
      taskId: result.taskId,
    },
  });

  const expiresAt = new Date(Date.now() + 168 * 60 * 60 * 1000);
  const created = await prisma.voiceClone.create({
    data: {
      userId: user.id,
      modelSlug: model.slug,
      channelId: channel.id,
      voiceId: result.voiceId || voiceId,
      name,
      upstreamName: name,
      audioSampleUrl: audioUrl,
      demoAudio: result.demoAudio || null,
      isActivated: false,
      cloneCost: billing.cost,
      activationCost: 0,
      expiresAt,
    },
  });

  return NextResponse.json({
    id: created.id,
    voice_id: created.voiceId,
    name: created.name,
    demo_audio: created.demoAudio,
    state: result.state,
    task_id: result.taskId,
    created_at: result.createdAt || new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    cost: billing.cost,
    balance: billing.balance,
  });
}
