import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  avatar: z.string().trim().max(8).optional(),
  systemPrompt: z.string().trim().min(1).max(4000).optional(),
});

async function ensureOwner(id: string, userId: string) {
  const p = await prisma.chatPersona.findUnique({ where: { id } });
  if (!p || p.userId !== userId) return null;
  return p;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const owned = await ensureOwner(id, session.id);
  if (!owned) return NextResponse.json({ error: "角色不存在" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "参数错误" },
      { status: 400 },
    );
  }

  const updated = await prisma.chatPersona.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      avatar: parsed.data.avatar,
      systemPrompt: parsed.data.systemPrompt,
    },
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      systemPrompt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ persona: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const owned = await ensureOwner(id, session.id);
  if (!owned) return NextResponse.json({ error: "角色不存在" }, { status: 404 });

  await prisma.chatPersona.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
