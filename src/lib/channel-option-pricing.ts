/**
 * 渠道 × 参数选项的定价解析
 * ----------------------------------------
 * 业务目标：同一条渠道下，不同的参数值（如 imageSize=1K/2K/4K）可以有不同的计费价格。
 *
 * 目前只支持 `imageSize`；后续要加新维度时，扩展 OPTION_PRICING_KEYS + 解析逻辑即可。
 * 当请求选的值在 ChannelOptionPrice 里找不到对应记录时，按用户选择，兜底使用渠道基础价。
 */
import { prisma } from "./db";
import type { Channel, ChannelOptionPrice } from "@prisma/client";

/** 参与分选项定价的参数 key。顺序 = 匹配优先级（首个命中的 key 决定价格）。 */
export const OPTION_PRICING_KEYS = ["imageSize"] as const;
export type OptionPricingKey = (typeof OPTION_PRICING_KEYS)[number];

export type EffectivePrice = {
  costUnitPrice: number;
  sellUnitPrice: number;
  /** 命中的覆盖来源（null 表示用了渠道基础价） */
  matched: { paramKey: string; optionValue: string } | null;
};

/** 把任意前端传来的参数值统一成字符串，方便和 DB 里的 optionValue 比较。 */
function normalizeOptionValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** 在一堆覆盖记录里查 (paramKey, optionValue)。enabled=false 视为未配置。 */
function pickOverride(
  overrides: ChannelOptionPrice[],
  paramKey: string,
  optionValue: string,
): ChannelOptionPrice | null {
  return (
    overrides.find(
      (o) =>
        o.enabled &&
        o.paramKey === paramKey &&
        o.optionValue === optionValue,
    ) ?? null
  );
}

/**
 * 给「已经加载好 overrides 的」渠道做计价。
 * 调用侧一般已经在 pickChannel 阶段 include 了 optionPrices，避免额外一次查询。
 */
export function resolveEffectivePriceFromLoaded(
  channel: Pick<Channel, "costUnitPrice" | "sellUnitPrice"> & {
    optionPrices?: ChannelOptionPrice[];
  },
  params: Record<string, unknown> | undefined | null,
): EffectivePrice {
  const base: EffectivePrice = {
    costUnitPrice: channel.costUnitPrice,
    sellUnitPrice: channel.sellUnitPrice,
    matched: null,
  };

  const overrides = channel.optionPrices || [];
  if (!params || overrides.length === 0) return base;

  for (const key of OPTION_PRICING_KEYS) {
    const value = normalizeOptionValue((params as Record<string, unknown>)[key]);
    if (!value) continue;
    const hit = pickOverride(overrides, key, value);
    if (hit) {
      return {
        costUnitPrice: hit.costUnitPrice,
        sellUnitPrice: hit.sellUnitPrice,
        matched: { paramKey: key, optionValue: value },
      };
    }
  }
  return base;
}

/**
 * 无 overrides 数据时使用的异步版本：先查 DB 再解析。
 * 仅用于后置链路（比如 billing 时才知道最终 channelId 的情况）。
 */
export async function resolveEffectivePrice(
  channelId: string,
  params: Record<string, unknown> | undefined | null,
): Promise<EffectivePrice> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { optionPrices: true },
  });
  if (!channel) return { costUnitPrice: 0, sellUnitPrice: 0, matched: null };
  return resolveEffectivePriceFromLoaded(channel, params);
}
