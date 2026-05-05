import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { validateChannelPricing, computeProfitRate, getMinProfitRate, type Mode } from "@/lib/channels";
import { OPTION_PRICING_KEYS } from "@/lib/channel-option-pricing";

export const runtime = "nodejs";

/**
 * 「上游密钥池」视图：
 * 把 Channel 按 (upstreamId, apiKey) 分组成"密钥包"。
 *   - apiKey 为空 / null → 归到该上游的"默认 key"包
 *   - 同一 apiKey 可能横跨多个模型，整包一次配置/修改
 *
 * 目前支持 chat / image / video 三种模态：
 *   - chat        ：按 ¥/1K tokens 计费，有 input 和 output 两档价
 *   - image/video ：按 ¥/张 或 ¥/秒 的单价计费，image 额外支持按 imageSize 差异化定价
 */

const SUPPORTED_TYPES = ["chat", "image", "video", "audio"] as const;
type SupportedType = (typeof SUPPORTED_TYPES)[number];

function toMode(t: string): Mode {
  return t === "chat" || t === "image" || t === "video" || t === "audio" ? t : "chat";
}

function maskKey(k: string | null | undefined): string {
  if (!k) return "";
  if (k.length <= 12) return "••••" + k.slice(-2);
  return k.slice(0, 6) + "…" + k.slice(-4);
}

function pkgKeyFor(upstreamId: string, apiKey: string | null | undefined): string {
  // 稳定分组用的字符串 key（不泄露明文 key，只在前端做 group-by）
  const tail = apiKey && apiKey.trim() ? apiKey.trim().slice(-6) : "__default__";
  return `${upstreamId}::${tail}`;
}

