import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { maskKey } from "@/lib/upstream";

export const runtime = "nodejs";

function serialize(u: { id: string; slug: string; name: string; baseUrl: string; apiKey: string; enabled: boolean; priority: number; createdAt: Date }) {
  return {
    id: u.id,
    slug: u.slug,
    name: u.name,
    baseUrl: u.baseUrl,
    maskedKey: maskKey(u.apiKey),
    hasKey: Boolean(u.apiKey),
    enabled: u.enabled,
    priority: u.priority,
    createdAt: u.createdAt,
  };
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const list = await prisma.upstream.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { channels: true } } },
  });
  return NextResponse.json({
    upstreams: list.map((u) => ({ ...serialize(u), channelCount: u._count.channels })),
  });
}

export async function POST(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const body = await req.json().catch(() => null);
  if (!body?.slug || !body?.name || !body?.baseUrl) {
    return NextResponse.json({ error: "slug / name / baseUrl 必填" }, { status: 400 });
  }
  const slug = String(body.slug).trim();
  const exists = await prisma.upstream.findUnique({ where: { slug } });
  if (exists) return NextResponse.json({ error: "slug 已存在" }, { status: 400 });
  const created = await prisma.upstream.create({
    data: {
      slug,
      name: String(body.name).trim(),
      baseUrl: String(body.baseUrl).trim().replace(/\/+$/, ""),
      apiKey: typeof body.apiKey === "string" ? body.apiKey.trim() : "",
      enabled: body.enabled !== false,
      priority: Number.isFinite(+body.priority) ? +body.priority : 100,
    },
  });
  return NextResponse.json({ upstream: serialize(created) });
}
