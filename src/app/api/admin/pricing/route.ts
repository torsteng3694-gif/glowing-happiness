import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const KEYS = ["min_profit_rate_chat", "min_profit_rate_image", "min_profit_rate_video"] as const;

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const rows = await prisma.setting.findMany({ where: { key: { in: KEYS as unknown as string[] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({
    minProfitRateChat: parseFloat(map.get("min_profit_rate_chat") || "0.2"),
    minProfitRateImage: parseFloat(map.get("min_profit_rate_image") || "0.2"),
    minProfitRateVideo: parseFloat(map.get("min_profit_rate_video") || "0.2"),
  });
}

export async function POST(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const body = await req.json().catch(() => ({}));
  const pairs: [string, number | undefined][] = [
    ["min_profit_rate_chat", body.minProfitRateChat],
    ["min_profit_rate_image", body.minProfitRateImage],
    ["min_profit_rate_video", body.minProfitRateVideo],
  ];
  for (const [k, v] of pairs) {
    if (v === undefined) continue;
    if (!Number.isFinite(+v) || +v < 0) {
      return NextResponse.json({ error: `${k} 必须 >= 0` }, { status: 400 });
    }
    await prisma.setting.upsert({
      where: { key: k },
      update: { value: String(+v) },
      create: { key: k, value: String(+v) },
    });
  }
  return NextResponse.json({ ok: true });
}

/** 批量调价：sell = cost * (1 + markup) */
export async function PUT(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const body = await req.json().catch(() => ({}));
  const markup = parseFloat(body.markup);
  const scope = typeof body.scope === "string" ? body.scope : "all"; // all | chat | image | video
  if (!Number.isFinite(markup) || markup < 0) {
    return NextResponse.json({ error: "markup 非法（需要 >= 0 的数字）" }, { status: 400 });
  }

  const where: any = {};
  if (scope !== "all") {
    where.model = { type: scope };
  }
  const channels = await prisma.channel.findMany({
    where,
    include: { model: { select: { type: true } } },
  });

  const factor = 1 + markup;
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  let updated = 0;
  for (const c of channels) {
    const newData = {
      sellInputPrice: round4(c.costInputPrice * factor),
      sellOutputPrice: round4(c.costOutputPrice * factor),
      sellUnitPrice: round4(c.costUnitPrice * factor),
    };
    await prisma.channel.update({ where: { id: c.id }, data: newData });
    updated++;
  }
  return NextResponse.json({ ok: true, updated, factor });
}
