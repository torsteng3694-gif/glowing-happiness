import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/channels/tree
 * 返回所有启用模型及其启用渠道（供 API Key 绑定面板使用）
 */
export async function GET() {
  try { await requireUser(); } catch {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const models = await prisma.model.findMany({
    where: { enabled: true },
    include: {
      provider: { select: { slug: true, name: true, logo: true } },
      channels: {
        where: { enabled: true, upstream: { enabled: true } },
        include: { upstream: { select: { id: true, slug: true, name: true } } },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    models: models
      .filter((m) => m.channels.length > 0)
      .map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        type: m.type,
        provider: m.provider,
        channels: m.channels.map((c) => ({
          id: c.id,
          name: c.name,
          tier: c.tier,
          priority: c.priority,
          sellInputPrice: c.sellInputPrice,
          sellOutputPrice: c.sellOutputPrice,
          sellUnitPrice: c.sellUnitPrice,
          upstream: c.upstream,
        })),
      })),
  });
}
