import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { shapeDetail } from "@/lib/model-shape";
import { getParamsOverride } from "@/lib/model-params-store";

export const runtime = "nodejs";

/** GET /v1/skills/models/{name} — 模型详情 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: { message: "invalid api key", type: "authentication_error" } },
      { status: 401 },
    );
  }

  const { name } = await params;
  if (!name) {
    return NextResponse.json({ error: { message: "name 必填" } }, { status: 400 });
  }

  const model = await prisma.model.findFirst({
    where: { slug: name, enabled: true },
    include: { provider: true },
  });
  if (!model) {
    return NextResponse.json(
      { error: { message: `模型 '${name}' 不存在`, type: "not_found" } },
      { status: 404 },
    );
  }

  const override = await getParamsOverride(model.slug);
  return NextResponse.json(shapeDetail(model, override));
}
