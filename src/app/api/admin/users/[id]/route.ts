import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RoleSchema = z.object({
  role: z.enum(["user", "admin", "agent"]),
});

/**
 * PATCH /api/admin/users/{id}
 *  body: { role: "user" | "admin" | "agent" } — 设置用户角色（含设为用户 / 管理员 / 代理商）
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id 非法" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: z.infer<typeof RoleSchema>;
  try {
    const raw = await req.json();
    body = RoleSchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "body 需为 { role: user|admin|agent }" }, { status: 400 });
  }

  if (session.id === id && body.role !== "admin") {
    return NextResponse.json(
      { error: "不能自行将本人改为非管理员，请让其他管理员操作" },
      { status: 400 },
    );
  }

  const exists = await prisma.user.findUnique({ where: { id } });
  if (!exists) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id },
    data: { role: body.role },
  });

  return NextResponse.json({ ok: true, role: body.role });
}
