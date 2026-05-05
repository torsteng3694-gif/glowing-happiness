import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 已迁移到 Go 后端：
 *   GET  /api/go/v2/keys/:id/bindings
 *   PUT  /api/go/v2/keys/:id/bindings
 */
const MIGRATED = {
  error: "该接口已迁移到 Go 后端，请改用 /api/go/v2/keys/:id/bindings",
  code: "MIGRATED_TO_GO",
};

export async function GET() {
  return NextResponse.json(MIGRATED, { status: 410 });
}

export async function PUT() {
  return NextResponse.json(MIGRATED, { status: 410 });
}
