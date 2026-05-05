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

type OptionPriceInput = {
  paramKey: string;
  optionValue: string;
  costUnitPrice: number;
  sellUnitPrice: number;
  enabled?: boolean;
  note?: string | null;
};

function sanitizeOptionPrices(
  raw: unknown,
): { ok: true; list: OptionPriceInput[] } | { ok: false; error: string } {
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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const { id } = await ctx.params;
  const existing = await prisma.channel.findUnique({
    where: { id },
    include: { model: true },
  });
  if (!existing) return NextResponse.json({ error: "渠道不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.upstreamId === "string") data.upstreamId = body.upstreamId;
  if (typeof body.name === "string") data.name = body.name.trim();
  if (body.tier === "premium" || body.tier === "standard" || body.tier === "economy" || body.tier === "custom") data.tier = body.tier;
  if (typeof body.upstreamModelSlug === "string") data.upstreamModelSlug = body.upstreamModelSlug.trim() || null;
  if (body.upstreamModelSlug === null) data.upstreamModelSlug = null;
  // 渠道专用 key：空串视为"清空回退到上游默认 key"；未传该字段则不动
  if (typeof body.apiKey === "string") data.apiKey = body.apiKey.trim() ? body.apiKey.trim() : null;
  if (body.apiKey === null) data.apiKey = null;
  for (const k of ["costInputPrice", "costOutputPrice", "costUnitPrice", "sellInputPrice", "sellOutputPrice", "sellUnitPrice", "priority"]) {
    if (body[k] !== undefined && Number.isFinite(+body[k])) data[k] = +body[k];
  }
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.enableFallback === "boolean") data.enableFallback = body.enableFallback;
  if (typeof body.notes === "string") data.notes = body.notes;
  if (body.notes === null) data.notes = null;

  // 合并后的字段做校验
  const merged = { ...existing, ...data } as any;
  try {
    await validateChannelPricing(merged, toMode(existing.model.type));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  // 选项级定价 reconcile（传了才动，传空数组 = 清空）
  let optionPricesNext: OptionPriceInput[] | null = null;
  if (body.optionPrices !== undefined) {
    const r = sanitizeOptionPrices(body.optionPrices);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    optionPricesNext = r.list;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.channel.update({ where: { id }, data });
    if (optionPricesNext !== null) {
      await tx.channelOptionPrice.deleteMany({ where: { channelId: id } });
      if (optionPricesNext.length > 0) {
        await tx.channelOptionPrice.createMany({
          data: optionPricesNext.map((o) => ({
            channelId: id,
            paramKey: o.paramKey,
            optionValue: o.optionValue,
            costUnitPrice: o.costUnitPrice,
            sellUnitPrice: o.sellUnitPrice,
            enabled: o.enabled !== false,
            note: o.note ?? null,
          })),
        });
      }
    }
    return tx.channel.findUnique({
      where: { id: u.id },
      include: {
        upstream: true,
        model: { select: { type: true, slug: true } },
        optionPrices: { orderBy: [{ paramKey: "asc" }, { optionValue: "asc" }] },
      },
    });
  });

  const mode = toMode(updated!.model.type);
  const hasApiKey = Boolean(updated!.apiKey && updated!.apiKey.trim());
  const { apiKey: _k, ...safe } = updated as any;
  return NextResponse.json({
    channel: {
      ...safe,
      hasApiKey,
      apiKeyMasked: hasApiKey
        ? (updated!.apiKey!.length <= 12
            ? "••••" + updated!.apiKey!.slice(-2)
            : maskKey(updated!.apiKey!))
        : "",
      profitRate: computeProfitRate(updated!, mode),
      optionPrices: (updated as any).optionPrices.map((o: any) => ({
        id: o.id,
        paramKey: o.paramKey,
        optionValue: o.optionValue,
        costUnitPrice: o.costUnitPrice,
        sellUnitPrice: o.sellUnitPrice,
        enabled: o.enabled,
        note: o.note,
      })),
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const { id } = await ctx.params;
  await prisma.$transaction(async (tx) => {
    await tx.usage.updateMany({ where: { channelId: id }, data: { channelId: null } });
    await tx.task.updateMany({ where: { channelId: id }, data: { channelId: null } });
    await tx.channel.delete({ where: { id } }); // optionPrices 会随 Cascade 删除
  });
  return NextResponse.json({ ok: true });
}