/* =========================== GET =========================== */

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }

  const [channels, upstreams, allModels, minChatRate, minImageRate, minVideoRate] =
    await Promise.all([
      prisma.channel.findMany({
        where: { model: { type: { in: SUPPORTED_TYPES as unknown as string[] } } },
        include: {
          upstream: true,
          model: {
            select: {
              id: true, slug: true, name: true, type: true,
              unit: true, unitPrice: true,
              inputPrice: true, outputPrice: true,
              contextLength: true,
            },
          },
          optionPrices: { orderBy: [{ paramKey: "asc" }, { optionValue: "asc" }] },
        },
        orderBy: [{ upstreamId: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
      }),
      prisma.upstream.findMany({
        select: { id: true, slug: true, name: true, baseUrl: true, enabled: true, apiKey: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.model.findMany({
        where: { type: { in: SUPPORTED_TYPES as unknown as string[] } },
        include: { provider: { select: { name: true, logo: true } } },
        orderBy: [{ type: "asc" }, { enabled: "desc" }, { createdAt: "asc" }],
      }),
      getMinProfitRate("chat"),
      getMinProfitRate("image"),
      getMinProfitRate("video"),
    ]);

  type Pkg = {
    pkgKey: string;
    upstream: { id: string; slug: string; name: string; enabled: boolean; baseUrl: string; hasDefaultKey: boolean };
    hasApiKey: boolean;
    apiKeyMasked: string;
    channels: any[];
  };
  const pkgMap = new Map<string, Pkg>();

  for (const c of channels) {
    const key = pkgKeyFor(c.upstreamId, c.apiKey);
    let pkg = pkgMap.get(key);
    if (!pkg) {
      pkg = {
        pkgKey: key,
        upstream: {
          id: c.upstream.id,
          slug: c.upstream.slug,
          name: c.upstream.name,
          enabled: c.upstream.enabled,
          baseUrl: c.upstream.baseUrl,
          hasDefaultKey: Boolean(c.upstream.apiKey && c.upstream.apiKey.trim()),
        },
        hasApiKey: Boolean(c.apiKey && c.apiKey.trim()),
        apiKeyMasked: c.apiKey ? maskKey(c.apiKey) : "",
        channels: [],
      };
      pkgMap.set(key, pkg);
    }
    pkg.channels.push({
      id: c.id,
      modelId: c.modelId,
      model: c.model,
      name: c.name,
      tier: c.tier,
      upstreamModelSlug: c.upstreamModelSlug,
      costUnitPrice: c.costUnitPrice,
      sellUnitPrice: c.sellUnitPrice,
      // chat 专用字段（image/video 直接是 0，前端忽略即可）
      costInputPrice: c.costInputPrice,
      costOutputPrice: c.costOutputPrice,
      sellInputPrice: c.sellInputPrice,
      sellOutputPrice: c.sellOutputPrice,
      priority: c.priority,
      enabled: c.enabled,
      enableFallback: c.enableFallback,
      notes: c.notes,
      profitRate: computeProfitRate(c, toMode(c.model.type)),
      optionPrices: (c as any).optionPrices?.map((o: any) => ({
        paramKey: o.paramKey,
        optionValue: o.optionValue,
        costUnitPrice: o.costUnitPrice,
        sellUnitPrice: o.sellUnitPrice,
        enabled: o.enabled,
      })) || [],
    });
  }

  const packages = Array.from(pkgMap.values());

  return NextResponse.json({
    packages,
    upstreams: upstreams.map((u) => ({
      id: u.id,
      slug: u.slug,
      name: u.name,
      baseUrl: u.baseUrl,
      enabled: u.enabled,
      hasDefaultKey: Boolean(u.apiKey && u.apiKey.trim()),
      defaultKeyMasked: u.apiKey ? maskKey(u.apiKey) : "",
    })),
    models: allModels.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      type: m.type,
      enabled: m.enabled,
      unit: m.unit,
      unitPrice: m.unitPrice,
      // 给 chat 模型带上参考的输入/输出价，前端加模型时可以当默认值
      inputPrice: m.inputPrice,
      outputPrice: m.outputPrice,
      contextLength: m.contextLength,
      provider: m.provider,
      tags: m.tags?.split(",").filter(Boolean) || [],
    })),
    minProfitRates: { chat: minChatRate, image: minImageRate, video: minVideoRate },
    // 兼容保留：旧前端仍按 minProfitRate 取图像利润率
    minProfitRate: minImageRate,
  });
}

/* =========================== POST =========================== */

type OptionPriceInput = {
  paramKey: string;
  optionValue: string;
  costUnitPrice: number;
  sellUnitPrice: number;
  enabled?: boolean;
};
type ChannelInput = {
  id?: string;                  // 有 id 就更新那条，否则创建
  modelId: string;
  name?: string;
  tier?: "premium" | "standard" | "economy" | "custom";
  upstreamModelSlug?: string | null;
  // image / video：按单价
  costUnitPrice?: number;
  sellUnitPrice?: number;
  // chat：按 1K tokens 的输入 / 输出双价
  costInputPrice?: number;
  costOutputPrice?: number;
  sellInputPrice?: number;
  sellOutputPrice?: number;
  priority?: number;
  enabled?: boolean;
  enableFallback?: boolean;
  notes?: string | null;
  optionPrices?: OptionPriceInput[];
};

function sanitizeOptionPrices(
  raw: unknown,
  ctx: string,
): { ok: true; list: OptionPriceInput[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, list: [] };
  if (!Array.isArray(raw)) return { ok: false, error: `${ctx}: optionPrices 必须是数组` };
  const list: OptionPriceInput[] = [];
  const seen = new Set<string>();
  for (const o of raw as any[]) {
    if (!o || typeof o !== "object") return { ok: false, error: `${ctx}: optionPrices 项格式不对` };
    const paramKey = String(o.paramKey || "").trim();
    const optionValue = String(o.optionValue ?? "").trim();
    if (!paramKey || !optionValue) return { ok: false, error: `${ctx}: paramKey/optionValue 必填` };
    if (!(OPTION_PRICING_KEYS as readonly string[]).includes(paramKey)) {
      return { ok: false, error: `${ctx}: 暂不支持 paramKey=${paramKey}` };
    }
    const dk = `${paramKey}::${optionValue}`;
    if (seen.has(dk)) return { ok: false, error: `${ctx}: ${dk} 重复` };
    seen.add(dk);
    const cost = +o.costUnitPrice, sell = +o.sellUnitPrice;
    if (!Number.isFinite(cost) || cost < 0) return { ok: false, error: `${ctx} ${dk}: 成本非法` };
    if (!Number.isFinite(sell) || sell < 0) return { ok: false, error: `${ctx} ${dk}: 售价非法` };
    list.push({
      paramKey, optionValue,
      costUnitPrice: cost, sellUnitPrice: sell,
      enabled: o.enabled !== false,
    });
  }
  return { ok: true, list };
}

export async function POST(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const upstreamId = typeof body.upstreamId === "string" ? body.upstreamId : "";
  if (!upstreamId) return NextResponse.json({ error: "upstreamId 必填" }, { status: 400 });

  // apiKey 语义：
  //   - "__KEEP__" = 编辑时保留原 key（前端没有明文，只能用占位符）
  //   - null / 空串 = 使用上游默认 key
  //   - 其他字符串 = 设置为该专属 key
  const existingIds: string[] = Array.isArray(body.existingChannelIds)
    ? body.existingChannelIds.filter((x: unknown) => typeof x === "string")
    : [];

  let apiKey: string | null;
  if (body.apiKey === "__KEEP__") {
    if (existingIds.length === 0) {
      return NextResponse.json({ error: "没有 existingChannelIds 时无法保留原 key" }, { status: 400 });
    }
    const sample = await prisma.channel.findFirst({
      where: { id: { in: existingIds } },
      select: { apiKey: true },
    });
    apiKey = sample?.apiKey && sample.apiKey.trim() ? sample.apiKey : null;
  } else {
    const rawApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    apiKey = rawApiKey ? rawApiKey : null;
  }

  const channels: ChannelInput[] = Array.isArray(body.channels) ? body.channels : [];
  if (channels.length === 0) {
    return NextResponse.json({ error: "至少需要配置 1 个模型的渠道" }, { status: 400 });
  }

  // 上游存在性
  const upstream = await prisma.upstream.findUnique({ where: { id: upstreamId } });
  if (!upstream) return NextResponse.json({ error: "上游不存在" }, { status: 400 });

  // 加载涉及的模型
  const modelIds = [...new Set(channels.map((c) => c.modelId).filter(Boolean))];
  const models = await prisma.model.findMany({ where: { id: { in: modelIds } } });
  const modelMap = new Map(models.map((m) => [m.id, m]));

  // 前置：逐条校验定价（按每个 Model 的类型走对应模式：chat / image / video 三类都支持）
  for (const inp of channels) {
    const m = modelMap.get(inp.modelId);
    if (!m) return NextResponse.json({ error: `modelId=${inp.modelId} 不存在` }, { status: 400 });
    if (!(SUPPORTED_TYPES as readonly string[]).includes(m.type)) {
      return NextResponse.json(
        { error: `密钥包目前只支持 chat / image / video / audio 模型，而 ${m.name}(${m.slug}) 类型是 ${m.type}` },
        { status: 400 },
      );
    }

    let draft;
    if (m.type === "chat") {
      const ci = +(inp.costInputPrice ?? 0);
      const co = +(inp.costOutputPrice ?? 0);
      const si = +(inp.sellInputPrice ?? 0);
      const so = +(inp.sellOutputPrice ?? 0);
      if (!Number.isFinite(ci) || ci < 0) return NextResponse.json({ error: `${m.name}：输入成本价非法` }, { status: 400 });
      if (!Number.isFinite(co) || co < 0) return NextResponse.json({ error: `${m.name}：输出成本价非法` }, { status: 400 });
      if (!Number.isFinite(si) || si < 0) return NextResponse.json({ error: `${m.name}：输入售价非法` }, { status: 400 });
      if (!Number.isFinite(so) || so < 0) return NextResponse.json({ error: `${m.name}：输出售价非法` }, { status: 400 });
      draft = {
        costInputPrice: ci,
        costOutputPrice: co,
        costUnitPrice: 0,
        sellInputPrice: si,
        sellOutputPrice: so,
        sellUnitPrice: 0,
      };
    } else {
      const cu = +(inp.costUnitPrice ?? 0);
      const su = +(inp.sellUnitPrice ?? 0);
      if (!Number.isFinite(cu) || cu < 0) return NextResponse.json({ error: `${m.name}：成本价非法` }, { status: 400 });
      if (!Number.isFinite(su) || su < 0) return NextResponse.json({ error: `${m.name}：售价非法` }, { status: 400 });
      draft = {
        costInputPrice: 0,
        costOutputPrice: 0,
        costUnitPrice: cu,
        sellInputPrice: 0,
        sellOutputPrice: 0,
        sellUnitPrice: su,
      };
    }

    try {
      await validateChannelPricing(draft, toMode(m.type));
    } catch (e) {
      return NextResponse.json(
        { error: `${m.name}：${e instanceof Error ? e.message : String(e)}` },
        { status: 400 },
      );
    }

    // 选项价校验（目前只有 image 模型支持 imageSize 级差异定价）
    if (m.type === "image") {
      const r = sanitizeOptionPrices(inp.optionPrices, m.name);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      inp.optionPrices = r.list;
    } else {
      inp.optionPrices = [];
    }
  }

  // 进事务：upsert submitted channels + delete removed ones
  const submittedIds = new Set(channels.filter((c) => c.id).map((c) => c.id as string));
  const toDelete = existingIds.filter((id) => !submittedIds.has(id));

  let created = 0, updated = 0, deleted = 0;

  await prisma.$transaction(async (tx) => {
    // 1) 先删差集
    if (toDelete.length) {
      await tx.usage.updateMany({ where: { channelId: { in: toDelete } }, data: { channelId: null } });
      await tx.task.updateMany({ where: { channelId: { in: toDelete } }, data: { channelId: null } });
      const d = await tx.channel.deleteMany({ where: { id: { in: toDelete } } });
      deleted = d.count;
    }

    // 2) upsert
    for (const inp of channels) {
      const m = modelMap.get(inp.modelId)!;
      const pricing = m.type === "chat"
        ? {
            costInputPrice: +(inp.costInputPrice ?? 0),
            costOutputPrice: +(inp.costOutputPrice ?? 0),
            costUnitPrice: 0,
            sellInputPrice: +(inp.sellInputPrice ?? 0),
            sellOutputPrice: +(inp.sellOutputPrice ?? 0),
            sellUnitPrice: 0,
          }
        : {
            costInputPrice: 0,
            costOutputPrice: 0,
            costUnitPrice: +(inp.costUnitPrice ?? 0),
            sellInputPrice: 0,
            sellOutputPrice: 0,
            sellUnitPrice: +(inp.sellUnitPrice ?? 0),
          };
      const data = {
        modelId: inp.modelId,
        upstreamId,
        apiKey, // 整包共用同一把 key
        name: (inp.name && inp.name.trim()) || `${upstream.name} · ${m.name}`,
        tier: inp.tier || "standard",
        upstreamModelSlug: inp.upstreamModelSlug ? String(inp.upstreamModelSlug).trim() : null,
        ...pricing,
        priority: Number.isFinite(+(inp.priority as number)) ? +(inp.priority as number) : 100,
        enabled: inp.enabled !== false,
        enableFallback: inp.enableFallback !== false,
        notes: typeof inp.notes === "string" ? inp.notes : null,
      };

      let savedId: string;
      if (inp.id) {
        const u = await tx.channel.update({ where: { id: inp.id }, data });
        savedId = u.id;
        updated++;
      } else {
        try {
          const c = await tx.channel.create({ data });
          savedId = c.id;
          created++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("Unique constraint")) {
            // 已存在同 (modelId, upstreamId, name)，转为更新
            const dup = await tx.channel.findFirst({ where: { modelId: inp.modelId, upstreamId, name: data.name } });
            if (dup) {
              const u = await tx.channel.update({ where: { id: dup.id }, data });
              savedId = u.id;
              updated++;
            } else {
              throw e;
            }
          } else {
            throw e;
          }
        }
      }

      // reconcile 分辨率价：简化成"删后重建"
      await tx.channelOptionPrice.deleteMany({ where: { channelId: savedId } });
      const ops = inp.optionPrices || [];
      if (ops.length > 0) {
        await tx.channelOptionPrice.createMany({
          data: ops.map((o) => ({
            channelId: savedId,
            paramKey: o.paramKey,
            optionValue: o.optionValue,
            costUnitPrice: o.costUnitPrice,
            sellUnitPrice: o.sellUnitPrice,
            enabled: o.enabled !== false,
          })),
        });
      }
    }
  });

  return NextResponse.json({ ok: true, created, updated, deleted });
}

/* =========================== DELETE =========================== */

export async function DELETE(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.channelIds) ? body.channelIds.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "channelIds 必填" }, { status: 400 });

  const r = await prisma.$transaction(async (tx) => {
    await tx.usage.updateMany({ where: { channelId: { in: ids } }, data: { channelId: null } });
    await tx.task.updateMany({ where: { channelId: { in: ids } }, data: { channelId: null } });
    return tx.channel.deleteMany({ where: { id: { in: ids } } });
  });

  return NextResponse.json({ ok: true, deleted: r.count });
}
