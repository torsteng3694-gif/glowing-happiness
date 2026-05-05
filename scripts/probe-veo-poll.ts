/** 创建任务 + 轮询查看结果 */
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
// 用我们自己的 COS 域名（验证 ai6700 能访问到）
const FRAME = "https://ai-hub-1335106858.cos.ap-nanjing.myqcloud.com/ai-hub/test/1777279819939-9hueo2p8.png";

async function create(generationMode: string) {
  const body = {
    model: "veo3.1",
    prompt:
      "A chubby orange-and-white tabby cat slowly walking through a sunlit meadow, gentle breeze, cinematic warm light",
    count: 1,
    params: {
      generation_mode: generationMode,
      image_urls: [FRAME],
      duration: 8,
      aspect_ratio: "16:9",
    },
  };
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function poll(taskId: number) {
  const res = await fetch(`https://api.ai6700.com/v1/media/status?task_id=${taskId}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  return await res.json();
}

async function main() {
  // 先用 fast 试，省钱
  const mode = process.argv[2] || "fast";
  console.log(`创建 mode=${mode}`);
  const created = await create(mode);
  console.log("提交结果:", JSON.stringify(created));
  const taskId =
    (created as any)?.data?.task_id ?? (created as any)?.data?.["任务ids"]?.[0];
  if (!taskId) {
    console.log("无 task_id");
    return;
  }
  console.log(`等待 task_id=${taskId}`);
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < 10 * 60 * 1000) {
    attempt++;
    await new Promise((r) => setTimeout(r, 5000));
    const st = await poll(taskId);
    const body = (st as any)?.data ?? st;
    const state = body?.state || body?.status;
    const isFinal = body?.is_final;
    const progress = body?.progress;
    const urls =
      body?.result_urls ??
      (body?.result_url ? [body.result_url] : []) ??
      [];
    console.log(
      `[${attempt}] state=${state} is_final=${isFinal} progress=${progress} urls=${JSON.stringify(urls)} err=${body?.error || ""}`,
    );
    if (isFinal || state === "success" || state === "failed") {
      console.log("最终响应:", JSON.stringify(st).slice(0, 800));
      break;
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
