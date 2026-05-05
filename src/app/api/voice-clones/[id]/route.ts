/**
 * DELETE /api/voice-clones/{id}
 * 删除自己创建的音色记录（本地软删除：仅删 VoiceClone 行；上游 Vidu 侧 7 天内未激活会自动销毁）。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const v = await prisma.voiceClone.findUnique({ where: { id } });
  if (!v) return NextResponse.json({ error: "音色不存在" }, { status: 404 });
  if (v.userId !== session.id) {
    return NextResponse.json({ error: "无权删除该音色" }, { status: 403 });
  }
  await prisma.voiceClone.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
