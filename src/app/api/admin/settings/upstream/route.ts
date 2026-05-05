import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getUpstream, setUpstream, maskKey } from "@/lib/upstream";

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const u = await getUpstream();
  if (!u) {
    return NextResponse.json({
      configured: false,
      baseUrl: process.env.UPSTREAM_BASE_URL || "https://api.ai6700.com",
      maskedKey: "",
      enabled: false,
    });
  }
  return NextResponse.json({
    configured: true,
    baseUrl: u.baseUrl,
    maskedKey: maskKey(u.apiKey),
    enabled: u.enabled,
  });
}

export async function POST(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const body = await req.json().catch(() => ({}));

  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : undefined;
  // 留空表示不修改；传字符串表示更新（可含 sk-... 或清空）
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : undefined;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;

  if (baseUrl === undefined && apiKey === undefined && enabled === undefined) {
    return NextResponse.json({ error: "未提供任何更新字段" }, { status: 400 });
  }

  await setUpstream({ baseUrl, apiKey, enabled });

  const u = await getUpstream();
  return NextResponse.json({
    ok: true,
    configured: !!u,
    baseUrl: u?.baseUrl || baseUrl || "",
    maskedKey: u ? maskKey(u.apiKey) : "",
    enabled: u?.enabled ?? false,
  });
}

/** 测试当前上游配置的连通性（发一个很短的 chat 请求） */
export async function PUT() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const u = await getUpstream();
  if (!u) return NextResponse.json({ ok: false, error: "未配置上游" }, { status: 400 });

  try {
    const res = await fetch(`${u.baseUrl}/v1/skills/guide`, {
      headers: { Authorization: `Bearer ${u.apiKey}` },
    });
    const bodyText = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      baseUrl: u.baseUrl,
      sample: bodyText.slice(0, 400),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
