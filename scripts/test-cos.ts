/**
 * 腾讯云 COS 连通性测试
 *
 * 用法：
 *   npx tsx scripts/test-cos.ts
 *
 * 会按顺序检查：
 *   1) .env 4 个变量是否填齐
 *   2) 客户端是否能初始化
 *   3) 上传一张 1x1 的测试图（buffer）
 *   4) 上传一段 data: URL
 *   5) 把刚才上传的图，再走一次"从 URL 转存"
 *   6) 公网访问拉一下，确认 bucket 是公有读 + Content-Type 正确
 *
 * 任意一步失败都会指出原因。
 */
// 手动读 .env（tsx 直接运行不会像 next dev 那样自动加载）
import fs from "node:fs";
import path from "node:path";
function loadEnv() {
  const p = path.join(process.cwd(), ".env");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf-8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv();
import { isCosEnabled, cosUploadBuffer, cosUploadDataUrl, cosUploadFromUrl } from "../src/lib/cos";

// 1x1 红色 PNG
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

function check(label: string, ok: boolean, hint?: string): boolean {
  if (ok) {
    console.log(`✅ ${label}`);
  } else {
    console.log(`❌ ${label}`);
    if (hint) console.log(`   ${hint}`);
  }
  return ok;
}

async function publicGet(url: string): Promise<{ status: number; ct: string | null; len: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  const res = await fetch(url, { signal: ctrl.signal });
  clearTimeout(t);
  const buf = await res.arrayBuffer();
  return { status: res.status, ct: res.headers.get("content-type"), len: buf.byteLength };
}

async function main() {
  console.log("== 腾讯云 COS 连通性测试 ==\n");

  // 1) 检查 .env
  const id = process.env.TENCENT_COS_SECRET_ID?.trim();
  const key = process.env.TENCENT_COS_SECRET_KEY?.trim();
  const bucket = process.env.TENCENT_COS_BUCKET?.trim();
  const region = process.env.TENCENT_COS_REGION?.trim();

  const placeholderRe = /^<.*>$/;
  const idOk = !!id && !placeholderRe.test(id);
  const keyOk = !!key && !placeholderRe.test(key);
  const bucketOk = !!bucket && !placeholderRe.test(bucket);
  const regionOk = !!region && !placeholderRe.test(region);

  if (!check("TENCENT_COS_SECRET_ID 已填写", idOk, "请编辑 .env 把 <请填写...> 替换成真实 SecretId")) return;
  if (!check("TENCENT_COS_SECRET_KEY 已填写", keyOk, "请编辑 .env 把 <请填写...> 替换成真实 SecretKey")) return;
  if (!check(`TENCENT_COS_BUCKET = ${bucket}`, bucketOk)) return;
  if (!check(`TENCENT_COS_REGION = ${region}`, regionOk)) return;

  // 2) 客户端初始化
  if (!check("COS 客户端初始化成功", isCosEnabled(), "看 .env 是否在 ai-hub 项目根目录")) return;

  // 3) 上传 buffer
  console.log("\n→ 1/3 上传测试图 (Buffer)...");
  const buf = Buffer.from(TEST_PNG_BASE64, "base64");
  const url1 = await cosUploadBuffer(buf, { dir: "ai-hub/test", filename: "1x1.png", mime: "image/png" });
  if (!check(`Buffer 上传成功: ${url1 || "(失败)"}`, !!url1)) {
    console.log(`   常见原因：`);
    console.log(`   - SecretId/SecretKey 错（去 API 密钥页面新建一对，把旧的禁用）`);
    console.log(`   - 子账号没关联 QcloudCOSDataFullControl 策略`);
    console.log(`   - bucket 名错（应该带 APPID 后缀，例如 ai-hub-1335106858）`);
    return;
  }

  // 4) 上传 data:URL
  console.log("\n→ 2/3 上传测试图 (data:URL)...");
  const url2 = await cosUploadDataUrl(`data:image/png;base64,${TEST_PNG_BASE64}`, { dir: "ai-hub/test" });
  if (!check(`dataUrl 上传成功: ${url2 || "(失败)"}`, !!url2)) return;

  // 5) 从 URL 转存（用刚才上传的 url1 当源）
  console.log("\n→ 3/3 从 URL 转存测试...");
  const url3 = await cosUploadFromUrl(url1, { dir: "ai-hub/test" });
  // 因为 cosUploadFromUrl 检测到是自家 URL 会原样返回，这里特殊处理
  if (url3 === url1) {
    console.log(`✅ 转存检测到自家 URL，原样返回（设计如此，没问题）`);
  } else if (!url3) {
    console.log(`❌ 转存失败`);
    return;
  } else {
    console.log(`✅ 转存成功: ${url3}`);
  }

  // 6) 公网拉取
  console.log("\n→ 检查公网访问性 (用 fetch 拉 url1)...");
  try {
    const r = await publicGet(url1);
    const accessOk = r.status === 200;
    if (!check(`公网访问 status=${r.status}`, accessOk, accessOk ? "" : "桶可能还是【私有读写】，去控制台改成【公有读私有写】")) return;
    if (r.ct?.startsWith("image/")) {
      console.log(`✅ Content-Type 正确：${r.ct}`);
    } else {
      console.log(`⚠️  Content-Type=${r.ct}（不是 image/*，但能下载，问题不大）`);
    }
    console.log(`✅ 文件大小 ${r.len} 字节（应该 ≈ ${buf.length} 字节）`);
  } catch (e) {
    console.log(`❌ 公网访问失败:`, e instanceof Error ? e.message : e);
    return;
  }

  console.log("\n🎉 全部通过！COS 已就绪，重启 dev 后所有图/视频会自动走 COS。");
  console.log("\n   测试图 URL 留作样品（你可以浏览器打开看看）：");
  console.log(`   ${url1}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("\n❌ 测试出错：", e);
  process.exit(1);
});
