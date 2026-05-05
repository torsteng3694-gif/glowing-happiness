/** 探测 ai6700 平台 veo3.1 generation_mode 的合法值 */
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
const FRAME = "https://cos.lingkeai.vip/uploads/2026.04/27/20260427160917_18aa2857167a75dcba75.jpg";

const CANDIDATES = [
  "frame",
  "reference",
  "image_to_video",
  "text_to_video",
  "i2v",
  "t2v",
  "img2vid",
  "txt2vid",
  "first_frame",
  "last_frame",
  "first_last_frame",
  "imageToVideo",
  "textToVideo",
  "image",
  "text",
  "key_frame",
  "single",
  "multi",
  "FL",
  "TF",
  "首帧",
  "首尾帧",
  "图生视频",
  "文生视频",
  "first",
  "last",
  "tail",
  "head",
  "1",
  "2",
  "3",
];

async function probe(mode: string): Promise<{ ok: boolean; raw: string }> {
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "veo3.1",
        prompt: "test cat",
        count: 1,
        params: {
          generation_mode: mode,
          image_urls: [FRAME],
          duration: "8",
          aspect_ratio: "16:9",
        },
      }),
    });
    const text = await res.text();
    const ok = !/不合法|invalid|missing|缺少/i.test(text);
    return { ok, raw: text };
  } catch (e) {
    return { ok: false, raw: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  for (const c of CANDIDATES) {
    const r = await probe(c);
    console.log(`[${c.padEnd(18)}] ${r.raw.slice(0, 200)}`);
    if (r.ok) {
      console.log("\n>>> 合法值找到了：", c);
      // 但仍然可能是其他错误（如缺少其他参数），不立刻 break
    }
    // 避免被 rate limit
    await new Promise((r) => setTimeout(r, 300));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
