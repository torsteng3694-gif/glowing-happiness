/**
 * Vidu 回调签名校验
 * 文档：HMAC-SHA256(secret = 创建任务时使用的 token)
 *
 * signingString =
 *   HTTP_METHOD + "\n" +
 *   URI + "\n" +
 *   RAW_QUERY + "\n" +
 *   "vidu" + "\n" +
 *   DATE + "\n" +
 *   for each H in X-HMAC-SIGNED-HEADERS (按指定顺序):
 *     H + ":" + headers[H] + "\n"
 *
 * signature = base64( HMAC-SHA256(secret, signingString) )
 *
 * 校验时还会做：
 *   1. 算法名 = hmac-sha256
 *   2. access-key = vidu
 *   3. 签名头里必须包含 Date / x-request-nonce
 *   4. Date 时间偏差 ≤ 5 分钟（防重放）
 *   5. nonce 不为空
 */

import crypto from "node:crypto";

export type ViduCallbackVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 用同样算法生成签名（也可用于自测）。
 *
 * @param secret      Vidu API Token（创建任务时用的那个）
 * @param method      HTTP method，全大写
 * @param fullUrl     完整 callback_url（含协议、host、path、query），用 URL parser 切开
 * @param date        请求头里的 Date 值
 * @param headerMap   key 大小写敏感（按 Vidu 文档大小写写入）
 * @param headerOrder X-HMAC-SIGNED-HEADERS 按 ";" 拆分后的顺序
 */
export function buildViduSignature(
  secret: string,
  method: string,
  fullUrl: string,
  date: string,
  headerMap: Record<string, string>,
  headerOrder: string[],
): string {
  const u = new URL(fullUrl);
  const uri = u.pathname || "/";
  const query = u.search.startsWith("?") ? u.search.slice(1) : u.search || "";

  let signingString =
    method.toUpperCase() + "\n" +
    uri + "\n" +
    query + "\n" +
    "vidu" + "\n" +
    date + "\n";
  for (const h of headerOrder) {
    signingString += `${h}:${headerMap[h] ?? ""}\n`;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signingString, "utf8");
  return hmac.digest("base64");
}

/**
 * 校验一次进来的回调请求。
 *
 * @param req       Next.js 收到的 Request
 * @param secret    Vidu API Token（与创建任务时一致）
 * @param opts      可调参数
 *   - publicBaseUrl  我方对外可访问的 base URL（必须，签名算法依赖完整 URL 的 path/query）
 *                    通常 = process.env.PUBLIC_BASE_URL
 *   - maxClockSkewSec  Date 与现在的最大允许偏差秒数（默认 300）
 */
export function verifyViduCallback(
  req: Request,
  secret: string,
  opts: { publicBaseUrl?: string; maxClockSkewSec?: number; debug?: boolean },
): ViduCallbackVerifyResult {
  if (!secret) return { ok: false, reason: "secret missing" };
  const skew = opts.maxClockSkewSec ?? 300;

  // —— 提取我们关心的头（不区分大小写读取）——
  const get = (k: string) => req.headers.get(k) || "";
  const algo = get("x-hmac-algorithm").toLowerCase();
  const accessKey = get("x-hmac-access-key").toLowerCase();
  const signedHeadersHeader = get("x-hmac-signed-headers");
  const givenSignature = get("x-hmac-signature");
  const date = get("date");
  const nonce = get("x-request-nonce");

  if (algo !== "hmac-sha256") return { ok: false, reason: `bad algorithm: ${algo || "<empty>"}` };
  if (accessKey !== "vidu") return { ok: false, reason: `bad access-key: ${accessKey || "<empty>"}` };
  if (!givenSignature) return { ok: false, reason: "missing X-HMAC-SIGNATURE" };
  if (!signedHeadersHeader) return { ok: false, reason: "missing X-HMAC-SIGNED-HEADERS" };
  if (!date) return { ok: false, reason: "missing Date" };
  if (!nonce) return { ok: false, reason: "missing x-request-nonce" };

  // —— 时间窗校验，防重放 ——
  const ts = Date.parse(date);
  if (!Number.isFinite(ts)) return { ok: false, reason: `bad Date: ${date}` };
  const driftSec = Math.abs(Date.now() - ts) / 1000;
  if (driftSec > skew) {
    return { ok: false, reason: `Date drift too large: ${Math.round(driftSec)}s > ${skew}s` };
  }

  // —— 取出按指定顺序排列的 header → value 列表（大小写按 X-HMAC-SIGNED-HEADERS 里写的为准）——
  const headerOrder = signedHeadersHeader
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (headerOrder.length === 0) {
    return { ok: false, reason: "X-HMAC-SIGNED-HEADERS is empty" };
  }
  const headerMap: Record<string, string> = {};
  for (const h of headerOrder) {
    // 按文档：拼接形式为 HeaderKey:HeaderValue，
    // HeaderKey 在我们这里要按用户在 X-HMAC-SIGNED-HEADERS 里写的字面值来拼接，
    // value 用 fetch Headers（不区分大小写）查表得到。
    headerMap[h] = req.headers.get(h) || "";
  }

  // —— 构造完整 URL（path/query 必须从这里解析）——
  //   优先级：PUBLIC_BASE_URL > x-forwarded-host(+proto) > req.url
  let fullUrl: string;
  try {
    const reqUrl = new URL(req.url);
    if (opts.publicBaseUrl) {
      const base = opts.publicBaseUrl.replace(/\/+$/, "");
      fullUrl = base + reqUrl.pathname + (reqUrl.search || "");
    } else {
      const fwdHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || reqUrl.host;
      const fwdProto = req.headers.get("x-forwarded-proto") || reqUrl.protocol.replace(":", "") || "https";
      fullUrl = `${fwdProto}://${fwdHost}${reqUrl.pathname}${reqUrl.search || ""}`;
    }
  } catch (e) {
    return { ok: false, reason: `bad request URL: ${e instanceof Error ? e.message : String(e)}` };
  }

  // —— 计算期望签名 ——
  const method = (req.method || "POST").toUpperCase();
  const expected = buildViduSignature(secret, method, fullUrl, date, headerMap, headerOrder);

  if (opts.debug) {
    // 仅在调试时打印；生产环境别开（会泄漏 Vidu 回调内部头）
    console.log("[vidu-sign][debug] fullUrl=", fullUrl);
    console.log("[vidu-sign][debug] method=", method);
    console.log("[vidu-sign][debug] headerOrder=", headerOrder);
    console.log("[vidu-sign][debug] headerMap=", headerMap);
    console.log("[vidu-sign][debug] expected=", expected);
    console.log("[vidu-sign][debug] given   =", givenSignature);
  }

  // —— 常数时间比较 ——
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(givenSignature, "utf8");
  if (a.length !== b.length) {
    return { ok: false, reason: `signature mismatch (len ${a.length} vs ${b.length})` };
  }
  if (!crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}
