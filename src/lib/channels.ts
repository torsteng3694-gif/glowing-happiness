import { prisma } from "./db";
import type { Channel, Model, Upstream } from "@prisma/client";

export type Mode = "chat" | "image" | "video" | "audio";

export type ChannelWithUpstream = Channel & { upstream: Upstream };
export type ChannelWithModel = Channel & { upstream: Upstream; model: Model };

const MIN_RATE_KEY: Record<Mode, string> = {
  chat: "min_profit_rate_chat",
  image: "min_profit_rate_image",
  video: "min_profit_rate_video",
  // 音频（TTS / 音乐）走和视频同样的单价×秒数计费，这里独立给一个 key，
  // 管理员想和视频分开设最低利润率也行；不设就默认 20%。
  audio: "min_profit_rate_audio",
};

export async function getMinProfitRate(mode: Mode): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: MIN_RATE_KEY[mode] } });
  const v = row?.value ? parseFloat(row.value) : 0.2;
  return Number.isFinite(v) && v >= 0 ? v : 0.2;
}

/** 列出某模型下所有启用渠道，按 priority 升序 */
export async function getChannelsForModel(
  modelId: string,
  opts: { onlyEnabled?: boolean } = {},
): Promise<ChannelWithUpstream[]> {
  const where: { modelId: string; enabled?: boolean } = { modelId };
  if (opts.onlyEnabled !== false) where.enabled = true;
  return prisma.channel.findMany({
    where,
    include: { upstream: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * 选定一条渠道：优先用户指定，否则 priority 最低的已启用渠道。
 * 返回 null 表示该模型没有可用渠道。
 */
export async function pickChannel(
  modelId: string,
  preferredChannelId?: string | null,
): Promise<ChannelWithUpstream | null> {
  if (preferredChannelId) {
    const c = await prisma.channel.findUnique({
      where: { id: preferredChannelId },
      include: { upstream: true },
    });
    if (c && c.modelId === modelId && c.enabled && c.upstream.enabled) return c;
    // 用户指定的渠道不可用，继续走默认选择
  }
  const list = await getChannelsForModel(modelId);
  return list.find((c) => c.upstream.enabled) ?? null;
}

/**
 * 校验渠道定价是否达到最低利润率要求。
 * 不达标抛错（Error.message 含人类可读信息）。
 */
export async function validateChannelPricing(
  channel: Pick<
    Channel,
    | "costInputPrice"
    | "costOutputPrice"
    | "costUnitPrice"
    | "sellInputPrice"
    | "sellOutputPrice"
    | "sellUnitPrice"
  >,
  mode: Mode,
): Promise<void> {
  const minRate = await getMinProfitRate(mode);
  const required = 1 + minRate;
  const checks: { label: string; cost: number; sell: number }[] = [];

  if (mode === "chat") {
    checks.push({
      label: "输入价（元/1K tokens）",
      cost: channel.costInputPrice,
      sell: channel.sellInputPrice,
    });
    checks.push({
      label: "输出价（元/1K tokens）",
      cost: channel.costOutputPrice,
      sell: channel.sellOutputPrice,
    });
  } else {
    checks.push({
      label: "单价（元/张或秒）",
      cost: channel.costUnitPrice,
      sell: channel.sellUnitPrice,
    });
  }

  for (const c of checks) {
    if (c.cost <= 0 && c.sell <= 0) continue; // 两边都为 0 视为免费模型，跳过
    const need = c.cost * required;
    if (c.sell < need - 1e-9) {
      throw new Error(
        `${c.label} 未达到最低利润率 ${(minRate * 100).toFixed(0)}%：售价 ${c.sell} < 成本 ${c.cost} × ${required.toFixed(2)} = ${need.toFixed(4)}`,
      );
    }
  }
}

/** 结算：同时算出售价（扣用户）和实际成本。 */
export function calcChannelCost(
  channel: Pick<
    Channel,
    | "costInputPrice"
    | "costOutputPrice"
    | "costUnitPrice"
    | "sellInputPrice"
    | "sellOutputPrice"
    | "sellUnitPrice"
  >,
  mode: Mode,
  args: { inputTokens?: number; outputTokens?: number; units?: number },
): { sellCost: number; realCost: number } {
  if (mode === "chat") {
    const ip = (args.inputTokens ?? 0) / 1000;
    const op = (args.outputTokens ?? 0) / 1000;
    const sellCost = ip * channel.sellInputPrice + op * channel.sellOutputPrice;
    const realCost = ip * channel.costInputPrice + op * channel.costOutputPrice;
    return {
      sellCost: Math.max(0, sellCost),
      realCost: Math.max(0, realCost),
    };
  }
  const units = args.units ?? 1;
  return {
    sellCost: Math.max(0, units * channel.sellUnitPrice),
    realCost: Math.max(0, units * channel.costUnitPrice),
  };
}

/**
 * 调用请求的渠道解析：
 *   - apiKeyId 存在 & 该 Key 的 scopeMode=restricted
 *       → 只允许该 Key 绑定的、且 modelId 匹配的渠道，按 binding.order 升序尝试
 *       → 若没有任何匹配渠道 → 返回 { primary: null, fallbacks: [] }，路由层应当 403
 *   - 否则（open 模式 / 没有 apiKeyId）
 *       → 走 pickChannel + getChannelsForModel 的原行为
 */
export async function resolveChannelsForCall(opts: {
  apiKeyId?: string | null;
  modelId: string;
  preferredChannelId?: string | null;
}): Promise<{
  primary: ChannelWithUpstream | null;
  fallbacks: ChannelWithUpstream[];
  scoped: boolean; // 是否走的 key 限定模式
}> {
  const { apiKeyId, modelId, preferredChannelId } = opts;

  if (apiKeyId) {
    const key = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { scopeMode: true },
    });
    if (key && key.scopeMode === "restricted") {
      const bindings = await prisma.apiKeyChannelBinding.findMany({
        where: {
          apiKeyId,
          channel: { modelId, enabled: true, upstream: { enabled: true } },
        },
        include: { channel: { include: { upstream: true } } },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
      if (bindings.length === 0) {
        return { primary: null, fallbacks: [], scoped: true };
      }
      const channels = bindings.map((b) => b.channel);
      // 如果用户显式指定渠道且命中绑定列表：固定该渠道，不做自动降级
      if (preferredChannelId) {
        const idx = channels.findIndex((c) => c.id === preferredChannelId);
        if (idx >= 0) {
          return { primary: channels[idx], fallbacks: [], scoped: true };
        }
      }
      // 未指定/未命中指定渠道：沿用绑定顺序做自动降级
      const ordered = channels;
      return { primary: ordered[0], fallbacks: ordered.slice(1), scoped: true };
    }
  }

  const primary = await pickChannel(modelId, preferredChannelId);
  const all = await getChannelsForModel(modelId);
  // 显式指定且成功命中时，固定到该渠道，不自动降级
  const pinned = !!(preferredChannelId && primary?.id === preferredChannelId);
  const fallbacks = pinned ? [] : all.filter((c) => c.upstream.enabled && c.id !== primary?.id);
  return { primary, fallbacks, scoped: false };
}

/** 算某渠道当前配置下的利润率（供后台展示）。返回 null 表示无法计算（成本为 0）。 */
export function computeProfitRate(
  channel: Pick<
    Channel,
    | "costInputPrice"
    | "costOutputPrice"
    | "costUnitPrice"
    | "sellInputPrice"
    | "sellOutputPrice"
    | "sellUnitPrice"
  >,
  mode: Mode,
): number | null {
  if (mode === "chat") {
    const cost = channel.costInputPrice + channel.costOutputPrice;
    const sell = channel.sellInputPrice + channel.sellOutputPrice;
    if (cost <= 0) return null;
    return (sell - cost) / cost;
  }
  if (channel.costUnitPrice <= 0) return null;
  return (channel.sellUnitPrice - channel.costUnitPrice) / channel.costUnitPrice;
}
