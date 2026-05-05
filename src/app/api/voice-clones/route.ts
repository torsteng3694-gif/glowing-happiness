/**
 * 音色复刻（Vidu audio-clone 同步接口）
 *
 * POST /api/voice-clones
 *   body: {
 *     modelId,               // 必填，对应 Vidu 复刻模型，例如 vidu-audio-clone
 *     channelId?,            // 可选，指定渠道
 *     name,                  // 必填，展示名（≤ 30 字）
 *     audioUrl,              // 必填，原音频 URL（mp3/m4a/wav）
 *     text?,                 // 可选，试听文本（≤ 1000）
 *     promptAudioUrl?,
 *     promptText?,
 *   }
 *   → { id, voiceId, name, demoAudio, expiresAt, cost }
 *
 * GET /api/voice-clones
 *   → { items: VoiceClone[] }
 *
 * 计费：直接按 channel.sellUnitPrice 扣 1 单位（视为"复刻一次"），unit 建议设为 "clone"。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pickChannel } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";
import { viduAudioClone } from "@/lib/providers/vidu";
import { toUpstreamConfig } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 生成符合 Vidu 规范的 voice_id：长度 8~256，首字母英文，allowed [A-Za-z0-9_-]，末位非 - / _ */
function generateVoiceId(userId: string): string {
  // 取 userId 前 6 位（cuid 默认 c 开头，是字母）
  const prefix = userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) || "viduusr";
  const head = /^[A-Za-z]/.test(prefix) ? prefix : "v" + prefix;
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  let id = `${head}_${rand}`;
  if (id.length < 8) id = id + "abcdef".slice(0, 8 - id.length);
  if (id.length > 256) id = id.slice(0, 256);
  // 末位安全：随机十六进制字符串保证末位是 [0-9a-f]，但保险一下
  if (/[-_*]$/.test(id)) id = id.slice(0, -1) + "x";
  return id;
}

export async function GET() {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const items = await prisma.voiceClone.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    items: items.map((v) => ({
      id: v.id,
      voiceId: v.voiceId,
      name: v.name,
      modelSlug: v.modelSlug,
      audioSampleUrl: v.audioSampleUrl,
      demoAudio: v.demoAudio,
      isActivated: v.isActivated,
      activatedAt: v.activatedAt,
      cloneCost: v.cloneCost,
      expiresAt: v.expiresAt,
      createdAt: v.createdAt,
    })),
  });
}

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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl.trim() : "";
  const text = typeof body.text === "string" ? body.text.slice(0, 1000) : undefined;
  const promptAudioUrl = typeof body.promptAudioUrl === "string" ? body.promptAudioUrl.trim() || undefined : undefined;
  const promptText = typeof body.promptText === "string" ? body.promptText : undefined;

  if (!modelId) return NextResponse.json({ error: "modelId 必填" }, { status: 400 });
  if (!name || [...name].length > 30) {
    return NextResponse.json({ error: "name 必填且 ≤ 30 字" }, { status: 400 });
  }
  if (!audioUrl) return NextResponse.json({ error: "audioUrl 必填" }, { status: 400 });
  if (!/^https?:\/\//i.test(audioUrl)) {
    return NextResponse.json({ error: "audioUrl 必须是公网可访问的 http(s) 链接" }, { status: 400 });
  }
  if (promptAudioUrl && !/^https?:\/\//i.test(promptAudioUrl)) {
    return NextResponse.json({ error: "promptAudioUrl 必须是公网可访问的 http(s) 链接" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 400 });

  const model = await prisma.model.findUnique({ where: { id: modelId }, include: { provider: true } });
  if (!model || !model.enabled) {
    return NextResponse.json({ error: "模型不可用" }, { status: 400 });
  }

  const channel = await pickChannel(model.id, channelId);
  if (!channel) {
    return NextResponse.json({ error: "该模型没有可用渠道，请联系管理员" }, { status: 503 });
  }
  const unitPrice = channel.sellUnitPrice || model.unitPrice;
  if (user.balance < unitPrice) {
    return NextResponse.json(
      { error: `余额不足：本次复刻 ¥${unitPrice.toFixed(2)}，当前余额 ¥${user.balance.toFixed(2)}` },
      { status: 402 },
    );
  }

  // 生成符合 Vidu 规范的 voice_id（与本地 VoiceClone.voiceId 唯一性保持一致）
  let voiceId = generateVoiceId(user.id);
  for (let i = 0; i < 5; i++) {
    const existed = await prisma.voiceClone.findUnique({ where: { voiceId } });
    if (!existed) break;
    voiceId = generateVoiceId(user.id);
  }

  const cfg = {
    ...toUpstreamConfig(channel.upstream),
    apiKey: (channel.apiKey && channel.apiKey.trim()) || channel.upstream.apiKey,
  };

  let result;
  try {
    result = await viduAudioClone(
      {
        audioUrl,
        voiceId,
        text,
        promptAudioUrl,
        promptText,
      },
      cfg,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (result.state === "failed") {
    return NextResponse.json({ error: "Vidu 复刻任务失败", raw: result.raw }, { status: 502 });
  }
  // 成功 / queueing：上游已经接受请求，按一次"复刻"扣费
  const billing = await chargeUsage({
    userId: user.id,
    modelId: model.id,
    channelId: channel.id,
    type: "video", // 在 channel/model 计费里复用 unit 维度（与现有 billing 兼容；可在 admin 把 unit 设为 "clone"）
    units: 1,
    meta: {
      source: "voice-clone",
      voiceId: result.voiceId || voiceId,
      taskId: result.taskId,
    },
  });

  const expiresAt = new Date(Date.now() + 168 * 60 * 60 * 1000); // 7 天，与 Vidu 文档一致
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
    voiceId: created.voiceId,
    name: created.name,
    demoAudio: created.demoAudio,
    expiresAt: created.expiresAt,
    cost: billing.cost,
    balance: billing.balance,
    state: result.state,
    taskId: result.taskId,
  });
}
