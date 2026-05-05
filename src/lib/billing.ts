import { prisma } from "./db";
import { calcChannelCost, type Mode } from "./channels";

export type BillingInput = {
  userId: string;
  modelId: string;
  channelId?: string | null;
  type: Mode;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  latencyMs?: number;
  meta?: Record<string, any>;
  /** success（默认，扣费）| failed（不扣费，只记 usage 供健康指标用） */
  status?: "success" | "failed";
  /**
   * 可选：覆盖渠道基础价。主要用于「参数选项定价」场景
   * （比如 imageSize=4K 时成本/售价和默认的 2K 不一样）。
   * 传入后会替代渠道上的 costUnitPrice / sellUnitPrice 参与本次计费。
   * 仅对 image/video 类模式生效；chat 类仍沿用 *InputPrice/*OutputPrice。
   */
  priceOverride?: {
    costUnitPrice: number;
    sellUnitPrice: number;
  } | null;
};

/**
 * 兼容老调用方：按固定价算用户应扣金额。
 */
export function calcCost(params: {
  type: Mode;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  inputPrice: number;
  outputPrice: number;
  unitPrice: number;
}) {
  if (params.type === "chat") {
    const ip = ((params.inputTokens ?? 0) / 1000) * params.inputPrice;
    const op = ((params.outputTokens ?? 0) / 1000) * params.outputPrice;
    return Math.max(0, ip + op);
  }
  return Math.max(0, (params.units ?? 1) * params.unitPrice);
}

/**
 * 记录一次使用 + 扣余额 + 返佣给邀请人。
 * 有 channelId 时：售价从渠道读，同时记录实际成本到 Usage.realCost。
 * 无 channelId 时：降级使用 Model.*Price，realCost=0。
 * 返回本次扣费金额（售价）与余额。
 */
export async function chargeUsage(input: BillingInput) {
  const model = await prisma.model.findUnique({
    where: { id: input.modelId },
    include: { provider: true },
  });
  if (!model) throw new Error("模型不存在");

  const status = input.status ?? "success";
  let cost = 0; // 用户扣费（= 售价）
  let realCost = 0; // 实际成本
  let channelIdToSave: string | null = null;

  if (input.channelId) {
    const channel = await prisma.channel.findUnique({ where: { id: input.channelId } });
    if (channel && channel.modelId === input.modelId) {
      channelIdToSave = channel.id;
      if (status === "success") {
        // 如果调用方传了 priceOverride（例如 imageSize=4K 的专属价），把 channel 的单价替换掉再算
        const effective = input.priceOverride
          ? {
              ...channel,
              costUnitPrice: input.priceOverride.costUnitPrice,
              sellUnitPrice: input.priceOverride.sellUnitPrice,
            }
          : channel;
        const r = calcChannelCost(effective, input.type, {
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          units: input.units,
        });
        cost = r.sellCost;
        realCost = r.realCost;
      }
    }
  }

  if (!channelIdToSave && status === "success") {
    // 兜底：没绑定渠道，用 Model 自带价格
    cost = calcCost({
      type: input.type,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      units: input.units,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      unitPrice: model.unitPrice,
    });
    realCost = 0;
  }
  if (status === "failed") { cost = 0; realCost = 0; }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new Error("用户不存在");

    const newBalance = Math.max(0, user.balance - cost);
    await tx.user.update({
      where: { id: user.id },
      data: {
        balance: newBalance,
        totalSpent: user.totalSpent + cost,
      },
    });

    await tx.usage.create({
      data: {
        userId: input.userId,
        modelId: input.modelId,
        channelId: channelIdToSave,
        type: input.type,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        units: input.units ?? 0,
        cost,
        realCost,
        latencyMs: input.latencyMs,
        status,
        meta: input.meta ? JSON.stringify(input.meta) : null,
      },
    });

    if (cost > 0) {
      await tx.transaction.create({
        data: {
          userId: input.userId,
          type: "consume",
          amount: -cost,
          balance: newBalance,
          note: `调用 ${model.name}`,
          meta: JSON.stringify({
            modelSlug: model.slug,
            providerSlug: model.provider.slug,
            channelId: channelIdToSave,
            realCost,
          }),
        },
      });

      // 返佣：邀请人获得一定比例
      if (user.referredById && cost > 0) {
        const rateSetting = await tx.setting.findUnique({ where: { key: "referral_rate" } });
        const rate = rateSetting ? parseFloat(rateSetting.value) : 0.1;
        const commission = Math.round(cost * rate * 10000) / 10000;
        if (commission > 0) {
          const inviter = await tx.user.findUnique({ where: { id: user.referredById } });
          if (inviter) {
            const nb = inviter.balance + commission;
            await tx.user.update({ where: { id: inviter.id }, data: { balance: nb } });
            await tx.transaction.create({
              data: {
                userId: inviter.id,
                type: "commission",
                amount: commission,
                balance: nb,
                note: `邀请返佣（来自 ${user.email}）`,
              },
            });
            await tx.commission.create({
              data: {
                userId: inviter.id,
                sourceId: user.id,
                amount: commission,
                rate,
                baseAmount: cost,
                note: `${model.name} 调用分成`,
              },
            });
          }
        }
      }
    }

    return { cost, realCost, balance: newBalance };
  });
}

export async function recharge(userId: string, amount: number, note = "模拟充值") {
  if (amount <= 0) throw new Error("金额必须大于 0");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("用户不存在");
    const newBalance = user.balance + amount;
    await tx.user.update({
      where: { id: userId },
      data: { balance: newBalance, totalRecharge: user.totalRecharge + amount },
    });
    await tx.transaction.create({
      data: {
        userId,
        type: "recharge",
        amount,
        balance: newBalance,
        note,
      },
    });
    return { balance: newBalance };
  });
}

/**
 * 管理员手动调账：amount 为正 → 加余额（走充值）；为负 → 扣余额（走退款/调账）。
 * 不允许把余额扣成负数；其他业务层并发（如消费扣费）也会走同样的 $transaction，
 * 所以用 Prisma 的 `increment` 原子更新避免先读后写的竞态。
 */
export async function adminAdjustBalance(
  userId: string,
  amount: number,
  opts: { note?: string; operatorId?: string } = {},
) {
  if (!Number.isFinite(amount) || amount === 0) throw new Error("金额必须为非零数字");
  const note = opts.note?.trim() || (amount > 0 ? "管理员充值" : "管理员调账");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, balance: true },
    });
    if (!user) throw new Error("用户不存在");
    if (amount < 0 && user.balance + amount < -1e-6) {
      throw new Error(
        `余额不足：当前 ¥${user.balance.toFixed(2)}，无法扣 ¥${Math.abs(amount).toFixed(2)}`,
      );
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        balance: { increment: amount },
        // 仅加钱才累计"累计充值"；扣款不回退该字段，方便审计
        ...(amount > 0 ? { totalRecharge: { increment: amount } } : {}),
      },
      select: { balance: true },
    });
    const newBalance = +updated.balance.toFixed(6);
    const meta = opts.operatorId ? JSON.stringify({ operatorId: opts.operatorId }) : null;
    await tx.transaction.create({
      data: {
        userId,
        type: amount > 0 ? "recharge" : "refund",
        amount,
        balance: newBalance,
        note,
        meta,
      },
    });
    return { balance: newBalance };
  });
}
