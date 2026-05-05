import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
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

const CANDIDATES = [
  // 已知合法值，检查它们对图生视频的差异
  "components",
  "pro",
  "fast",
  "标准",
  // 找其他合法值
  "lite",
  "quality",
  "super",
  "premium",
  "高级",
  "高品质",
  "极速",
  "首帧图",
  "首尾",
  "尾帧",
  "首尾图",
  "frames-2",
  "frame",
  "F",
  "C",
  "P",
  "S",
  "fram",
  "fram-1",
  "veo3.1-fast",
  "veo3.1-pro",
  "veo3.1-frames",
];

const FRAME = "https://cos.lingkeai.vip/uploads/2026.04/27/20260427160917_18aa2857167a75dcba75.jpg";
async function probe(mode: string) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "veo3.1",
      prompt: "test cat sitting in a meadow",
      count: 1,
      params: {
        generation_mode: mode,
        image_urls: [FRAME],
        duration: "8",
        aspect_ratio: "16:9",
      },
    }),
  });
  return await res.text();
}

async function main() {
  for (const c of CANDIDATES) {
    const r = await probe(c);
    console.log(`[${c.padEnd(20)}] ${r.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 350));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
