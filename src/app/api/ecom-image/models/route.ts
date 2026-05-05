/**
 * 电商一键出图 · 可选视觉模型列表
 *
 *   GET /api/ecom-image/models
 *
 * 返回当前用户可用的多模态聊天模型（type=chat、启用、有启用渠道、且能支持图片输入）。
 * 用于节点 01/03 的"模型选择器"下拉。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 判断一个 chat 模型是否支持视觉（多模态）。
 * - tags 含 "多模态/vision/multimodal"
 * - 或 slug 是已知支持视觉的家族（GPT-4 / GPT-5 / Claude 3+ / Gemini 1.5+ / Grok-4 等）
 */
function isVisionCapable(slug: string, tags: string | null): boolean {
  const t = (tags ?? "").toLowerCase();
  if (t.includes("多模态") || t.includes("vision") || t.includes("multimodal")) return true;
  const s = slug.toLowerCase();
  if (/^gpt-?(4|5)/i.test(s)) return true;
  if (/^claude-(opus|sonnet|haiku)-(3|4|5|6|7)/i.test(s)) return true;
  if (/^claude-(3|4|5|6|7)/i.test(s)) return true;
  if (/^gemini-/i.test(s)) return true;
  if (/^grok-?[2-9]/i.test(s)) return true;
  return false;
}

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  // 拉所有启用的 chat 模型
  const models = await prisma.model.findMany({
    where: { type: "chat", enabled: true },
    select: {
      slug: true,
      name: true,
      tags: true,
      description: true,
      contextLength: true,
      provider: { select: { slug: true, name: true } },
      channels: {
        where: { enabled: true },
        select: { id: true, sellInputPrice: true, sellOutputPrice: true },
        orderBy: { priority: "asc" },
        take: 1,
      },
    },
    orderBy: { slug: "asc" },
  });

  // 过滤：必须有可用 channel 且支持视觉
  const filtered = models
    .filter((m) => m.channels.length > 0 && isVisionCapable(m.slug, m.tags))
    .map((m) => ({
      slug: m.slug,
      name: m.name,
      provider: m.provider.name,
      tags: (m.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      description: m.description,
      contextLength: m.contextLength,
      // 估算单次调用的展示价（每 1K tokens 输入价 + 输出价）
      sellInputPrice: m.channels[0]?.sellInputPrice ?? 0,
      sellOutputPrice: m.channels[0]?.sellOutputPrice ?? 0,
    }));

  return NextResponse.json({ models: filtered });
}
