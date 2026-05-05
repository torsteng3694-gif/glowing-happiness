import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/** 收藏 / 取消收藏 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }
  const { id } = await ctx.params;

  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.deletedAt) {
    return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  }
  if (asset.userId !== session.id) {
    return NextResponse.json({ error: "无权操作他人作品" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const favorite = typeof body.favorite === "boolean" ? body.favorite : !asset.favorite;

  const updated = await prisma.mediaAsset.update({
    where: { id }, data: { favorite },
  });
  return NextResponse.json({ ok: true, favorite: updated.favorite });
}

/** 软删除 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }
  const { id } = await ctx.params;

  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.deletedAt) {
    return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  }
  if (asset.userId !== session.id) {
    return NextResponse.json({ error: "无权操作他人作品" }, { status: 403 });
  }

  await prisma.mediaAsset.update({
    where: { id }, data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
