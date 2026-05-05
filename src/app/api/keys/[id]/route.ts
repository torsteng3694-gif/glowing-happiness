import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }
  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== session.id) return NextResponse.json({ error: "不存在" }, { status: 404 });
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
