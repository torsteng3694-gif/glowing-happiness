import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { clearParamsOverride, setParamsOverride } from "@/lib/model-params-store";
import type { ParamDef } from "@/lib/model-shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  name?: string;
  type?: string;
  providerId?: string;
  description?: string | null;
  tags?: string | null;
  contextLength?: number | null;
  enabled?: boolean;
  inputPrice?: number;
  outputPrice?: number;
  unitPrice?: number;
  unit?: string | null;
  params?: ParamDef[] | null;   // null = 清除覆盖回到默认模板
};

/** PATCH /api/admin/models/[id] — 编辑模型（slug 不可修改） */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "需要管理员权限" }, { status: 403 }); }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "请求体无效" }, { status: 400 });

  const existing = await prisma.model.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "模型不存在" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.type !== undefined) {
    if (!["chat", "image", "video", "audio", "embedding"].includes(body.type)) {
      return NextResponse.json({ error: "type 无效" }, { status: 400 });
    }
    data.type = body.type;
  }
  if (body.providerId !== undefined) {
    const p = await prisma.provider.findUnique({ where: { id: body.providerId } });
    if (!p) return NextResponse.json({ error: "providerId 无效" }, { status: 400 });
    data.providerId = body.providerId;
  }
  if (body.description !== undefined) data.description = body.description || null;
  if (body.tags !== undefined) data.tags = body.tags || null;
  if (body.contextLength !== undefined) data.contextLength = body.contextLength;
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.inputPrice !== undefined) data.inputPrice = Number(body.inputPrice) || 0;
  if (body.outputPrice !== undefined) data.outputPrice = Number(body.outputPrice) || 0;
  if (body.unitPrice !== undefined) data.unitPrice = Number(body.unitPrice) || 0;
  if (body.unit !== undefined) data.unit = body.unit;

  await prisma.model.update({ where: { id }, data });

  if (body.params !== undefined) {
    if (body.params === null) await clearParamsOverride(existing.slug);
    else await setParamsOverride(existing.slug, body.params);
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/models/[id]?mode=soft|hard
 *   soft（默认）→ 只把 enabled 置为 false，并清除参数覆盖（保留用户作品/账单关联）
 *   hard        → 物理删除；会切断 Task/MediaAsset 的关联（置 null），
 *                 并保留 Usage 作为历史记录前先解除 FK（但 Usage.modelId 为必填，
 *                 因此 hard 模式下只有 usageCount=0 的模型才允许物理删除）
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "需要管理员权限" }, { status: 403 }); }

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "soft";

  const model = await prisma.model.findUnique({
    where: { id },
    include: { _count: { select: { usages: true, tasks: true, mediaAssets: true } } },
  });
  if (!model) return NextResponse.json({ error: "模型不存在" }, { status: 404 });

  if (mode === "hard") {
    if (model._count.usages > 0) {
      return NextResponse.json({
        error: `该模型存在 ${model._count.usages} 条历史使用记录，无法物理删除。请使用软删除（禁用）。`,
      }, { status: 409 });
    }
    await prisma.$transaction([
      prisma.task.updateMany({ where: { modelId: id }, data: { modelId: null } }),
      prisma.mediaAsset.updateMany({ where: { modelId: id }, data: { modelId: null } }),
      prisma.model.delete({ where: { id } }),
    ]);
    await clearParamsOverride(model.slug);
    return NextResponse.json({ ok: true, mode: "hard" });
  }

  // soft
  await prisma.model.update({ where: { id }, data: { enabled: false } });
  await clearParamsOverride(model.slug);
  return NextResponse.json({ ok: true, mode: "soft" });
}
