import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setAuthCookie, signToken, verifyPassword } from "@/lib/auth";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * 代理商后台专用登录：校验通过后仅当 role 为 agent 或 admin 时写入会话；
 * 普通用户不能使用此入口登录（避免误登入代理后台）。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = Schema.parse(body);
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 400 });
    const ok = await verifyPassword(data.password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "邮箱或密码错误" }, { status: 400 });

    if (user.role !== "agent" && user.role !== "admin") {
      return NextResponse.json(
        { error: "该账号无代理商权限，请使用用户端登录 /login" },
        { status: 403 },
      );
    }

    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    await setAuthCookie(token);
    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登录失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
