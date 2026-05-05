import type {
  ChatOptions, ChatChunk,
  ImageOptions, ImageResult,
  VideoOptions, VideoResult,
  AudioOptions, AudioResult,
} from "./types";

const SAMPLE_REPLIES = [
  "你好！我是 AI Hub 平台聚合的助手。你可以在这里调用全球所有主流的大模型，只需要一次充值，就能用遍 OpenAI、Claude、Gemini、DeepSeek 等各家模型。",
  "这是一个精心设计的 AI 聚合平台演示。你看到的这段文字是 mock 模式生成的示例回复 —— 在 .env 中把 MOCK_PROVIDERS 设为 false，并填入对应的 API Key，即可真实调用。",
  "在 AI Hub 里，我们帮你屏蔽了各家不同的接口差异。你用 OpenAI 兼容格式即可调用所有模型，平台会自动按实际用量扣费，非常方便。",
];

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function* mockChat(opts: ChatOptions): AsyncGenerator<ChatChunk> {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const seed = lastUser?.content?.slice(0, 30) || "";
  const reply = `收到你的输入："${seed}${seed.length > 28 ? "..." : ""}"。\n\n${pick(SAMPLE_REPLIES)}\n\n模型：${opts.model}\n（当前为演示模式，真实部署请在 .env 中配置 API Key）`;

  const inputTokens = Math.max(1, Math.floor(JSON.stringify(opts.messages).length / 4));
  let outputTokens = 0;
  const tokens = reply.split("");
  for (const t of tokens) {
    await new Promise((r) => setTimeout(r, 12));
    outputTokens++;
    yield { delta: t, done: false };
  }
  yield { delta: "", done: true, inputTokens, outputTokens: Math.max(1, Math.floor(reply.length / 4)) };
}

export async function mockImage(opts: ImageOptions): Promise<ImageResult> {
  await new Promise((r) => setTimeout(r, 800));
  const n = opts.n ?? 1;
  const [w = "1024", h = "1024"] = (opts.size ?? "1024x1024").split("x");
  const images = Array.from({ length: n }).map((_, i) => ({
    // 使用 picsum 的随机图作为占位，真实接入后替换
    url: `https://picsum.photos/seed/${encodeURIComponent(opts.prompt + i + Date.now())}/${w}/${h}`,
  }));
  return { images, meta: { mock: true, model: opts.model, prompt: opts.prompt } };
}

export async function mockVideo(opts: VideoOptions): Promise<VideoResult> {
  await new Promise((r) => setTimeout(r, 1500));
  const duration = opts.duration ?? 5;
  return {
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    coverUrl: `https://picsum.photos/seed/${encodeURIComponent(opts.prompt + Date.now())}/1280/720`,
    duration,
    meta: { mock: true, model: opts.model, prompt: opts.prompt },
  };
}

export async function mockAudio(opts: AudioOptions): Promise<AudioResult> {
  await new Promise((r) => setTimeout(r, 600));
  const duration = opts.duration ?? 10;
  return {
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    duration,
    format: "mp3",
    meta: { mock: true, model: opts.model, prompt: opts.prompt || opts.text || "" },
  };
}
