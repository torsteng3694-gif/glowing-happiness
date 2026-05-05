import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildAgentOverview, type AgentPeriod } from "@/lib/agent-dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PERIODS: AgentPeriod[] = ["today", "yesterday", "week", "month"];

function isPeriod(s: string | null): s is AgentPeriod {
  return s !== null && (PERIODS as string[]).includes(s);
}

/**
 * GET /api/agent/overview?period=today|yesterday|week|month
 * 代理商仪表盘数据（佣金 + 下级消费）
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (session.role !== "agent" && session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const url = new URL(req.url);
  const p = url.searchParams.get("period");
  const period: AgentPeriod = isPeriod(p) ? p : "today";

  try {
    const data = await buildAgentOverview(session.id, period);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/agent/overview]", e);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}
