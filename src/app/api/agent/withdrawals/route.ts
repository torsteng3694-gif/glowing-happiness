import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryAgentWithdrawals, type WithdrawalPeriod } from "@/lib/agent-withdrawals-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PERIODS = new Set(["today", "yesterday", "week", "month", "all"]);

/**
 * GET /api/agent/withdrawals?period=all|today|...&page=1&limit=20
 * 当前登录用户作为代理商时的提现明细
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (session.role !== "agent" && session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const url = new URL(req.url);
  const rawPeriod = url.searchParams.get("period") || "all";
  const period = (PERIODS.has(rawPeriod) ? rawPeriod : "all") as WithdrawalPeriod;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));

  try {
    const data = await queryAgentWithdrawals({
      agentUserId: session.id,
      period,
      page,
      limit,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/agent/withdrawals]", e);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}
