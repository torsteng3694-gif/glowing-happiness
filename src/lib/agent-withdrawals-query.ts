import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getPeriodBounds, type AgentPeriod } from "./agent-dashboard";

export type WithdrawalPeriod = AgentPeriod | "all";

export async function queryAgentWithdrawals(opts: {
  agentUserId: string;
  period: WithdrawalPeriod;
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

  const where: Prisma.WithdrawalWhereInput = {
    userId: agentUserId,
    ...(range.start && range.end ? { requestedAt: { gte: range.start, lte: range.end } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.withdrawal.count({ where }),
    prisma.withdrawal.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page: Math.max(1, page),
    limit,
    items: rows.map((r) => ({
      id: r.id,
      method: r.method,
      accountMask: r.accountMask,
      amount: r.amount,
      status: r.status,
      requestedAt: r.requestedAt.toISOString(),
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    })),
  };
}
