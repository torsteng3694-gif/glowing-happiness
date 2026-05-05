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
  "TEXT_2_VIDEO",
  "FIRST_AND_LAST_FRAMES_2_VIDEO",
  "REFERENCE_2_VIDEO",
  "TEXT_TO_VIDEO",
  "IMAGE_TO_VIDEO",
];

async function probe(mode: string): Promise<{ raw: string; status: number }> {
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
  const text = await res.text();
  return { status: res.status, raw: text };
}

async function main() {
  for (const c of CANDIDATES) {
    const r = await probe(c);
    console.log(`[${c.padEnd(35)}] http=${r.status} ${r.raw.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
