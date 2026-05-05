/**
 * 对外 v1 接口：解说剧成片任务（兼容 Vidu 文档形态）
 *
 * POST /v1/explain-comic/tasks
 *   Header: Authorization: Bearer sk-aihub-xxx
 *   Body：与 Vidu 官方 explain-comic 创建任务请求体保持一致：
 *     { script_name, script_content, assets[], resolution, aspect_ratio, style, language,
 *       tts_speed, enable_lipsync, callback_url }
 *   额外字段：model（slug，必填，例如 "vidu-explain-comic"）、channel_id（可选）
 *   返回：{ id: <local task id>, external_id, status }
 *
 * 任务状态查询：复用 /v1/media/status?id=<local task id>
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, extractApiKey } from "@/lib/auth";
import { resolveChannelsForCall } from "@/lib/channels";
import { rewriteLocalRefsToBase64 } from "@/lib/media-ref";
import { viduCreateExplainComic } from "@/lib/providers/vidu";
import { toUpstreamConfig } from "@/lib/upstream";
import type { ExplainComicAsset, ExplainComicOptions } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function estimateDurationSec(scriptContent: string): number {
  const len = [...scriptContent].length;
  const sec = Math.round((len / 400) * 60);
  return Math.max(15, Math.min(600, sec));
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

  const modelSlug = asString(raw.model);
  if (!modelSlug) {
    return NextResponse.json(
      { error: { message: "field 'model' is required", code: "invalid_request" } },
      { status: 400 },
    );
  }
  const scriptName = asString(raw.script_name).trim();
  const scriptContent = asString(raw.script_content);
  if (!scriptName || [...scriptName].length > 20) {
    return NextResponse.json(
      { error: { message: "script_name required, ≤ 20 chars", code: "invalid_request" } },
      { status: 400 },
    );
  }
  const cpLen = [...scriptContent].length;
  if (cpLen < 50 || cpLen > 2000) {
    return NextResponse.json(
      { error: { message: "script_content must be 50-2000 chars", code: "invalid_request" } },
      { status: 400 },
    );
  }

  const model = await prisma.model.findUnique({ where: { slug: modelSlug } });
  if (!model || !model.enabled || (model.type !== "explain-comic" && model.type !== "video")) {
    return NextResponse.json(
      { error: { message: `model '${modelSlug}' not available`, code: "invalid_request" } },
      { status: 400 },
    );
  }

  const apiKeyId = await getApiKeyIdFromReq(req);
  const preferredChannelId =
    typeof raw.channel_id === "string" ? raw.channel_id : null;
  const { primary: channel, scoped } = await resolveChannelsForCall({
    apiKeyId,
    modelId: model.id,
    preferredChannelId,
  });
  if (!channel) {
    if (scoped) {
      return NextResponse.json(
        { error: { message: "this api key has no binding for this model", code: "forbidden" } },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: { message: "no available channel", code: "service_unavailable" } },
      { status: 503 },
    );
  }

  const assets = parseAssets(raw.assets);
  if (assets.error) {
    return NextResponse.json(
      { error: { message: assets.error, code: "invalid_request" } },
      { status: 400 },
    );
  }

  const userRow = await prisma.user.findUnique({ where: { id: user.id } });
  if (!userRow) {
    return NextResponse.json(
      { error: { message: "user not found", code: "unauthorized" } },
      { status: 401 },
    );
  }
  const estSec = estimateDurationSec(scriptContent);
  const unitPrice = channel.sellUnitPrice || model.unitPrice;
  const estCost = +(unitPrice * estSec).toFixed(4);
  if (userRow.balance < estCost) {
    return NextResponse.json(
      {
        error: {
          message: `insufficient balance: need ¥${estCost.toFixed(2)}, have ¥${userRow.balance.toFixed(2)}`,
          code: "insufficient_balance",
        },
      },
      { status: 402 },
    );
  }

  // 资产图改写为公网 / base64
  const wrapped = { image_urls: assets.list.map((a) => a.image_uri || "") };
  const rewroteWrap = await rewriteLocalRefsToBase64(wrapped);
  const rewriteList: string[] = (rewroteWrap?.image_urls as string[]) || wrapped.image_urls;
  const finalAssets: ExplainComicAsset[] = assets.list.map((a, i) => ({
    ...a,
    image_uri: rewriteList[i] || a.image_uri,
  }));

  const ttsSpeedRaw = Number(raw.tts_speed);
  const opts: ExplainComicOptions = {
    model: channel.upstreamModelSlug || model.slug,
    scriptName,
    scriptContent,
    assets: finalAssets,
    resolution:
      raw.resolution === "1080p" || raw.resolution === "720p" ? raw.resolution : undefined,
    aspectRatio:
      raw.aspect_ratio === "16:9" ||
      raw.aspect_ratio === "9:16" ||
      raw.aspect_ratio === "4:3" ||
      raw.aspect_ratio === "3:4"
        ? raw.aspect_ratio
        : undefined,
    style: typeof raw.style === "string" && raw.style.trim() ? raw.style.trim().slice(0, 10) : undefined,
    language: raw.language === "en" ? "en" : raw.language === "zh" ? "zh" : undefined,
    ttsSpeed:
      Number.isFinite(ttsSpeedRaw) && ttsSpeedRaw >= 1 && ttsSpeedRaw <= 1.5 ? ttsSpeedRaw : undefined,
    enableLipsync: typeof raw.enable_lipsync === "boolean" ? raw.enable_lipsync : undefined,
    callbackUrl:
      typeof raw.callback_url === "string" && raw.callback_url ? raw.callback_url : buildDefaultCallback(),
  };

  const cfg = {
    ...toUpstreamConfig(channel.upstream),
    apiKey: (channel.apiKey && channel.apiKey.trim()) || channel.upstream.apiKey,
  };
  let created;
  try {
    created = await viduCreateExplainComic(opts, cfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: { message: msg, code: "upstream_error" } },
      { status: 502 },
    );
  }

  const paramsSnapshot = {
    scriptName,
    scriptContentLength: cpLen,
    estDurationSec: estSec,
    estCost,
    resolution: opts.resolution,
    aspectRatio: opts.aspectRatio,
    style: opts.style,
    language: opts.language,
    ttsSpeed: opts.ttsSpeed,
    enableLipsync: opts.enableLipsync,
    assetsCount: finalAssets.length,
  };
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      modelId: model.id,
      channelId: channel.id,
      type: "explain-comic",
      prompt: scriptName,
      params: JSON.stringify(paramsSnapshot),
      status: "submitted",
      progress: 5,
      externalId: created.externalId,
      startedAt: new Date(),
    },
  });

  return NextResponse.json({
    id: task.id,
    external_id: created.externalId,
    status: task.status,
    estimated: {
      duration_sec: estSec,
      cost: estCost,
      unit_price: unitPrice,
    },
  });
}

function parseAssets(input: unknown): { list: ExplainComicAsset[]; error?: string } {
  if (input === undefined || input === null) return { list: [] };
  if (!Array.isArray(input)) return { list: [], error: "assets must be array" };
  if (input.length > 20) return { list: [], error: "assets exceeds max 20" };
  const list: ExplainComicAsset[] = [];
  for (let i = 0; i < input.length; i++) {
    const a = input[i] as any;
    if (!a || typeof a !== "object") return { list: [], error: `assets[${i}] not object` };
    const id = String(a.id ?? "").trim();
    const type = String(a.type ?? "").trim();
    const name = String(a.name ?? "").trim();
    if (!id) return { list: [], error: `assets[${i}].id required` };
    if (type !== "character" && type !== "scene" && type !== "tool") {
      return { list: [], error: `assets[${i}].type must be character|scene|tool` };
    }
    if (!name || [...name].length > 10) {
      return { list: [], error: `assets[${i}].name required, ≤ 10 chars` };
    }
    list.push({
      id,
      type: type as ExplainComicAsset["type"],
      name,
      image_uri: typeof a.image_uri === "string" ? a.image_uri : undefined,
      description: typeof a.description === "string" ? a.description : undefined,
      voice_id: typeof a.voice_id === "string" ? a.voice_id : undefined,
    });
  }
  return { list };
}

async function getApiKeyIdFromReq(req: Request): Promise<string | null> {
  const token = extractApiKey(req);
  if (!token) return null;
  // 同 auth.ts 里的 sha256
  const enc = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const k = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  return k?.id ?? null;
}

function buildDefaultCallback(): string | undefined {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!base) return undefined;
  const sec = process.env.VIDU_CALLBACK_SECRET;
  return sec ? `${base}/api/explain-comic/callback?secret=${encodeURIComponent(sec)}` : `${base}/api/explain-comic/callback`;
}
