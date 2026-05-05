import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateApiKey, hashApiKey, requireUser } from "@/lib/auth";

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "默认").slice(0, 50);
  const { key, prefix } = generateApiKey();
  const keyHash = await hashApiKey(key);
  const created = await prisma.apiKey.create({
    data: { userId: session.id, name, keyPrefix: prefix, keyHash },
  });
  return NextResponse.json({
    fullKey: key,
    key: {
      id: created.id, name: created.name, keyPrefix: created.keyPrefix,
      lastUsedAt: null, revokedAt: null, createdAt: created.createdAt.toISOString(),
    },
  });
}
