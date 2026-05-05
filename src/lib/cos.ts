/**
 * 腾讯云 COS 上传工具
 *
 * 用法：在 .env 里配置 4 个变量，本文件其他模块（public-upload / comic-agent）
 * 自动接入。
 *
 *   TENCENT_COS_SECRET_ID       子账号 SecretId
 *   TENCENT_COS_SECRET_KEY      子账号 SecretKey
 *   TENCENT_COS_BUCKET          桶名（含 APPID 后缀，例如 ai-hub-1335106858）
 *   TENCENT_COS_REGION          地域（例如 ap-nanjing）
 *   TENCENT_COS_PUBLIC_HOST     （可选）自定义 CDN 域名，例如 https://cdn.example.com
 *                                没填则用 https://<bucket>.cos.<region>.myqcloud.com
 *
 * 安全要点：
 *   - 强烈建议用 子账号 + 仅 COS 权限（不要用主账号 SecretKey）
 *   - 桶必须设为「公有读」，不然上游模型拉不到 URL
 *   - .env 不要提交到 git
 */

import COS from "cos-nodejs-sdk-v5";

let _client: COS | null = null;
let _initialized = false;

function getClient(): COS | null {
  if (_initialized) return _client;
  _initialized = true;

  const SecretId = process.env.TENCENT_COS_SECRET_ID?.trim();
  const SecretKey = process.env.TENCENT_COS_SECRET_KEY?.trim();
  const Bucket = process.env.TENCENT_COS_BUCKET?.trim();
  const Region = process.env.TENCENT_COS_REGION?.trim();

  if (!SecretId || !SecretKey || !Bucket || !Region) {
    if (process.env.NODE_ENV === "production") {
      // 生产环境必须配 COS：容器无状态，没有它任何上传都会失效
      console.error(
        "[cos] ❌ 生产环境缺少 TENCENT_COS_* 环境变量，所有上传接口将返回 503。" +
          " 请在部署平台环境变量里补齐 TENCENT_COS_SECRET_ID / SECRET_KEY / BUCKET / REGION。",
      );
    }
    return null;
  }
  try {
    _client = new COS({ SecretId, SecretKey });
    console.log(`[cos] 客户端已初始化: bucket=${Bucket} region=${Region}`);
  } catch (e) {
    console.error("[cos] 初始化失败:", e);
    _client = null;
  }
  return _client;
}

export function isCosEnabled(): boolean {
  return getClient() !== null;
}

function publicUrlOf(objectKey: string): string {
  const host = process.env.TENCENT_COS_PUBLIC_HOST?.replace(/\/+$/, "");
  if (host) return `${host}/${objectKey}`;
  const bucket = process.env.TENCENT_COS_BUCKET?.trim();
  const region = process.env.TENCENT_COS_REGION?.trim();
  return `https://${bucket}.cos.${region}.myqcloud.com/${objectKey}`;
}

/**
 * 把 Buffer 上传到 COS，返回公网 URL。
 *
 * @param buf 二进制内容
 * @param opts.dir       目录前缀，默认 "ai-hub"
 * @param opts.filename  期望文件名（仅用于扩展名）
 * @param opts.mime      MIME 类型（用于设置 Content-Type）
 */
export async function cosUploadBuffer(
  buf: Buffer,
  opts: {
    dir?: string;
    filename?: string;
    mime?: string;
  } = {},
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const Bucket = process.env.TENCENT_COS_BUCKET!.trim();
  const Region = process.env.TENCENT_COS_REGION!.trim();

  const dir = (opts.dir || "ai-hub").replace(/^\/+|\/+$/g, "");
  const ext = inferExt(opts.filename, opts.mime) || "png";
  const key = `${dir}/${Date.now()}-${randomStr(8)}.${ext}`;
  const ContentType = opts.mime || guessMime(ext);

  try {
    await new Promise<void>((resolve, reject) => {
      client.putObject(
        {
          Bucket,
          Region,
          Key: key,
          Body: buf,
          ContentType,
          // 让 CDN / 浏览器长缓存
          CacheControl: "public, max-age=31536000, immutable",
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
    return publicUrlOf(key);
  } catch (e) {
    console.error("[cos] 上传失败:", e);
    return null;
  }
}

/** 把一个公网 URL（如上游临时图床）的内容拉下来转存到 COS（避免过期） */
export async function cosUploadFromUrl(
  srcUrl: string,
  opts: { dir?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!getClient()) return null;
  // 如果已经是自家 COS URL，直接返回，避免重复转存
  if (isOurCosUrl(srcUrl)) return srcUrl;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(srcUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`[cos] fetch ${srcUrl} status=${res.status}`);
      return null;
    }
    const mime = res.headers.get("content-type") || guessMimeByUrl(srcUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    const filename = filenameFromUrl(srcUrl);
    return cosUploadBuffer(buf, { dir: opts.dir, mime, filename });
  } catch (e) {
    // 不刷错栈，只记一行简短信息——COS 转存失败是常见情况（网络抖动），调用方会兜底用原 URL
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[cos] 转存失败（已用原 URL 兜底）：${msg.slice(0, 100)}`);
    return null;
  }
}

/** 把 data:URL 上传到 COS */
export async function cosUploadDataUrl(
  dataUrl: string,
  opts: { dir?: string } = {},
): Promise<string | null> {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1] || "image/png";
  const buf = Buffer.from(m[2], "base64");
  return cosUploadBuffer(buf, {
    dir: opts.dir,
    mime,
    filename: `data.${inferExt(undefined, mime) || "png"}`,
  });
}

/** 给客户端用的临时 STS 上传凭证（前端直传场景，本轮先不开启）。预留。 */
export async function cosCreateSts(): Promise<null> {
  // 留给未来需要做"前端直传到 COS"时实现
  return null;
}

/* ---------------- 工具 ---------------- */

function isOurCosUrl(u: string): boolean {
  const bucket = process.env.TENCENT_COS_BUCKET?.trim();
  const region = process.env.TENCENT_COS_REGION?.trim();
  if (!bucket || !region) return false;
  if (u.includes(`${bucket}.cos.${region}.myqcloud.com`)) return true;
  const host = process.env.TENCENT_COS_PUBLIC_HOST?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (host && u.includes(host)) return true;
  return false;
}

function randomStr(n: number): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

function inferExt(filename?: string, mime?: string): string | null {
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
  }
  if (mime) {
    if (mime.includes("png")) return "png";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("gif")) return "gif";
    if (mime.includes("mp4")) return "mp4";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    if (mime.includes("wav")) return "wav";
  }
  return null;
}

function guessMime(ext: string): string {
  const m: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  };
  return m[ext.toLowerCase()] || "application/octet-stream";
}

function guessMimeByUrl(u: string): string {
  const path = u.split("?")[0];
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return guessMime(ext);
}

function filenameFromUrl(u: string): string {
  try {
    const url = new URL(u);
    const base = url.pathname.split("/").pop() || "file";
    return base;
  } catch {
    return "file";
  }
}
