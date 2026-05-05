import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest, extractApiKey } from "@/lib/auth";
import { FEEDBACK_TYPES, toPublicShape } from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /v1/skills/feedback?id=24
 * 查询单条反馈的处理结果。
 *
 * 鉴权：Authorization: Bearer | x-api-key | x-goog-api-key | ?key=
 * 响应：与 ai6700.com 文档格式保持一致
 */
export async function GET(req: Request) {
  if (!extractApiKey(req)) {
    return NextResponse.json(
      { error: { message: "missing api key", code: "unauthorized" } },
      { status: 401 },
    );
  }
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: { message: "invalid api key", code: "unauthorized" } },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const idRaw = url.searchParams.get("id");
  if (!idRaw) {
    return NextResponse.json(
      { error: { message: "missing required parameter: id", code: "invalid_request" } },
      { status: 400 },
    );
  }
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json(
      { error: { message: "invalid id", code: "invalid_request" } },
      { status: 400 },
    );
  }

  const fb = await prisma.feedback.findUnique({ where: { id } });
  if (!fb) {
    return NextResponse.json(
      { error: { message: `feedback ${id} not found`, code: "not_found" } },
      { status: 404 },
    );
  }
  if (fb.userId !== user.id) {
    return NextResponse.json(
      { error: { message: "you can only view your own feedbacks", code: "forbidden" } },
      { status: 403 },
    );
  }

  return NextResponse.json(toPublicShape(fb));
}

/**
 * POST /v1/skills/feedback
 * 提交一条反馈。
 *
 * Body:
 *   {
 *     "type": "bug" | "feature" | "quality" | "other",
 *     "question": "问题描述",
 *     "endpoint": "/v1/chat/completions",   // 可选
 *     "contact": "email/qq/tg"              // 可选
 *   }
 */
export async function POST(req: Request) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: { message: "invalid api key", code: "unauthorized" } },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const type = String(body?.type || "other").toLowerCase();
  const question = String(body?.question || "").trim();
  if (!question) {
    return NextResponse.json(
      { error: { message: "question is required", code: "invalid_request" } },
      { status: 400 },
    );
  }
  if (question.length > 5000) {
    return NextResponse.json(
      { error: { message: "question too long (max 5000 chars)", code: "invalid_request" } },
      { status: 400 },
    );
  }
  if (!FEEDBACK_TYPES.some((t) => t.value === type)) {
    return NextResponse.json(
      { error: { message: `invalid type, allowed: ${FEEDBACK_TYPES.map((t) => t.value).join("|")}`, code: "invalid_request" } },
      { status: 400 },
    );
  }

  const fb = await prisma.feedback.create({
    data: {
      userId: user.id,
      type,
      question,
      endpoint: body?.endpoint ? String(body.endpoint).slice(0, 200) : null,
      contact: body?.contact ? String(body.contact).slice(0, 200) : null,
      meta: body?.meta ? JSON.stringify(body.meta).slice(0, 4000) : null,
    },
  });

  return NextResponse.json(toPublicShape(fb), { status: 201 });
}
