import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 媒体文件代理
 * ---------------------------------------------------------------
 * 浏览器直接访问上游 CDN（如 cos.lingkeai.vip）时经常因为
 *   1) 防盗链（无 Referer / 域名不在白名单 → 403）
 *   2) CORS 头缺失
 *   3) Mixed content / cookie 分区等
 * 而加载失败。本路由把远端资源通过我们自己的域名中转一次，
 * 浏览器对其视为同源，并且我们能自由设置 Referer / UA，
 * 同时把 Range 请求透传，保留视频断点续传能力。
 *
 * 安全约束：
 *   - 只允许 http / https
 *   - 禁止访问回环 / 内网地址
 *   - 响应体按流 pipe，不落盘
 */

// 内网 IP 判断：防止服务端 SSRF 到内网（loopback / 10.0 / 172.16 / 192.168 / ::1 / fe80 ...）
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]") return true;
  if (h.startsWith("0.")) return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (h.startsWith("169.254.")) return true;
  // 172.16.0.0 - 172.31.255.255
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = parseInt(m172[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 link local
  if (h.startsWith("fe80:") || h.startsWith("fc00:") || h.startsWith("fd00:")) return true;
  return false;
}

async function proxyRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  let remote: URL;
  try {
    remote = new URL(target);
  } catch {
    return NextResponse.json({ error: "url 无效" }, { status: 400 });
  }

  if (!/^https?:$/.test(remote.protocol)) {
    return NextResponse.json({ error: "仅支持 http/https" }, { status: 400 });
  }

  if (isPrivateHost(remote.hostname)) {
    return NextResponse.json({ error: "禁止访问内网地址" }, { status: 400 });
  }

  // 透传浏览器的 Range 头，保证视频可拖动进度
  const fwdHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    Accept: "*/*",
    // 一些 CDN 需要带 Referer 才放行，直接用远端域名自身作为 Referer
    Referer: `${remote.protocol}//${remote.hostname}/`,
  };
  const range = req.headers.get("range");
  if (range) fwdHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(remote.toString(), {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: fwdHeaders,
      redirect: "follow",
      // 30 秒超时
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "上游请求失败", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // 原封保留：Content-Type / Content-Length / Accept-Ranges / Content-Range / Last-Modified / ETag
  const outHeaders = new Headers();
  const passthrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
    "content-disposition",
  ];
  for (const name of passthrough) {
    const v = upstream.headers.get(name);
    if (v) outHeaders.set(name, v);
  }
  // 缓存：常量资源可以在 CDN / 浏览器缓存 1 天
  if (upstream.ok) {
    outHeaders.set("Cache-Control", "public, max-age=86400, immutable");
  } else {
    outHeaders.set("Cache-Control", "no-store");
  }
  outHeaders.set("X-Content-Type-Options", "nosniff");
  outHeaders.set("Access-Control-Allow-Origin", "*");

  // 如果没有 content-type，尝试按后缀猜
  if (!outHeaders.get("content-type")) {
    const ext = remote.pathname.split(".").pop()?.toLowerCase() || "";
    const guess: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif",  webp: "image/webp", avif: "image/avif",
      mp4: "video/mp4",  webm: "video/webm", mov: "video/quicktime",
      mp3: "audio/mpeg", wav: "audio/wav",   ogg: "audio/ogg", m4a: "audio/mp4",
    };
    if (guess[ext]) outHeaders.set("content-type", guess[ext]);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export const GET = proxyRequest;
export const HEAD = proxyRequest;
