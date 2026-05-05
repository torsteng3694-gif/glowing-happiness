/**
 * 把一张本地图片（磁盘路径 or base64 数据）上传到一个公网图床，
 * 返回公网可访问的 URL。专门用来解决"上游必须用 http(s):// URL 拉参考图"的问题。
 *
 * 启用方式（.env）：
 *   PUBLIC_IMAGE_HOST=auto        # 默认关；设为 auto 会按顺序尝试多家图床（cos > telegraph > smms）
 *   PUBLIC_IMAGE_HOST=cos         # 只用 腾讯云 COS（推荐，需要 4 个 TENCENT_COS_* 环境变量）
 *   PUBLIC_IMAGE_HOST=telegraph   # 只用 telegra.ph
 *   PUBLIC_IMAGE_HOST=smms        # 只用 sm.ms（需要 SMMS_TOKEN 才稳）
 *   SMMS_TOKEN=<token>            # sm.ms 账号 token（可选，匿名也行，但配额很低）
 */

import fs from "node:fs/promises";
import path from "node:path";
import { cosUploadBuffer, isCosEnabled } from "./cos";

export type PublicUploadInput =
  | { kind: "file"; absPath: string }
  | { kind: "dataUrl"; dataUrl: string };

/** 从 data URL 或文件路径读出 (buffer, mime, filename) */
async function readPayload(
  input: PublicUploadInput,
): Promise<{ buf: Buffer; mime: string; filename: string } | null> {
  if (input.kind === "file") {
    try {
      const buf = await fs.readFile(input.absPath);
      const ext = path.extname(input.absPath).slice(1).toLowerCase() || "png";
      const mime =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : ext === "bmp"
                ? "image/bmp"
                : "image/png";
      return { buf, mime, filename: path.basename(input.absPath) };
    } catch {
      return null;
    }
  }
  // dataUrl
  const m = input.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1] || "image/png";
  const buf = Buffer.from(m[2], "base64");
  const ext =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/webp"
        ? "webp"
        : mime === "image/gif"
          ? "gif"
          : mime === "image/bmp"
            ? "bmp"
            : "png";
  return { buf, mime, filename: `image.${ext}` };
}

/** 上传到 telegra.ph，返回公网 URL 或 null */
async function uploadTelegraph(
  buf: Buffer,
  mime: string,
  filename: string,
  timeoutMs = 15000,
): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch("https://telegra.ph/upload", {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    // 成功：[{ src: "/file/xxxx.png" }]
    // 失败：{ error: "..." }
    const src =
      Array.isArray(json) && json[0]?.src && typeof json[0].src === "string" ? json[0].src : null;
    if (!src) return null;
    if (src.startsWith("http")) return src;
    return `https://telegra.ph${src}`;
  } catch {
    return null;
  }
}

/** 上传到 sm.ms，返回公网 URL 或 null */
async function uploadSmms(
  buf: Buffer,
  mime: string,
  filename: string,
  timeoutMs = 15000,
): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("smfile", new Blob([new Uint8Array(buf)], { type: mime }), filename);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const headers: Record<string, string> = {};
    const tok = (process.env.SMMS_TOKEN || "").trim();
    if (tok) headers["Authorization"] = tok;

    const res = await fetch("https://sm.ms/api/v2/upload", {
      method: "POST",
      body: form,
      signal: ctrl.signal,
      headers,
    });
    clearTimeout(t);

    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    // 成功：{ success:true, data:{ url:"https://s2.loli.net/..." } }
    // 重复：{ success:false, code:"image_repeated", images:"https://..." }
    if (json?.success && json?.data?.url) return json.data.url;
    if (json?.code === "image_repeated" && typeof json?.images === "string") return json.images;
    return null;
  } catch {
    return null;
  }
}

/** 上传到腾讯云 COS（仅在 .env 配置完整时生效） */
async function uploadCos(buf: Buffer, mime: string, filename: string): Promise<string | null> {
  if (!isCosEnabled()) return null;
  return cosUploadBuffer(buf, { dir: "ai-hub/refs", mime, filename });
}

/** 对外主入口。返回公网 URL；失败返回 null。
 *
 * 默认 mode = auto。auto 模式下：
 *   - 如果 TENCENT_COS_* 4 个变量都配齐，COS 在最前
 *   - 否则按 telegraph -> smms 兜底
 *   - 都不通就返回 null（调用方会回退到 base64 方案）
 *
 * 用户没设 PUBLIC_IMAGE_HOST 时，**自动检测 COS 是否可用**：
 *   配了 → 等同于 PUBLIC_IMAGE_HOST=cos
 *   没配 → 等同于关闭（返回 null，调用方走 base64）
 */
export async function uploadToPublicHost(input: PublicUploadInput): Promise<string | null> {
  let mode = (process.env.PUBLIC_IMAGE_HOST || "").toLowerCase().trim();

  // 用户没显式配置时：COS 可用 → 自动启用 COS；否则关闭
  if (!mode) {
    mode = isCosEnabled() ? "cos" : "off";
  }
  if (mode === "off" || mode === "false" || mode === "0") return null;

  const payload = await readPayload(input);
  if (!payload) return null;

  const order: Array<"cos" | "telegraph" | "smms"> =
    mode === "cos"
      ? ["cos"]
      : mode === "telegraph"
        ? ["telegraph"]
        : mode === "smms"
          ? ["smms"]
          : ["cos", "telegraph", "smms"]; // auto

  for (const provider of order) {
    const url =
      provider === "cos"
        ? await uploadCos(payload.buf, payload.mime, payload.filename)
        : provider === "telegraph"
          ? await uploadTelegraph(payload.buf, payload.mime, payload.filename)
          : await uploadSmms(payload.buf, payload.mime, payload.filename);
    if (url) {
      console.log(`[public-upload] ${provider} ok -> ${url}`);
      return url;
    }
    if (provider === "cos" && !isCosEnabled()) {
      // COS 没配，安静跳过
    } else {
      console.warn(`[public-upload] ${provider} failed, trying next...`);
    }
  }
  return null;
}
