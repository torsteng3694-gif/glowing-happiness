/**
 * 项目级批量 ZIP 下载
 *
 *   GET /api/ecom-image/projects/:id/zip?picked=1
 *
 *   query:
 *     - picked=1: 仅打包已挑中的候选；不传则打包所有 done 的候选
 *
 * 服务端流程：
 *   1. 拉项目所有 done 候选（按 query 过滤）
 *   2. 逐张 fetch URL 内容
 *   3. jszip 打包，目录结构：<分类名>/<plan-序号>-<plan-标题>/<候选号>.png
 *   4. 一次性 stream 返回（zip nodebuffer）
 */

import { NextResponse } from "next/server";
import JSZip from "jszip";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFileSegment(s: string, max = 60) {
  return s
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, max)
    .trim() || "untitled";
}

function inferExt(url: string, contentType: string | null): string {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  const m = url.toLowerCase().match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/);
  if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  return "png";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const pickedOnly = url.searchParams.get("picked") === "1";

  const project = await prisma.ecomProject.findUnique({
    where: { id },
    select: { userId: true, title: true },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (project.userId !== session.id) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  // 拉所有 done 候选 + 关联 plan + imageType
  const generatedImages = await prisma.ecomGeneratedImage.findMany({
    where: {
      projectId: id,
      status: "done",
      url: { not: null },
      ...(pickedOnly ? { picked: true } : {}),
    },
    include: {
      plan: { include: { imageType: true } },
    },
  });

  if (generatedImages.length === 0) {
    return NextResponse.json(
      { error: pickedOnly ? "没有挑中的候选" : "还没有生成完成的图片" },
      { status: 400 },
    );
  }

  const zip = new JSZip();

  // 并发下载（控制 5 个）
  const tasks = generatedImages.map((g) => async () => {
    if (!g.url) return;
    try {
      const res = await fetch(g.url);
      if (!res.ok) return;
      const ab = await res.arrayBuffer();
      const ext = inferExt(g.url, res.headers.get("content-type"));
      const groupDir = safeFileSegment(g.plan.imageType.name);
      const planSeg = safeFileSegment(`${g.plan.idx}-${g.plan.title}`);
      const filename = `候选${g.candidateIdx}${g.picked ? "_已挑中" : ""}.${ext}`;
      zip.folder(groupDir)?.folder(planSeg)?.file(filename, Buffer.from(ab));
    } catch {
      // 单张失败忽略，不让整体失败
    }
  });

  const CONCURRENCY = 5;
  const queue = tasks.slice();
  const inflight: Promise<void>[] = [];
  while (queue.length > 0 || inflight.length > 0) {
    while (inflight.length < CONCURRENCY && queue.length > 0) {
      const t = queue.shift()!();
      const p = t.finally(() => {
        const i = inflight.indexOf(p);
        if (i >= 0) inflight.splice(i, 1);
      });
      inflight.push(p);
    }
    if (inflight.length > 0) await Promise.race(inflight);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const safeTitle = safeFileSegment(project.title);
  const filename = `${safeTitle}_${pickedOnly ? "已挑中" : "全部"}.zip`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
    },
  });
}
