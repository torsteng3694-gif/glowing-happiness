/**
 * 电商一键出图 · 商品图上传
 *
 *   POST /api/ecom-image/upload
 *     multipart/form-data: file=<File>
 *     query/body: projectId（可选，传则直接落 EcomSourceImage 行）
 *
 *   返回：{ url, sourceImageId? }
 *
 * 落盘策略：
 *   1) 优先腾讯云 COS（cosUploadBuffer，自动公网 URL）
 *   2) COS 不可用时本地兜底：/public/uploads/ecom-image/<projectId|tmp>/<file>
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cosUploadBuffer, isCosEnabled } from "@/lib/cos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export async function POST(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请使用 multipart/form-data 上传" }, { status: 400 });
  }
  const file = form.get("file");
  const projectId = (form.get("projectId") as string | null) ?? null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `不支持的文件类型: ${file.type}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `文件过大，限制 ${MAX_BYTES / 1024 / 1024} MB` }, { status: 400 });
  }

  // 校验项目归属
  if (projectId) {
    const project = await prisma.ecomProject.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    if (project.userId !== session.id) {
      return NextResponse.json({ error: "无权访问该项目" }, { status: 403 });
    }
    // 9 张上限
    const count = await prisma.ecomSourceImage.count({ where: { projectId } });
    if (count >= 9) {
      return NextResponse.json({ error: "单项目最多 9 张商品图" }, { status: 400 });
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  const isProd = process.env.NODE_ENV === "production";
  let url: string | null = null;

  // 1) 优先 COS
  if (isCosEnabled()) {
    try {
      url = await cosUploadBuffer(buf, {
        dir: `ecom-image/${session.id}`,
        filename: file.name,
        mime: file.type,
      });
    } catch (e) {
      console.error("[ecom-image/upload] COS 上传异常：", e);
    }
    if (!url && isProd) {
      return NextResponse.json(
        { error: "对象存储上传失败，请稍后重试或联系管理员" },
        { status: 502 },
      );
    }
  } else if (isProd) {
    return NextResponse.json(
      {
        error:
          "生产环境未配置对象存储（TENCENT_COS_*），无法接收上传。请在部署平台环境变量中配置 COS。",
      },
      { status: 503 },
    );
  }

  // 2) 本地兜底（仅 dev 模式；生产已在上面 return）
  if (!url) {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.name).toLowerCase() || ".png"}`;
    const subdir = projectId || "tmp";
    const dirAbs = path.join(process.cwd(), "public", "uploads", "ecom-image", subdir);
    await fs.mkdir(dirAbs, { recursive: true });
    const fileAbs = path.join(dirAbs, safeName);
    await fs.writeFile(fileAbs, buf);
    url = `/uploads/ecom-image/${subdir}/${safeName}`;
  }

  // 落 EcomSourceImage（如指定 projectId）
  let sourceImageId: string | null = null;
  if (projectId && url) {
    const last = await prisma.ecomSourceImage.findFirst({
      where: { projectId },
      orderBy: { orderIdx: "desc" },
      select: { orderIdx: true },
    });
    const created = await prisma.ecomSourceImage.create({
      data: {
        projectId,
        url,
        filename: file.name,
        sizeBytes: file.size,
        analyzeStatus: "pending",
        orderIdx: (last?.orderIdx ?? -1) + 1,
      },
    });
    sourceImageId = created.id;
    // 同步初始图数
    await prisma.ecomProject.update({
      where: { id: projectId },
      data: { initialImageCount: { increment: 1 } },
    });
  }

  return NextResponse.json({ ok: true, url, sourceImageId });
}
