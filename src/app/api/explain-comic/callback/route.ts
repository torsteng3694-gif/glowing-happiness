/**
 * Vidu 异步任务回调端点。
 *
 * 创建任务时下发的 callback_url：
 *   ${PUBLIC_BASE_URL}/api/explain-comic/callback
 *
 * 安全：
 *   1. 按 Vidu 文档校验 X-HMAC-SIGNATURE（HMAC-SHA256，secret = 创建该任务时的 Vidu Token）
 *   2. Date 时间窗 ±5 分钟，防重放
 *   3. 仅当 externalId 在本地存在且 Upstream apiKey 完整时校验；失败 → 401
 *   4. 可选额外的 ?secret=xxx 共享密钥（VIDU_CALLBACK_SECRET）做最外层防护，
 *      在你不希望任何陌生回调连进来的时候启用
 *
 * 行为：
 *   - 解析 Vidu 回调 body（结构与查询任务返回一致）
 *   - 用 normalizeViduTask 规范化
 *   - 按 externalId 反查本地 Task 后走 settleExplainComic（幂等）
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeViduTask } from "@/lib/providers/vidu";
import { verifyViduCallback } from "@/lib/providers/vidu-signature";
import { settleExplainComic } from "@/lib/explain-comic-settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 0) 可选的最外层共享密钥
  const expectedShared = process.env.VIDU_CALLBACK_SECRET;
  if (expectedShared) {
    const url = new URL(req.url);
    const got = url.searchParams.get("secret") || req.headers.get("x-vidu-secret");
    if (got !== expectedShared) {
      return NextResponse.json({ error: "invalid secret" }, { status: 401 });
    }
  }

  // 1) 读取 body —— 注意：body 只能读一次。后续校验签名不依赖 body 内容（Vidu
  //    的签名只覆盖 method/uri/query/access-key/date/headers），所以这里直接 json() 安全。
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // 2) 找到 externalId → Task → Upstream（拿 secret = 创建任务时的 token）
  const externalId: string | undefined =
    raw?.id || raw?.task_id || raw?.data?.id || raw?.data?.task_id;
  if (!externalId) {
    return NextResponse.json({ error: "missing task id" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { externalId: String(externalId) },
    include: { channel: { include: { upstream: true } } },
  });
  if (!task) {
    // 未知任务：直接 200（避免上游无限重试）+ 日志告警
    console.warn("[explain-comic][callback] unknown externalId:", externalId);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 3) 取出"创建该任务时使用的 token"
  //    顺序与创建任务时 viduCreateExplainComic 一致：channel.apiKey 优先，否则 upstream.apiKey
  const secret =
    (task.channel?.apiKey && task.channel.apiKey.trim()) ||
    task.channel?.upstream.apiKey ||
    "";

  // 4) 签名校验
  //    优先用 PUBLIC_BASE_URL；没配则按反代头取（host / x-forwarded-host）。
  //    支持 ?debug=1 打开详细日志（仅本次请求生效，不要在生产长期开启）。
  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || undefined;
  const debug = new URL(req.url).searchParams.get("debug") === "1";
  const v = verifyViduCallback(req, secret, { publicBaseUrl: publicBase, debug });
  if (!v.ok) {
    console.warn("[explain-comic][callback] signature verify failed:", v.reason);
    return NextResponse.json({ error: `signature invalid: ${v.reason}` }, { status: 401 });
  }

  // 5) 规范化 + 结算
  const norm = normalizeViduTask(String(externalId), raw);
  try {
    await settleExplainComic({
      taskId: task.id,
      status: norm.status,
      progress: norm.progress,
      videoUrl: norm.videoUrl,
      coverUrl: norm.coverUrl,
      durationSec: norm.durationSec,
      errorMessage: norm.errorMessage,
    });
  } catch (e) {
    console.error("[explain-comic][callback] settle failed:", e);
    return NextResponse.json({ error: "settle failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
