import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "system" | "user" | "assistant"; content: string };

/**
 * POST /api/xingye/chat
 * 把前端的多轮消息以 OpenAI 兼容格式转发到星爷ai，开启 SSE 流式返回。
 * 为了让前端处理尽量简单，这里把上游的 SSE(delta) 流直接解析出 text，
 * 以纯文本 chunk 形式回吐给浏览器。
 */
export async function POST(req: NextRequest) {
  const baseUrl = (process.env.XINGYE_BASE_URL || "").replace(/\/$/, "");
  const apiKey = process.env.XINGYE_API_KEY || "";
  const defaultModel = process.env.XINGYE_MODEL || "gpt-5.4";

  if (!baseUrl) {
    return new Response(
      JSON.stringify({ error: "未配置 XINGYE_BASE_URL，请在 .env 填好后重启服务" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "未配置 XINGYE_API_KEY，请在 .env 填好后重启服务" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { messages?: Msg[]; model?: string; system?: string; temperature?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const model = body.model || defaultModel;
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;

  const messages: Msg[] = [];
  if (body.system && body.system.trim()) {
    messages.push({ role: "system", content: body.system.trim() });
  }
  for (const m of history) {
    if (!m || typeof m.content !== "string") continue;
    if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") continue;
    messages.push({ role: m.role, content: m.content });
  }
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages 为空" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, stream: true }),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `连接星爷ai 失败: ${(err as Error).message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({
        error: `星爷ai 返回 ${upstream.status}`,
        detail: text.slice(0, 500),
      }),
      { status: upstream.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(payload);
              const delta =
                json?.choices?.[0]?.delta?.content ??
                json?.choices?.[0]?.message?.content ??
                "";
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // 非 JSON 行忽略
            }
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n[stream error] ${(err as Error).message}`),
        );
      } finally {
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
