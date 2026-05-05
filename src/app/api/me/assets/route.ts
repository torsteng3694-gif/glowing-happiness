/**
 * 当前用户的跨项目资产库
 *
 *   GET /api/me/assets?type=character|scene|prop|skill
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const where: { userId: string; type?: string } = { userId: session.id };
  if (type && ["character", "scene", "prop", "skill"].includes(type)) where.type = type;

  const rows = await prisma.asset.findMany({
    where,
    orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({
    assets: rows.map((a) => ({
      ...a,
      referenceUrls: a.referenceUrls ? safeArr(a.referenceUrls) : [],
    })),
  });
}

function safeArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
