import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/admin/apikeys/:id  返回 Key 详情 + 渠道绑定（只读） */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const { id } = await params;

  const key = await prisma.apiKey.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      bindings: {
        include: {
          channel: {
            include: {
              model: { select: { id: true, slug: true, name: true, type: true } },
              upstream: { select: { id: true, slug: true, name: true } },
            },
          },
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!key) return NextResponse.json({ error: "不存在" }, { status: 404 });

  return NextResponse.json({
    key: {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopeMode: key.scopeMode,
      lastUsedAt: key.lastUsedAt?.toISOString() || null,
      revokedAt: key.revokedAt?.toISOString() || null,
      createdAt: key.createdAt.toISOString(),
      user: key.user,
    },
    bindings: key.bindings.map((b) => ({
      channelId: b.channelId,
      order: b.order,
      channel: {
        id: b.channel.id,
        name: b.channel.name,
        tier: b.channel.tier,
        enabled: b.channel.enabled,
        sellInputPrice: b.channel.sellInputPrice,
        sellOutputPrice: b.channel.sellOutputPrice,
        sellUnitPrice: b.channel.sellUnitPrice,
        model: b.channel.model,
        upstream: b.channel.upstream,
      },
    })),
  });
}
