import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/apikeys?q=xxx
 * 列出所有 API Key（可按 用户邮箱 / key 名称 搜索）
 */
export async function GET(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { keyPrefix: { contains: q } },
      { user: { email: { contains: q } } },
    ];
  }

  const keys = await prisma.apiKey.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { bindings: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopeMode: k.scopeMode,
      bindingCount: k._count.bindings,
      lastUsedAt: k.lastUsedAt?.toISOString() || null,
      revokedAt: k.revokedAt?.toISOString() || null,
      createdAt: k.createdAt.toISOString(),
      user: k.user,
    })),
  });
}
