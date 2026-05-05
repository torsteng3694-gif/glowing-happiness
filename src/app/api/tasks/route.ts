import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ⚠️ 已废弃
 * Phase 4 起，/api/tasks 已迁移到 Go 后端 /v2/tasks（通过 /api/go/v2/tasks 代理访问）。
 * 前端已切到新路径，这里仅保留 410 Gone 用于提示调用方。
 */
export async function GET() {
  return NextResponse.json(
    {
      error: "Gone",
      message:
        "该接口已迁移。请改用 GET /api/go/v2/tasks（内部）或 GET /v1/media/status?id=xxx（外部）。",
    },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Gone",
      message:
        "该接口已迁移。请改用 POST /api/go/v2/tasks（内部）或 POST /v1/media/generate（外部，OpenAI 兼容）。",
    },
    { status: 410 },
  );
}
