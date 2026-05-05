import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * PATCH /api/admin/feedback/:id
 * body: { status: "pending" | "resolved" | "ignored", resolution?: string }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }

  const { id } = await params;
  const fbId = parseInt(id, 10);
  if (!Number.isFinite(fbId)) return NextResponse.json({ error: "id 非法" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "").toLowerCase();
  if (!["pending", "resolved", "ignored"].includes(status)) {
    return NextResponse.json({ error: "status 非法" }, { status: 400 });
  }
  const resolution = typeof body.resolution === "string" ? body.resolution.trim().slice(0, 5000) : null;

  const fb = await prisma.feedback.findUnique({ where: { id: fbId } });
  if (!fb) return NextResponse.json({ error: "不存在" }, { status: 404 });

  const updated = await prisma.feedback.update({
    where: { id: fbId },
    data: {
      status,
      resolution: status === "pending" ? null : resolution,
      resolvedBy: status === "pending" ? null : admin.id,
      resolvedAt: status === "pending" ? null : new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    feedback: {
      id: updated.id, status: updated.status, resolution: updated.resolution,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
