import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 4 后，/v1/media/generate 的实现已整体搬到 Go 后端 (`POST /v2/media/generate`)。
 * 本文件只是一层透明代理：把原请求（含 body、Authorization / x-api-key 等鉴权头、
 * x-channel-id 这类业务头）原样转发到 Go，再把 Go 的响应回给客户端。
 *
 * 保留这一层的原因：
 *  - 外部调用方已经按 OpenAI 兼容路径 `/v1/media/generate` 写了代码，Path 改了会破坏契约；
 *  - 让 Go 暴露 `/v1/*` 也可以，但是那样 Next 的 /v1/chat /v1/models 需要大面积改，
 *    更稳妥的迁移方式是「逐条改 handler，保留 URL」。
 *  - Next.js 的 maxDuration=600 限制在这里不再是问题：我们只是做一次转发、立刻返回 202。
 */
const GO_BACKEND = process.env.GO_BACKEND_URL || "http://localhost:8080";

function forwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  // 转发与鉴权 / 路由 / 内容类型相关的所有头，其他剔除避免污染
  const allow = [
    "authorization",
    "content-type",
    "x-api-key",
    "x-goog-api-key",
    "x-channel-id",
    "user-agent",
    "accept",
  ];
  req.headers.forEach((v, k) => {
    if (allow.includes(k.toLowerCase())) headers[k] = v;
  });
  return headers;
}

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const upstream = await fetch(`${GO_BACKEND}/v2/media/generate`, {
      method: "POST",
      headers: forwardHeaders(req),
      body,
      // 202 是正常路径，不要把它当错误重试
      redirect: "manual",
    });
    const text = await upstream.text();
    // 透传状态码 + content-type，body 原样回去
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: { message: "backend_unreachable: " + String(err?.message || err), code: "backend_error" } },
      { status: 502 },
    );
  }
}
