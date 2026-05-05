import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "需要管理员权限" }, { status: 403 }); }
  const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ providers });
}

export async function POST(req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "需要管理员权限" }, { status: 403 }); }

  const body = await req.json().catch(() => null) as
    | { name?: string; logo?: string; slug?: string }
    | null;
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name 必填" }, { status: 400 });
  }
  const slug = (body.slug || body.name).trim().toLowerCase().replace(/\s+/g, "-");
  const existing = await prisma.provider.findFirst({
    where: { OR: [{ name: body.name.trim() }, { slug }] },
  });
  if (existing) {
    return NextResponse.json({ id: existing.id, existed: true });
  }
  const created = await prisma.provider.create({
    data: {
      slug,
      name: body.name.trim(),
      logo: (body.logo || "🤖").trim(),
    },
  });
  return NextResponse.json({ id: created.id, existed: false });
}
