import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { maskKey } from "@/lib/upstream";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const { id } = await ctx.params;
  const existing = await prisma.upstream.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "上游不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.baseUrl === "string") data.baseUrl = body.baseUrl.trim().replace(/\/+$/, "");
  if (typeof body.apiKey === "string" && body.apiKey.trim()) data.apiKey = body.apiKey.trim();
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (Number.isFinite(+body.priority)) data.priority = +body.priority;

  const updated = await prisma.upstream.update({ where: { id }, data });
  return NextResponse.json({
    upstream: {
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      baseUrl: updated.baseUrl,
      maskedKey: maskKey(updated.apiKey),
      hasKey: Boolean(updated.apiKey),
      enabled: updated.enabled,
      priority: updated.priority,
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const { id } = await ctx.params;
  const channelCount = await prisma.channel.count({ where: { upstreamId: id } });
  if (channelCount > 0) {
    return NextResponse.json(
      { error: `该上游还被 ${channelCount} 条渠道引用，请先删除或迁移相关渠道` },
      { status: 400 },
    );
  }
  // 禁止删除最后一个 default
  const up = await prisma.upstream.findUnique({ where: { id } });
  if (up?.slug === "default") {
    return NextResponse.json({ error: "默认上游不可删除（可停用）" }, { status: 400 });
  }
  await prisma.upstream.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/**
 * 测试连通性。
 *
 * 不同上游的探测协议不一样：
 *   - Vidu (api.vidu.cn / api.vidu.com)：没有 OpenAI 兼容接口，
 *     用 POST /ent/v1/explain-comic/tasks 故意发一个最小 body，期望拿到 4xx 业务错误（说明鉴权/路由通），
 *     如果返回 401/403 就是 Token 错，连接失败就是 baseUrl 错。
 *   - 其他（OpenAI 兼容聚合商如 ai6700）：按惯例 ping /v1/models / /v1/skills/guide。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "无权限" }, { status: 403 }); }
  const { id } = await ctx.params;
  const u = await prisma.upstream.findUnique({ where: { id } });
  if (!u) return NextResponse.json({ error: "上游不存在" }, { status: 404 });
  if (!u.apiKey) return NextResponse.json({ ok: false, error: "未配置 API Key" }, { status: 400 });

  const rawBase = u.baseUrl.replace(/\/+$/, "");
  const isVidu = /(?:^|\.)vidu\.(?:cn|com)/i.test(new URL(rawBase).host);

  if (isVidu) {
    return testVidu(rawBase, u.apiKey);
  }
  return testOpenAICompat(rawBase, u.apiKey);
}

/** 探测 Vidu：故意发一个肯定会失败的 POST，只要服务器返回 4xx JSON 就算"接通" */
async function testVidu(baseUrl: string, apiKey: string) {
  const url = `${baseUrl}/ent/v1/explain-comic/tasks`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${apiKey}`,
      },
      // 故意非法的 body：这能让 Vidu 返回业务错误，但前提是它认 Token + 路由通
      body: JSON.stringify({ script_name: "ping", script_content: "" }),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }

    // 401 / 403：Token 不对
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        ok: false,
        status: res.status,
        error: `Vidu 拒绝 Token（HTTP ${res.status}），请检查 API Key 是否正确或已过期`,
        sample: text.slice(0, 400),
      }, { status: 502 });
    }
    // 其他 4xx：路由+鉴权都通了，只是 body 不合法 —— 这是我们故意的，连通成功
    if (res.status >= 400 && res.status < 500) {
      return NextResponse.json({
        ok: true,
        status: res.status,
        pingUrl: url,
        method: "Vidu 业务探测（POST /ent/v1/explain-comic/tasks 故意空 body）",
        note: `服务器以 ${res.status} 拒绝了我们的非法 body，说明鉴权和路由都通。`,
        sample: text.slice(0, 400),
      });
    }
    // 2xx：……理论上不会发生（我们故意发了非法 body），但也算 ok
    if (res.ok) {
      return NextResponse.json({
        ok: true,
        status: res.status,
        pingUrl: url,
        sample: text.slice(0, 400),
      });
    }
    // 5xx：上游自己挂了
    return NextResponse.json({
      ok: false,
      status: res.status,
      error: `Vidu 服务器返回 ${res.status}，请稍后再试或联系 Vidu`,
      sample: text.slice(0, 400),
      raw: parsed,
    }, { status: 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      error: `无法连接到 Vidu（${msg}）。请检查 Base URL 是否正确（应为 https://api.vidu.cn 或 https://api.vidu.com）`,
    }, { status: 502 });
  }
}

/** 探测 OpenAI 兼容上游（ai6700 等） */
async function testOpenAICompat(rawBase: string, apiKey: string) {
  const rootBase = rawBase
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/v1$/i, "");
  const candidates = Array.from(new Set([
    `${rawBase}/v1/skills/guide`,
    `${rawBase}/v1/models`,
    `${rootBase}/v1/skills/guide`,
    `${rootBase}/v1/models`,
    `${rootBase}/models`,
    `${rootBase}/v1/images/generations`,
  ]));

  try {
    const tried: Array<{ url: string; status?: number; ok: boolean; error?: string }> = [];
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const text = await res.text();
        tried.push({ url, status: res.status, ok: res.ok });
        if (res.ok) {
          return NextResponse.json({
            ok: true,
            status: res.status,
            pingUrl: url,
            sample: text.slice(0, 400),
            tried,
          });
        }
        // 星镜AI这类只提供图片生成接口的上游，GET /v1/images/generations
        // 会返回 400 业务错误（如 model 不能为空）。这说明 Base URL、路由、鉴权都已接通。
        if (
          url.endsWith("/v1/images/generations") &&
          res.status >= 400 &&
          res.status < 500 &&
          res.status !== 401 &&
          res.status !== 403 &&
          /model|prompt|不能为空|invalid_request/i.test(text)
        ) {
          return NextResponse.json({
            ok: true,
            status: res.status,
            pingUrl: url,
            method: "图片生成接口业务探测（GET /v1/images/generations）",
            note: `服务器以 ${res.status} 拒绝了缺少参数的探测请求，说明鉴权和路由都通。`,
            sample: text.slice(0, 400),
            tried,
          });
        }
      } catch (e) {
        tried.push({
          url,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return NextResponse.json({
      ok: false,
      error: "上游连通性测试失败，请检查 Base URL / API Key",
      tried,
    }, { status: 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
