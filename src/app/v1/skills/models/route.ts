import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import {
  resolveType,
  filterModelsForList,
  shapeListItem,
} from "@/lib/model-shape";

export const runtime = "nodejs";

/**
 * GET /v1/skills/models
 * 按类型查询平台所有可用模型。
 * - 不传 type 返回全部
 * - type=chat  只返回 gpt/o1/o3/chatgpt/claude/gemini 前缀；额外返回 api_format、api_endpoint
 * - type=image/video/audio/tts/music 返回对应类型的媒体模型
 */
export async function GET(req: Request) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: { message: "invalid api key", type: "authentication_error" } },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const resolved = resolveType(typeParam);
  if (!resolved) {
    return NextResponse.json(
      { error: { message: "type 参数非法（chat/image/video/audio/tts/music）" } },
      { status: 400 },
    );
  }

  const all = await prisma.model.findMany({
    where: { enabled: true },
    include: { provider: true },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });

  const filtered = filterModelsForList(all, resolved);
  const items = filtered.map(shapeListItem);

  return NextResponse.json({
    type: resolved.label,
    total: items.length,
    models: items,
  });
}
