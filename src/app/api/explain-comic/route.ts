/**
 * 解说剧成片（Vidu explain-comic）—— 提交异步任务
 *
 * 计费模型：后付费，20 积分/秒（= 我们这里的 sellUnitPrice 元/秒）
 *   - 提交时：按 script_content 字数估算秒数（≈ 400 字/分钟），扣"预估冻结额"
 *   - 回调时（callback / 主动查询命中 success）：按真实秒数对账（多退少补）
 *
 * 路由：
 *   POST /api/explain-comic   提交任务
 *   GET  /api/explain-comic?id=...   查询本地任务（直接走 [id]/route.ts）
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pickChannel } from "@/lib/channels";
import { rewriteLocalRefsToBase64 } from "@/lib/media-ref";
import { viduCreateExplainComic } from "@/lib/providers/vidu";
import { toUpstreamConfig } from "@/lib/upstream";
import type { ExplainComicAsset, ExplainComicOptions } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 字数 → 预估秒数（文档：约 400 字/分钟） */
function estimateDurationSec(scriptContent: string): number {
  const len = [...scriptContent].length; // 按 codepoint 计数，更接近"字"
  const sec = Math.round((len / 400) * 60);
  return Math.max(15, Math.min(600, sec)); // 至少 15s，封顶 600s 防异常
}

function validateAssets(input: unknown): { ok: true; assets: ExplainComicAsset[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, assets: [] };
  if (!Array.isArray(input)) return { ok: false, error: "assets 必须是数组" };
  if (input.length > 20) return { ok: false, error: "assets 最多 20 个" };
  const out: ExplainComicAsset[] = [];
  for (let i = 0; i < input.length; i++) {
    const a = input[i] as Record<string, unknown>;
    if (!a || typeof a !== "object") return { ok: false, error: `assets[${i}] 不是对象` };
    const id = String(a.id ?? "").trim();
    const type = String(a.type ?? "").trim();
    const name = String(a.name ?? "").trim();
    if (!id) return { ok: false, error: `assets[${i}].id 必填` };
    if (type !== "character" && type !== "scene" && type !== "tool") {
      return { ok: false, error: `assets[${i}].type 仅支持 character / scene / tool` };
    }
    if (!name || [...name].length > 10) {
      return { ok: false, error: `assets[${i}].name 必填且 ≤ 10 字` };
    }
    out.push({
      id,
      type: type as ExplainComicAsset["type"],
      name,
      image_uri: a.image_uri ? String(a.image_uri) : undefined,
      description: a.description ? String(a.description) : undefined,
      voice_id: a.voice_id ? String(a.voice_id) : undefined,
    });
  }
  return { ok: true, assets: out };
}

/**
 * 把 assets 里的本站本地图 / data:URL 改写成上游可访问的 URL。
 * 复用 rewriteLocalRefsToBase64 的核心逻辑：把 image_uri 字段套进 params 里
 * 让它处理后再拆出来。
 */
