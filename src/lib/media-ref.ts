import fs from "node:fs/promises";
import path from "node:path";
import { uploadToPublicHost } from "./public-upload";

/**
 * 上游（例如 ai6700、黑猪ai）要发起异步任务时，会用 GET 去拉取参考图 URL。
 * 本地 dev / 内网部署下，URL 可能是 localhost / 私网地址，上游根本访问不到。
 *
 * 这里在提交上游前，把 `params` 中所有参考图字段里的「本站 /uploads/… URL」 / 「base64 data URL」
 * 按以下优先级重写：
 *   1) 若设置了 PUBLIC_IMAGE_HOST（telegra.ph / sm.ms）→ 上传到公网图床，返回公网 URL
 *   2) 否则 → 转 data:URL base64（部分上游可用，但 gpt-image-2 等不吃）
 *   3) 否则（例如 base64 字段且未配置图床）→ 原样保留
 */

/** 这些字段会被扫描：字符串直接替换，数组逐元素替换 */
const REF_FIELDS = [
  "image",
  "images",
  "image_url",
  "image_urls",
  "first_frame_image",
  "init_image",
  "reference_image",
  "reference_images",
];

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.startsWith("localhost:")) return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("0.0.0.0")) return true;
  if (h.startsWith("192.168.")) return true;
  if (h.startsWith("10.")) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

/** 如果是本站 /uploads/<file> URL，返回本地磁盘绝对路径，否则 null。 */
function localUploadsPath(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!isPrivateHost(url.host)) return null;
    if (!/^\/uploads\/[^/\\]+$/.test(url.pathname)) return null;
    const base = path.basename(url.pathname);
    if (!/^[A-Za-z0-9_.-]+$/.test(base)) return null;
    return path.join(process.cwd(), "public", "uploads", base);
  } catch {
    return null;
  }
}

async function toDataUrl(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(absPath);
    const ext = path.extname(absPath).slice(1).toLowerCase();
    const mime = MIME_BY_EXT[ext] || "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * 针对单个参考图字符串，尽量返回一个"上游可直接拉取"的 URL。
 * - 公网 http(s):// URL → 原样
 * - 本站 /uploads/xxx → 尝试公网图床 → 否则 base64
 * - data:base64       → 尝试公网图床 → 否则原样保留
 */
async function rewriteOne(v: unknown): Promise<unknown> {
  if (typeof v !== "string" || v.length === 0) return v;

  // 1) 本站本地 /uploads/... URL：读文件
  const abs = localUploadsPath(v);
  if (abs) {
    const publicUrl = await uploadToPublicHost({ kind: "file", absPath: abs });
    if (publicUrl) return publicUrl;
    const data = await toDataUrl(abs);
    return data || v;
  }

  // 2) data:base64 URL：也尝试上传到图床（某些上游不吃 base64）
  if (v.startsWith("data:")) {
    const publicUrl = await uploadToPublicHost({ kind: "dataUrl", dataUrl: v });
    if (publicUrl) return publicUrl;
    return v;
  }

  // 3) 已经是公网 URL，原样保留
  return v;
}

/**
 * 重写 params 对象里已知的参考图字段。返回的是一份浅拷贝，不修改入参。
 * 对非字符串字段原样保留；对已经可被上游拉到的公网 URL 原样保留。
 *
 * 函数名保留 `rewriteLocalRefsToBase64` 是为了向后兼容 —— 现在它做的不只是 base64，
 * 还包括可选的公共图床直传。
 */
export async function rewriteLocalRefsToBase64(
  params: Record<string, any> | undefined | null,
): Promise<Record<string, any> | undefined> {
  if (!params || typeof params !== "object") return params ?? undefined;
  const out: Record<string, any> = { ...params };
  for (const field of REF_FIELDS) {
    if (!(field in out)) continue;
    const v = out[field];
    if (Array.isArray(v)) {
      out[field] = await Promise.all(v.map((x) => rewriteOne(x)));
    } else {
      out[field] = await rewriteOne(v);
    }
  }
  return out;
}
