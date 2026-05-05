import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { validateChannelPricing, computeProfitRate, type Mode } from "@/lib/channels";
import { OPTION_PRICING_KEYS } from "@/lib/channel-option-pricing";

export const runtime = "nodejs";

function toMode(type: string): Mode {
  return type === "chat" || type === "image" || type === "video" || type === "audio" ? type : "chat";
}

function maskKey(k: string): string {
  if (!k) return "";
  if (k.length <= 12) return "••••" + k.slice(-2);
  return k.slice(0, 6) + "…" + k.slice(-4);
}

/** 传入的 optionPrices 合法性检查 + 归一化 */
type OptionPriceInput = {
  paramKey: string;
  optionValue: string;
  costUnitPrice: number;
  sellUnitPrice: number;
  enabled?: boolean;
  note?: string | null;
};
function sanitizeOptionPrices(raw: unknown): { ok: true; list: OptionPriceInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "optionPrices 必须是数组" };
  const list: OptionPriceInput[] = [];
  const seen = new Set<string>();
  for (const item of raw as any[]) {
    if (!item || typeof item !== "object") return { ok: false, error: "optionPrices 项格式不对" };
    const paramKey = String(item.paramKey || "").trim();
    const optionValue = String(item.optionValue ?? "").trim();
    if (!paramKey || !optionValue) return { ok: false, error: "paramKey / optionValue 必填" };
    if (!(OPTION_PRICING_KEYS as readonly string[]).includes(paramKey)) {
      return { ok: false, error: `暂不支持按 paramKey=${paramKey} 定价（目前只支持 ${OPTION_PRICING_KEYS.join(", ")}）` };
    }
    const dk = `${paramKey}::${optionValue}`;
    if (seen.has(dk)) return { ok: false, error: `同一 (paramKey, optionValue) 出现重复：${dk}` };
    seen.add(dk);
    const cost = +item.costUnitPrice;
    const sell = +item.sellUnitPrice;
    if (!Number.isFinite(cost) || cost < 0) return { ok: false, error: `${dk}: 成本价非法` };
    if (!Number.isFinite(sell) || sell < 0) return { ok: false, error: `${dk}: 售价非法` };
    list.push({
      paramKey,
      optionValue,
      costUnitPrice: cost,
      sellUnitPrice: sell,
      enabled: item.enabled !== false,
      note: typeof item.note === "string" ? item.note : null,
    });
  }
  return { ok: true, list };
}

function serialize(c: any) {
  const mode: Mode = toMode(c.model?.type || "chat");
  const hasApiKey = Boolean(c.apiKey && String(c.apiKey).trim());
  return {
    id: c.id,
    modelId: c.modelId,
    upstreamId: c.upstreamId,
    name: c.name,
    tier: c.tier,
    upstreamModelSlug: c.upstreamModelSlug,
    hasApiKey,
    apiKeyMasked: hasApiKey ? maskKey(String(c.apiKey)) : "",
    costInputPrice: c.costInputPrice,
    costOutputPrice: c.costOutputPrice,
    costUnitPrice: c.costUnitPrice,
    sellInputPrice: c.sellInputPrice,
    sellOutputPrice: c.sellOutputPrice,
    sellUnitPrice: c.sellUnitPrice,
    priority: c.priority,
    enabled: c.enabled,
    enableFallback: c.enableFallback,
    notes: c.notes,
    profitRate: computeProfitRate(c, mode),
    optionPrices: Array.isArray(c.optionPrices)
      ? c.optionPrices.map((o: any) => ({
          id: o.id,
          paramKey: o.paramKey,
          optionValue: o.optionValue,
          costUnitPrice: o.costUnitPrice,
          sellUnitPrice: o.sellUnitPrice,
          enabled: o.enabled,
          note: o.note,
        }))
      : [],
    upstream: c.upstream ? { id: c.upstream.id, slug: c.upstream.slug, name: c.upstream.name, enabled: c.upstream.enabled } : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** GET /api/admin/channels?modelId=xxx */
export async function GET(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get("modelId");
  const where = modelId ? { modelId } : undefined;
  const list = await prisma.channel.findMany({
    where,
    include: {
      upstream: true,
      model: { select: { type: true, slug: true } },
      optionPrices: { orderBy: [{ paramKey: "asc" }, { optionValue: "asc" }] },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ channels: list.map(serialize) });
}

export async function POST(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const body = await req.json().catch(() => null);
  if (!body?.modelId || !body?.upstreamId || !body?.name) {
    return NextResponse.json({ error: "modelId / upstreamId / name 必填" }, { status: 400 });
  }

  const model = await prisma.model.findUnique({ where: { id: body.modelId } });
  if (!model) return NextResponse.json({ error: "模型不存在" }, { status: 400 });
  const upstream = await prisma.upstream.findUnique({ where: { id: body.upstreamId } });
  if (!upstream) return NextResponse.json({ error: "上游不存在" }, { status: 400 });

  const data = {
    modelId: body.modelId,
    upstreamId: body.upstreamId,
    name: String(body.name).trim(),
    tier: body.tier === "premium" || body.tier === "economy" || body.tier === "custom" ? body.tier : "standard",
    upstreamModelSlug: body.upstreamModelSlug ? String(body.upstreamModelSlug).trim() : null,
    apiKey: typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : null,
    costInputPrice: +body.costInputPrice || 0,
    costOutputPrice: +body.costOutputPrice || 0,
    costUnitPrice: +body.costUnitPrice || 0,
    sellInputPrice: +body.sellInputPrice || 0,
    sellOutputPrice: +body.sellOutputPrice || 0,
    sellUnitPrice: +body.sellUnitPrice || 0,
    priority: Number.isFinite(+body.priority) ? +body.priority : 100,
    enabled: body.enabled !== false,
    enableFallback: body.enableFallback !== false,
    notes: typeof body.notes === "string" ? body.notes : null,
  };

  const mode = toMode(model.type);
  try {
    await validateChannelPricing(data, mode);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  // 选项级定价（如 imageSize=4K）
  let optionPrices: OptionPriceInput[] = [];
  if (body.optionPrices !== undefined) {
    const r = sanitizeOptionPrices(body.optionPrices);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    optionPrices = r.list;
  }

  try {
    const created = await prisma.channel.create({
      data: {
        ...data,
        ...(optionPrices.length > 0 && {
          optionPrices: {
            create: optionPrices.map((o) => ({
              paramKey: o.paramKey,
              optionValue: o.optionValue,
              costUnitPrice: o.costUnitPrice,
              sellUnitPrice: o.sellUnitPrice,
              enabled: o.enabled !== false,
              note: o.note,
            })),
          },
        }),
      },
    });
    const full = await prisma.channel.findUnique({
      where: { id: created.id },
      include: {
        upstream: true,
        model: { select: { type: true, slug: true } },
        optionPrices: { orderBy: [{ paramKey: "asc" }, { optionValue: "asc" }] },
      },
    });
    return NextResponse.json({ channel: serialize(full) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "同一模型下，该上游已存在同名渠道" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