async function rewriteAssetImages(assets: ExplainComicAsset[]): Promise<ExplainComicAsset[]> {
  if (assets.length === 0) return assets;
  const wrapped = { image_urls: assets.map((a) => a.image_uri || "") };
  const out = await rewriteLocalRefsToBase64(wrapped);
  const list: string[] = (out?.image_urls as string[]) || wrapped.image_urls;
  return assets.map((a, i) => ({ ...a, image_uri: list[i] || a.image_uri }));
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

  const modelId: string | undefined = typeof body.modelId === "string" ? body.modelId : undefined;
  const scriptName: string = typeof body.scriptName === "string" ? body.scriptName.trim() : "";
  const scriptContent: string = typeof body.scriptContent === "string" ? body.scriptContent : "";
  const channelId: string | null = typeof body.channelId === "string" ? body.channelId : null;

  if (!modelId) return NextResponse.json({ error: "modelId 必填" }, { status: 400 });
  if (!scriptName || [...scriptName].length > 20) {
    return NextResponse.json({ error: "scriptName 必填且 ≤ 20 字" }, { status: 400 });
  }
  const cpLen = [...scriptContent].length;
  if (cpLen < 50 || cpLen > 2000) {
    return NextResponse.json({ error: "scriptContent 必须 50-2000 字" }, { status: 400 });
  }

  const assetsCheck = validateAssets(body.assets);
  if (!assetsCheck.ok) return NextResponse.json({ error: assetsCheck.error }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 400 });

  const model = await prisma.model.findUnique({
    where: { id: modelId },
    include: { provider: true },
  });
  if (!model || (model.type !== "explain-comic" && model.type !== "video")) {
    // 兼容历史 type=video 的 vidu-explain-comic
    return NextResponse.json({ error: "模型不可用" }, { status: 400 });
  }

  const channel = await pickChannel(model.id, channelId);
  if (!channel) {
    return NextResponse.json({ error: "该模型没有可用渠道，请联系管理员" }, { status: 503 });
  }
  // 预估时长 + 预估金额（用于本次余额校验和"冻结"）
  const estSec = estimateDurationSec(scriptContent);
  const unitPrice = channel.sellUnitPrice || model.unitPrice;
  const estCost = +(unitPrice * estSec).toFixed(4);
  if (user.balance < estCost) {
    return NextResponse.json(
      { error: `余额不足：本次预计 ¥${estCost.toFixed(2)}（${estSec}s × ¥${unitPrice}/s），当前余额 ¥${user.balance.toFixed(2)}` },
      { status: 402 },
    );
  }

  // 把资产图改成上游可拉的 URL（本站本地 /uploads → 公网图床或 base64）
  const rewrittenAssets = await rewriteAssetImages(assetsCheck.assets);

  const ttsSpeedRaw = Number(body.ttsSpeed);
  const opts: ExplainComicOptions = {
    model: channel.upstreamModelSlug || model.slug,
    scriptName,
    scriptContent,
    assets: rewrittenAssets,
    resolution: body.resolution === "1080p" || body.resolution === "720p" ? body.resolution : undefined,
    aspectRatio:
      body.aspectRatio === "16:9" || body.aspectRatio === "9:16" || body.aspectRatio === "4:3" || body.aspectRatio === "3:4"
        ? body.aspectRatio
        : undefined,
    style: typeof body.style === "string" && body.style.trim() ? body.style.trim().slice(0, 10) : undefined,
    language: body.language === "en" ? "en" : body.language === "zh" ? "zh" : undefined,
    ttsSpeed: Number.isFinite(ttsSpeedRaw) && ttsSpeedRaw >= 1 && ttsSpeedRaw <= 1.5 ? ttsSpeedRaw : undefined,
    enableLipsync: typeof body.enableLipsync === "boolean" ? body.enableLipsync : undefined,
    callbackUrl: typeof body.callbackUrl === "string" ? body.callbackUrl : buildDefaultCallbackUrl(req),
  };

  // 调上游
  const upstreamCfg = {
    ...toUpstreamConfig(channel.upstream),
    apiKey: (channel.apiKey && channel.apiKey.trim()) || channel.upstream.apiKey,
  };
  let created;
  try {
    created = await viduCreateExplainComic(opts, upstreamCfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 写 Task：状态置 submitted；冻结额暂不立刻扣（因为 chargeUsage 是"实结算+扣余额"原子，
  // 我们这里只把"预估额"记到 params.estCost，回调成功时再走 chargeUsage 扣实际秒数。
  // 提交时不预扣是为了避免任务失败要复杂的退款逻辑——失败直接不扣。）
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
    assetsCount: rewrittenAssets.length,
  };
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      modelId: model.id,
      channelId: channel.id,
      type: "explain-comic",
      prompt: scriptName, // Task.prompt 字段必填，存剧名做摘要
      params: JSON.stringify(paramsSnapshot),
      status: "submitted",
      progress: 5,
      externalId: created.externalId,
      startedAt: new Date(),
    },
  });

  return NextResponse.json({
    task_id: task.id,
    external_id: created.externalId,
    status: task.status,
    estimated: {
      duration_sec: estSec,
      cost: estCost,
      unit_price: unitPrice,
    },
  });
}

function buildDefaultCallbackUrl(req: Request): string | undefined {
  // 优先环境变量；否则不下发回调（让用户走轮询）
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!base) return undefined;
  return `${base}/api/explain-comic/callback`;
}
