import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getParamsOverridesMany, setParamsOverride } from "@/lib/model-params-store";
import type { ParamDef } from "@/lib/model-shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/models — 管理员查看所有模型（含禁用）。包含 params 覆盖。 */
export async function GET() {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "需要管理员权限" }, { status: 403 }); }

  const [models, providers] = await Promise.all([
    prisma.model.findMany({
      include: {
        provider: true,
        _count: { select: { usages: true, tasks: true, mediaAssets: true } },
      },
      orderBy: [{ enabled: "desc" }, { type: "asc" }, { createdAt: "asc" }],
    }),
    prisma.provider.findMany({ orderBy: { name: "asc" } }),
  ]);

  const overrides = await getParamsOverridesMany(models.map((m) => m.slug));

  return NextResponse.json({
    models: models.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      type: m.type,
      providerId: m.providerId,
      provider: { id: m.provider.id, name: m.provider.name, logo: m.provider.logo },
      description: m.description || "",
      contextLength: m.contextLength,
      tags: m.tags || "",
      enabled: m.enabled,
      inputPrice: m.inputPrice,
      outputPrice: m.outputPrice,
      unitPrice: m.unitPrice,
      unit: m.unit,
      params: overrides.get(m.slug) ?? null,
      createdAt: m.createdAt,
      usageCount: m._count.usages,
      taskCount: m._count.tasks,
      mediaAssetCount: m._count.mediaAssets,
    })),
    providers: providers.map((p) => ({
      id: p.id, name: p.name, logo: p.logo,
    })),
  });
}

type Body = {
  slug?: string;
  name?: string;
  type?: string;                 // chat | image | video | audio
  providerId?: string;
  providerName?: string;         // 若不存在则自动创建 provider
  providerLogo?: string;
  description?: string;
  tags?: string;                 // 逗号分隔
  contextLength?: number | null;
  enabled?: boolean;
  inputPrice?: number;
  outputPrice?: number;
  unitPrice?: number;
  unit?: string | null;
  params?: ParamDef[] | null;    // null = 走类型模板
};

/** POST /api/admin/models — 新建模型 */
export async function POST(req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "需要管理员权限" }, { status: 403 }); }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "请求体无效" }, { status: 400 });

  const slug = (body.slug || "").trim();
  const name = (body.name || "").trim();
  const type = (body.type || "").trim();

  if (!slug) return NextResponse.json({ error: "slug 必填" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name 必填" }, { status: 400 });
  if (!["chat", "image", "video", "audio", "embedding"].includes(type)) {
    return NextResponse.json({ error: "type 必须是 chat/image/video/audio/embedding 其中一种" }, { status: 400 });
  }

  const dup = await prisma.model.findUnique({ where: { slug } });
  if (dup) return NextResponse.json({ error: `slug '${slug}' 已存在` }, { status: 409 });

  // 解析 / 创建 provider
  let providerId = body.providerId?.trim() || "";
  if (!providerId) {
    const pname = (body.providerName || "").trim() || "自定义";
    const plogo = (body.providerLogo || "").trim() || "🤖";
    const existing = await prisma.provider.findFirst({ where: { name: pname } });
    if (existing) providerId = existing.id;
    else {
      const pslug = pname.toLowerCase().replace(/\s+/g, "-");
      // 避免 slug 冲突
      let finalSlug = pslug;
      for (let i = 1; await prisma.provider.findUnique({ where: { slug: finalSlug } }); i++) {
        finalSlug = `${pslug}-${i}`;
        if (i > 20) break;
      }
      const created = await prisma.provider.create({
        data: { slug: finalSlug, name: pname, logo: plogo },
      });
      providerId = created.id;
    }
  } else {
    const p = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!p) return NextResponse.json({ error: "providerId 无效" }, { status: 400 });
  }

  const model = await prisma.model.create({
    data: {
      slug, name, type, providerId,
      description: body.description?.trim() || null,
      tags: body.tags?.trim() || null,
      contextLength: body.contextLength ?? null,
      enabled: body.enabled ?? true,
      inputPrice: Number(body.inputPrice ?? 0),
      outputPrice: Number(body.outputPrice ?? 0),
      unitPrice: Number(body.unitPrice ?? 0),
      unit: body.unit ?? (type === "chat" ? "1K tokens" : type === "video" ? "second" : type === "image" ? "image" : null),
    },
  });

  // 参数覆盖：显式传 null 或数组时写入；undefined 不操作
  if (body.params !== undefined) {
    await setParamsOverride(slug, body.params);
  }

  return NextResponse.json({ id: model.id, slug: model.slug }, { status: 201 });
}
