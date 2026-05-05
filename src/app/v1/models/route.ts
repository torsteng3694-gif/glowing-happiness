import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: { message: "invalid api key" } }, { status: 401 });
  const models = await prisma.model.findMany({
    where: { enabled: true },
    include: { provider: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    object: "list",
    data: models.map((m) => ({
      id: m.slug,
      object: "model",
      created: Math.floor(m.createdAt.getTime() / 1000),
      owned_by: m.provider.slug,
      type: m.type,
    })),
  });
}
