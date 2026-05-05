import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { isCosEnabled, cosUploadBuffer } from "@/lib/cos";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_BYTES = 30 * 1024 * 1024; // 30MB（覆盖 5 分钟以内的真人音频）

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

// 接受常见音频格式。注意有些浏览器把 m4a 上传成 audio/mp4 / audio/x-m4a，都做兼容
const ALLOWED_AUDIO_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
};

function buildAbsoluteUrl(req: Request, relPath: string): string {
  // 1) 显式配置的公网 base（ngrok/cloudflared/自建反代）优先级最高
  const envBase = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (envBase) return `${envBase}${relPath}`;

  // 2) 反代头（ngrok、Cloudflare 等都会带）
  const h = req.headers;
  const forwardedProto = h.get("x-forwarded-proto");
  const forwardedHost = h.get("x-forwarded-host") || h.get("host");
  if (forwardedHost) {
    const proto = forwardedProto || (forwardedHost.startsWith("localhost") || forwardedHost.startsWith("127.") ? "http" : "https");
    return `${proto}://${forwardedHost}${relPath}`;
  }

  // 3) 退化到 request.url 的 origin
  try {
    const u = new URL(req.url);
    return `${u.origin}${relPath}`;
  } catch {
    return relPath;
  }
}

export async function POST(req: Request) {
  let session;
  try { session = await requireUser(); }
  catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const ct = req.headers.get("content-type") || "";
  if (!ct.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "必须用 multipart/form-data 上传" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { error: "解析上传失败：" + (e instanceof Error ? e.message : String(e)) },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "文件为空" }, { status: 400 });
  }
  const mime = (file.type || "").toLowerCase();
  const filenameLower = (file.name || "").toLowerCase();
  // 类型兜底：浏览器有时不给 mime，按后缀猜
  const guessByExt = (() => {
    if (filenameLower.endsWith(".mp3")) return { mime: "audio/mpeg", ext: "mp3", kind: "audio" as const };
    if (filenameLower.endsWith(".wav")) return { mime: "audio/wav", ext: "wav", kind: "audio" as const };
    if (filenameLower.endsWith(".m4a")) return { mime: "audio/mp4", ext: "m4a", kind: "audio" as const };
    if (filenameLower.endsWith(".aac")) return { mime: "audio/aac", ext: "aac", kind: "audio" as const };
    if (filenameLower.endsWith(".ogg")) return { mime: "audio/ogg", ext: "ogg", kind: "audio" as const };
    if (filenameLower.endsWith(".webm")) return { mime: "audio/webm", ext: "webm", kind: "audio" as const };
    if (filenameLower.endsWith(".flac")) return { mime: "audio/flac", ext: "flac", kind: "audio" as const };
    return null;
  })();

  let kind: "image" | "audio" | null = null;
  let ext: string | null = ALLOWED_IMAGE_MIME[mime] || ALLOWED_AUDIO_MIME[mime] || null;
  if (ALLOWED_IMAGE_MIME[mime]) kind = "image";
  else if (ALLOWED_AUDIO_MIME[mime]) kind = "audio";
  else if (guessByExt) {
    kind = guessByExt.kind;
    ext = guessByExt.ext;
  }
  if (!kind || !ext) {
    return NextResponse.json(
      { error: `不支持的文件类型：${file.type || filenameLower || "unknown"}` },
      { status: 400 },
    );
  }

  const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (file.size > limit) {
    return NextResponse.json(
      { error: `文件过大，最大 ${Math.round(limit / 1024 / 1024)}MB` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const filename = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}.${ext}`;

  const isProd = process.env.NODE_ENV === "production";

  // 优先走腾讯云 COS（公网可访问，上游模型直接拉）
  if (isCosEnabled()) {
    try {
      const cosUrl = await cosUploadBuffer(buf, {
        dir: kind === "audio" ? "ai-hub/user-uploads/audio" : "ai-hub/user-uploads",
        filename,
        mime,
      });
      if (cosUrl) {
        return NextResponse.json({
          ok: true,
          url: cosUrl,
          absoluteUrl: cosUrl,
          size: file.size,
          mime,
          kind,
          isLocalhost: false,
          storage: "cos",
          uploadedBy: session.id,
        });
      }
      // cosUrl 为空也算失败
      throw new Error("COS 返回空 URL");
    } catch (e) {
      console.error("[uploads] COS 上传失败：", e);
      if (isProd) {
        return NextResponse.json(
          { error: "对象存储上传失败，请稍后重试或联系管理员", detail: e instanceof Error ? e.message : String(e) },
          { status: 502 },
        );
      }
      // 非生产环境继续降级到本地兜底（方便本地 dev）
    }
  } else if (isProd) {
    // 生产环境必须配 COS，否则文件根本无法持久化（容器无状态）
    return NextResponse.json(
      {
        error:
          "生产环境未配置对象存储（TENCENT_COS_*），无法接收上传。请在部署平台环境变量中配置 COS。",
      },
      { status: 503 },
    );
  }

  // 本地开发兜底：写到 public/uploads（仅 dev 模式）
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const fullPath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(fullPath, buf);

  const relPath = `/uploads/${filename}`;
  const absoluteUrl = buildAbsoluteUrl(req, relPath);
  const isLocalhost = /^https?:\/\/(localhost|127\.|0\.0\.0\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(absoluteUrl);

  return NextResponse.json({
    ok: true,
    url: relPath,
    absoluteUrl,
    size: file.size,
    mime,
    kind,
    isLocalhost,
    storage: "local",
    uploadedBy: session.id,
  });
}
