import { prisma } from "./db";

export type AgentPeriod = "today" | "yesterday" | "week" | "month";

export function getPeriodBounds(period: AgentPeriod, now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const e = new Date(start);
    e.setHours(23, 59, 59, 999);
    return { start, end: e };
  }
  if (period === "week") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  // month
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export async function getAgentReferralUserIds(agentId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { referredById: agentId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * 代理商看板：佣金来自 Commission，下级消费来自 referred 用户的 Usage
 */
export async function buildAgentOverview(agentId: string, period: AgentPeriod) {
  const { start, end } = getPeriodBounds(period);
  const refIds = await getAgentReferralUserIds(agentId);
  const monthStart = (() => {
    const m = new Date();
    m.setDate(1);
    m.setHours(0, 0, 0, 0);
    return m;
  })();
  const { start: dayStart } = getPeriodBounds("today", new Date());
  const tomorrow = new Date(dayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [totalSum, monthCom, todayCom, periodCom] = await Promise.all([
    prisma.commission.aggregate({
      where: { userId: agentId },
      _sum: { amount: true },
    }),
    prisma.commission.aggregate({
      where: { userId: agentId, createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.commission.aggregate({
      where: { userId: agentId, createdAt: { gte: dayStart, lt: tomorrow } },
      _sum: { amount: true },
    }),
    prisma.commission.aggregate({
      where: { userId: agentId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const totalIncome = totalSum._sum.amount || 0;
  const monthIncome = monthCom._sum.amount || 0;
  const todayIncome = todayCom._sum.amount || 0;
  const withdrawable = monthIncome;

  if (refIds.length === 0) {
    return {
      period,
      range: { start: start.toISOString(), end: end.toISOString() },
      summary: {
        totalIncome,
        monthIncome,
        todayIncome,
        withdrawable,
      },
      operating: { profitYuan: periodCom._sum.amount || 0, salesYuan: 0, activeUsers: 0 },
      funnel: { registered: 0, recharged: 0, active: 0, rechargeConversion: 0, activeConversion: 0 },
      topUsers: [] as { id: string; name: string | null; email: string; amount: number }[],
      topModels: [] as { name: string; amount: number }[],
    };
  }

  const [periodUsageAgg, regCount, activeDistinct] = await Promise.all([
    prisma.usage.aggregate({
      where: { userId: { in: refIds }, createdAt: { gte: start, lte: end } },
      _sum: { cost: true },
    }),
    prisma.user.count({
      where: { referredById: agentId, createdAt: { gte: start, lte: end } },
    }),
    prisma.usage.findMany({
      where: { userId: { in: refIds }, createdAt: { gte: start, lte: end } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const salesYuan = periodUsageAgg._sum.cost || 0;
  const profitYuan = periodCom._sum.amount || 0;
  const activeUsers = activeDistinct.length;

  const rechargeRows = await prisma.transaction.findMany({
    where: {
      userId: { in: refIds },
      type: "recharge",
      amount: { gt: 0 },
      createdAt: { gte: start, lte: end },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const recharged = rechargeRows.length;

  const rechargeConversion = regCount > 0 ? (recharged / regCount) * 100 : 0;
  const activeConversion = regCount > 0 ? (activeDistinct.length / regCount) * 100 : 0;

  const topUsage = await prisma.usage.groupBy({
    by: ["userId"],
    where: { userId: { in: refIds }, createdAt: { gte: start, lte: end } },
    _sum: { cost: true },
    orderBy: { _sum: { cost: "desc" } },
    take: 10,
  });
  const userIds = topUsage.map((t) => t.userId);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const umap = new Map(users.map((u) => [u.id, u]));
  const topUsers = topUsage.map((t) => {
    const u = umap.get(t.userId);
    return {
      id: t.userId,
      name: u?.name ?? null,
      email: u?.email || "",
      amount: t._sum.cost || 0,
    };
  });

  const topMod = await prisma.usage.groupBy({
    by: ["modelId"],
    where: { userId: { in: refIds }, createdAt: { gte: start, lte: end } },
    _sum: { cost: true },
    orderBy: { _sum: { cost: "desc" } },
    take: 10,
  });
  const mids = topMod.map((m) => m.modelId);
  const models = mids.length
    ? await prisma.model.findMany({ where: { id: { in: mids } }, select: { id: true, name: true, slug: true } })
    : [];
  const mmap = new Map(models.map((m) => [m.id, m]));
  const topModels = topMod.map((row) => ({
    name: mmap.get(row.modelId)?.name || mmap.get(row.modelId)?.slug || row.modelId.slice(0, 8),
    amount: row._sum.cost || 0,
  }));

  return {
    period,
    range: { start: start.toISOString(), end: end.toISOString() },
    summary: {
      totalIncome,
      monthIncome,
      todayIncome,
      withdrawable,
    },
    operating: {
      profitYuan,
      salesYuan,
      activeUsers,
    },
    funnel: {
      registered: regCount,
      recharged,
      active: activeDistinct.length,
      rechargeConversion: Math.round(rechargeConversion * 100) / 100,
      activeConversion: Math.round(activeConversion * 100) / 100,
    },
    topUsers,
    topModels,
  };
}
