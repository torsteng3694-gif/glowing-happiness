import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { toStatusShape } from "@/lib/task-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /v1/media/tasks?limit=20&type=image|video|audio|music&group=waiting|processing|completed|failed
 */
export async function GET(req: Request) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json({ error: { message: "invalid api key" } }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 100);
  const type = url.searchParams.get("type");
  const where: any = { userId: user.id };
  if (type) where.type = type;

  const tasks = await prisma.task.findMany({
    where, orderBy: { createdAt: "desc" }, take: limit,
  });
  return NextResponse.json({
    object: "list",
    data: tasks.map(toStatusShape),
  });
}
