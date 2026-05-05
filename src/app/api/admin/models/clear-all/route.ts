import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { clearAllParamsOverrides } from "@/lib/model-params-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/models/clear-all
 * Body: { mode?: "soft" | "hard" }     默认 soft
 *   soft → 把所有模型 enabled 置为 false（用户端不可见），并清除所有参数覆盖
 *   hard → 物理删除：切断 Task/MediaAsset 关联；如果有任何 Usage 记录则拒绝，
 *         因为 Usage.modelId 是必填字段，物理删除会丢失账单依据。
 */
export async function POST(req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "需要管理员权限" }, { status: 403 }); }

  const body = await req.json().catch(() => ({})) as { mode?: string };
  const mode = body.mode === "hard" ? "hard" : "soft";

  if (mode === "hard") {
    const usageCount = await prisma.usage.count();
    if (usageCount > 0) {
      return NextResponse.json({
        error: `存在 ${usageCount} 条历史使用记录，无法整体物理删除模型。请先使用软删除（禁用），或清空 Usage 表后再操作。`,
      }, { status: 409 });
    }
    await prisma.$transaction([
      prisma.task.updateMany({ data: { modelId: null } }),
      prisma.mediaAsset.updateMany({ data: { modelId: null } }),
      prisma.model.deleteMany({}),
    ]);
    await clearAllParamsOverrides();
    return NextResponse.json({ ok: true, mode: "hard", deleted: "all" });
  }

  const r = await prisma.model.updateMany({ data: { enabled: false } });
  await clearAllParamsOverrides();
  return NextResponse.json({ ok: true, mode: "soft", disabled: r.count });
}
