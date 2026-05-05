import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, setAuthCookie, signToken } from "@/lib/auth";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "密码至少 6 位"),
  name: z.string().optional(),
  referralCode: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = Schema.parse(body);
    const user = await createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      name: data.name,
      referralCode: data.referralCode?.toUpperCase() || undefined,
    });
    const token = await signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    await setAuthCookie(token);
    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "注册失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
