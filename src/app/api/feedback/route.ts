import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FEEDBACK_TYPES } from "@/lib/feedback";

/**
 * 控制台内部使用：用 session cookie 鉴权
 * POST /api/feedback   提交反馈
 * GET  /api/feedback   列出自己的反馈
 */
export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const type = String(body?.type || "other").toLowerCase();
  const question = String(body?.question || "").trim();
  if (!question) return NextResponse.json({ error: "请填写问题描述" }, { status: 400 });
  if (question.length > 5000) return NextResponse.json({ error: "问题描述过长（最多 5000 字）" }, { status: 400 });
  if (!FEEDBACK_TYPES.some((t) => t.value === type)) {
    return NextResponse.json({ error: "类型不合法" }, { status: 400 });
  }

  const fb = await prisma.feedback.create({
    data: {
      userId: session.id,
      type,
      question,
      endpoint: body?.endpoint ? String(body.endpoint).slice(0, 200) : null,
      contact: body?.contact ? String(body.contact).slice(0, 200) : null,
    },
  });
  return NextResponse.json({ ok: true, id: fb.id });
}

export async function GET() {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const list = await prisma.feedback.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    items: list.map((f) => ({
      id: f.id, type: f.type, endpoint: f.endpoint, question: f.question,
      status: f.status, resolution: f.resolution,
      createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
    })),
  });
}
