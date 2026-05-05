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
const FRAME = "https://cos.lingkeai.vip/uploads/2026.04/27/20260427160917_18aa2857167a75dcba75.jpg";

async function tryUrl(url: string, body: object) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`[${url}] http=${res.status}`);
    console.log(`  body: ${JSON.stringify(body).slice(0, 200)}`);
    console.log(`  response: ${text.slice(0, 500)}`);
  } catch (e) {
    console.log(`[${url}] error:`, e instanceof Error ? e.message : e);
  }
  console.log("");
}

async function main() {
  // 试一：lingke 的原生格式（不带 generation_mode），走 /v1/video/create
  await tryUrl("https://api.ai6700.com/v1/video/create", {
    model: "veo3-pro-frames",
    prompt: "a cat walking",
    images: [FRAME],
    enhance_prompt: true,
    enable_upsample: false,
    aspect_ratio: "16:9",
  });

  // 试二：同一格式，走 /v1/media/generate
  await tryUrl("https://api.ai6700.com/v1/media/generate", {
    model: "veo3-pro-frames",
    prompt: "a cat walking",
    params: {
      images: [FRAME],
      aspect_ratio: "16:9",
      enhance_prompt: true,
    },
    count: 1,
  });

  // 试三：veo3.1 + 不带 generation_mode 看是否同样必填
  await tryUrl("https://api.ai6700.com/v1/media/generate", {
    model: "veo3.1",
    prompt: "a cat walking",
    params: {
      images: [FRAME],
      aspect_ratio: "16:9",
    },
    count: 1,
  });

  // 试四：veo3.1 + 不带任何参考图
  await tryUrl("https://api.ai6700.com/v1/media/generate", {
    model: "veo3.1",
    prompt: "a cat walking in a garden",
    params: {
      aspect_ratio: "16:9",
      duration: "8",
    },
    count: 1,
  });

  // 试五：veo3 -> 看下是否需要 generation_mode
  await tryUrl("https://api.ai6700.com/v1/media/generate", {
    model: "veo3-fast",
    prompt: "a cat walking in a garden",
    params: {
      aspect_ratio: "16:9",
      duration: "8",
    },
    count: 1,
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
