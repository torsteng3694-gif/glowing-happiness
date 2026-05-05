import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 已迁移到 Go 后端：POST /api/go/v2/admin/users/:id/adjust
 *
 * 这里保留一个 410 Gone 占位，专门给可能遗漏没改的脚本/老版页面一个明确错误，
 * 避免"走到旧代码 + 老 SQLite 行为"和"走到新 Go 后端"并存导致脏数据。
 *
 * 双写时期的迁移规则：
 *   - 任何金融相关接口迁移到 Go 后，Next.js 侧必须改成 410，不能留双路径。
 *   - 只读查询可以保留 Next.js 版本作为回退（因为读同一个 Postgres）。
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "该接口已迁移到 Go 后端，请改用 /api/go/v2/admin/users/:id/adjust",
      code: "MIGRATED_TO_GO",
    },
    { status: 410 },
  );
}
