import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/channels/health?windowHours=24
 *
 * 返回所有启用渠道的健康指标：
 *   - totalCalls: 窗口内总调用数
 *   - successRate: 成功率（0-1）
 *   - avgLatencyMs: 平均时延
 *   - online: 近 5 分钟内是否有成功记录（或无任何记录时默认视为 online）
 */
export async function GET(req: Request) {
  try { await requireUser(); } catch {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const url = new URL(req.url);
  const windowHours = Math.min(Math.max(parseInt(url.searchParams.get("windowHours") || "24"), 1), 24 * 7);
  const since = new Date(Date.now() - windowHours * 3600_000);
  const onlineSince = new Date(Date.now() - 5 * 60_000);

  // 1) 所有启用渠道
  const channels = await prisma.channel.findMany({
    where: { enabled: true, upstream: { enabled: true } },
    select: { id: true },
  });
  if (channels.length === 0) return NextResponse.json({ health: {} });

  const channelIds = channels.map((c) => c.id);

  const [totalAgg, successAgg, latencyAgg, onlineRows] = await Promise.all([
    prisma.usage.groupBy({
      by: ["channelId"],
      where: { channelId: { in: channelIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.usage.groupBy({
      by: ["channelId"],
      where: {
        channelId: { in: channelIds },
        createdAt: { gte: since },
        status: "success",
      },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
    prisma.usage.groupBy({
      by: ["channelId"],
      where: {
        channelId: { in: channelIds },
        createdAt: { gte: since },
        latencyMs: { not: null },
      },
      _avg: { latencyMs: true },
    }),
    prisma.usage.findMany({
      where: {
        channelId: { in: channelIds },
        createdAt: { gte: onlineSince },
        status: "success",
      },
      select: { channelId: true },
      distinct: ["channelId"],
    }),
  ]);

  const totalMap = new Map(totalAgg.map((r) => [r.channelId, r._count._all]));
  const successMap = new Map(successAgg.map((r) => [r.channelId, r._count._all]));
  const latencyMap = new Map(latencyAgg.map((r) => [r.channelId, r._avg.latencyMs ?? null]));
  const onlineSet = new Set(onlineRows.map((r) => r.channelId));

  const health: Record<string, {
    totalCalls: number;
    successRate: number;
    avgLatencyMs: number | null;
    online: boolean;
  }> = {};

  for (const id of channelIds) {
    const total = totalMap.get(id) || 0;
    const succ = successMap.get(id) || 0;
    const rate = total > 0 ? succ / total : 1; // 无数据默认 100%
    health[id] = {
      totalCalls: total,
      successRate: Math.round(rate * 10000) / 10000,
      avgLatencyMs: latencyMap.get(id) ? Math.round(latencyMap.get(id)!) : null,
      // 近 5 分钟有成功记录 → 在线；否则若窗口内完全没数据也视为在线（新渠道兜底）
      online: onlineSet.has(id) || total === 0,
    };
  }

  return NextResponse.json({ windowHours, health });
}
