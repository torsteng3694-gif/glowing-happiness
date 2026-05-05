import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { OFFICIAL_PERSONAS } from "@/lib/personas";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(40, "名称过长"),
  description: z.string().trim().max(200, "描述过长").optional().default(""),
  avatar: z.string().trim().max(8, "头像仅支持 1-2 个字符或 emoji").optional().default("🤖"),
  systemPrompt: z.string().trim().min(1, "角色设定不能为空").max(4000, "角色设定过长"),
});

/** GET /api/chat-personas — 返回 { official, mine } */
export async function GET() {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const mine = await prisma.chatPersona.findMany({
    where: { userId: session.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      systemPrompt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    official: OFFICIAL_PERSONAS,
    mine,
  });
}

/** POST /api/chat-personas — 创建自建角色 */
export async function POST(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "参数错误" },
      { status: 400 },
    );
  }

  const count = await prisma.chatPersona.count({ where: { userId: session.id } });
  if (count >= 50) {
    return NextResponse.json({ error: "自建角色数量已达上限（50）" }, { status: 400 });
  }

  const created = await prisma.chatPersona.create({
    data: {
      userId: session.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      avatar: parsed.data.avatar || "🤖",
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

  return NextResponse.json({ persona: created });
}
