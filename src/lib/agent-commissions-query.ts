import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getPeriodBounds, type AgentPeriod } from "./agent-dashboard";

export type CommissionPeriod = AgentPeriod | "all";

export async function queryAgentCommissions(opts: {
  agentUserId: string;
  period: CommissionPeriod;
  page: number;
  limit: number;
}) {
  const { agentUserId, period, page, limit } = opts;
  const skip = (Math.max(1, page) - 1) * limit;

  let range: { start?: Date; end?: Date } = {};
  if (period !== "all") {
    const b = getPeriodBounds(period as AgentPeriod);
    range = { start: b.start, end: b.end };
  }

  const where: Prisma.CommissionWhereInput = {
    userId: agentUserId,
    ...(range.start && range.end ? { createdAt: { gte: range.start, lte: range.end } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.commission.count({ where }),
    prisma.commission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        source: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
    }),
  ]);

  return {
    total,
    page: Math.max(1, page),
    limit,
    items: rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      rate: r.rate,
      baseAmount: r.baseAmount,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      source: {
        id: r.source.id,
        email: r.source.email,
        name: r.source.name,
        avatarUrl: r.source.avatarUrl,
      },
    })),
  };
}
