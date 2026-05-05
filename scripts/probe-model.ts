/** 探测一个模型的参数要求：先空 params 看必填字段，再补字段；
 *  用法: npx tsx scripts/probe-model.ts <model> [type=video|image]
 */
import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const c = fs.readFileSync(envPath, "utf-8");
  for (const line of c.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      const k = m[1];
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const KEY = "sk-f0158fd7ec5f672e65c05d50b243eae5fdabdc8d17bfc04d";
const URL = "https://api.ai6700.com/v1/media/generate";
const FRAME =
  "https://cos.lingkeai.vip/uploads/2026.04/27/20260427160917_18aa2857167a75dcba75.jpg";

async function probe(model: string, params: Record<string, unknown>) {
  const body = { model, prompt: "a cat walking in a meadow", count: 1, params };
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.text();
}

async function tryProbe(model: string, params: Record<string, unknown>, label: string) {
  const t = await probe(model, params);
  console.log(`[${label}] ${t.slice(0, 250)}`);
}

async function main() {
  const model = process.argv[2] || "grok-video-3";

  // 1) 空 params -> 看必填字段
  await tryProbe(model, {}, "empty");
  // 2) 加 image_urls
  await tryProbe(model, { image_urls: [FRAME] }, "image_urls");
  // 3) 加 image
  await tryProbe(model, { image: FRAME }, "image");
  // 4) 加 images 数组
  await tryProbe(model, { images: [FRAME] }, "images");
  // 5) image_urls + duration int
  await tryProbe(model, { image_urls: [FRAME], duration: 8 }, "image_urls + duration int");
  // 6) image_urls + duration int + aspect_ratio
  await tryProbe(model, {
    image_urls: [FRAME],
    duration: 8,
    aspect_ratio: "16:9",
  }, "image_urls + duration int + aspect");
  // 7) 通用全字段
  await tryProbe(model, {
    image_urls: [FRAME],
    images: [FRAME],
    image: FRAME,
    duration: 8,
    aspect_ratio: "16:9",
    size: "720P",
  }, "kitchen sink");
  // 8) 试 generation_mode (沿用之前 veo 找到的合法值)
  await tryProbe(model, {
    image_urls: [FRAME],
    duration: 8,
    aspect_ratio: "16:9",
    generation_mode: "fast",
  }, "+ generation_mode=fast");

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
