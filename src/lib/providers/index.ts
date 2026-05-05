import type {
  ChatOptions,
  ChatChunk,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  AudioOptions,
  AudioResult,
} from "./types";
import { mockChat, mockImage, mockVideo, mockAudio } from "./mock";
import { openAIChat } from "./openai";
import { anthropicChat } from "./anthropic";
import { googleChat } from "./google";
import { upstreamChat, upstreamImage, upstreamVideo, upstreamAudio } from "./upstream-ai6700";
import { getUpstream, toUpstreamConfig, type UpstreamConfig } from "../upstream";
import type { ChannelWithUpstream } from "../channels";

export function isMock(): boolean {
  return (process.env.MOCK_PROVIDERS ?? "true").toLowerCase() !== "false";
}

function channelToUpstreamConfig(ch: ChannelWithUpstream): UpstreamConfig {
  const base = toUpstreamConfig(ch.upstream);
  // 渠道自带的 apiKey 优先于上游默认 key（用于"同一 baseUrl 下多 key、每 key 不同价格"场景）
  if (ch.apiKey && ch.apiKey.trim()) {
    return { ...base, apiKey: ch.apiKey.trim() };
  }
  return base;
}

/** 如渠道配置了 upstreamModelSlug，用它覆盖传给上游的 model 名 */
function applyChannelModel<T extends { model: string }>(opts: T, ch: ChannelWithUpstream): T {
  return ch.upstreamModelSlug ? { ...opts, model: ch.upstreamModelSlug } : opts;
}

/* =================== Chat =================== */

export async function* routeChat(
  opts: ChatOptions,
  providerSlug: string,
  channel?: ChannelWithUpstream | null,
  fallbackChannels?: ChannelWithUpstream[],
): AsyncGenerator<ChatChunk> {
  // 1) 显式指定了 channel：优先走渠道对应的上游
  if (channel && channel.upstream.enabled) {
    const tries: ChannelWithUpstream[] = [channel];
    if (channel.enableFallback && fallbackChannels?.length) {
      for (const c of fallbackChannels) {
        if (c.id !== channel.id && c.upstream.enabled) tries.push(c);
      }
    }
    let lastErr: unknown;
    for (const c of tries) {
      try {
        yield* upstreamChat(applyChannelModel(opts, c), channelToUpstreamConfig(c));
        return;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        yield { delta: `\n\n[渠道 ${c.name} 调用失败：${msg}，尝试下一渠道…]`, done: false };
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    yield { delta: `\n\n[全部渠道均失败：${msg}]`, done: false };
    yield { delta: "", done: true };
    return;
  }

  // 2) 未指定渠道：走旧架构（default upstream / 原生厂商 key / mock）
  const up = await getUpstream();
  if (up && up.enabled) {
    try {
      yield* upstreamChat(opts, up);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      yield { delta: `\n\n[上游调用失败：${msg}]`, done: false };
      yield { delta: "", done: true };
      return;
    }
  }

  if (isMock()) {
    yield* mockChat(opts);
    return;
  }

  try {
    switch (providerSlug) {
      case "openai": {
        const k = process.env.OPENAI_API_KEY;
        if (!k) {
          yield* mockChat(opts);
          return;
        }
        yield* openAIChat(opts, k);
        return;
      }
      case "anthropic": {
        const k = process.env.ANTHROPIC_API_KEY;
        if (!k) {
          yield* mockChat(opts);
          return;
        }
        yield* anthropicChat(opts, k);
        return;
      }
      case "google": {
        const k = process.env.GOOGLE_API_KEY;
        if (!k) {
          yield* mockChat(opts);
          return;
        }
        yield* googleChat(opts, k);
        return;
      }
      case "deepseek": {
        const k = process.env.DEEPSEEK_API_KEY;
        if (!k) {
          yield* mockChat(opts);
          return;
        }
        yield* openAIChat(opts, k, process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1");
        return;
      }
      default:
        yield* mockChat(opts);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    yield { delta: `\n\n[调用出错：${msg}]`, done: false };
    yield { delta: "", done: true };
  }
}

/* =================== Image =================== */

export async function routeImage(
  opts: ImageOptions,
  providerSlug: string,
  channel?: ChannelWithUpstream | null,
  fallbackChannels?: ChannelWithUpstream[],
): Promise<ImageResult> {
  if (channel && channel.upstream.enabled) {
    const tries: ChannelWithUpstream[] = [channel];
    if (channel.enableFallback && fallbackChannels?.length) {
      for (const c of fallbackChannels) {
        if (c.id !== channel.id && c.upstream.enabled) tries.push(c);
      }
    }
    let lastErr: unknown;
    for (const c of tries) {
      try {
        const r = await upstreamImage(
          applyChannelModel(opts, c),
          channelToUpstreamConfig(c),
          opts.rawParams,
        );
        // 把真正服务成功的渠道 id 放进 meta，方便后置计费 / 审计
        return { ...r, meta: { ...(r.meta || {}), served_channel_id: c.id } };
      } catch (e) {
        lastErr = e;
        console.warn(`[routeImage] channel ${c.name} failed, trying next`, e);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  const up = await getUpstream();
  if (up && up.enabled) {
    console.log(`[routeImage] -> upstream ${up.baseUrl} model=${opts.model}`);
    return upstreamImage(opts, up, opts.rawParams);
  }
  console.log(`[routeImage] -> mock (upstream disabled) model=${opts.model}`);
  return mockImage(opts);
}

/* =================== Video =================== */

export async function routeVideo(
  opts: VideoOptions,
  providerSlug: string,
  channel?: ChannelWithUpstream | null,
  fallbackChannels?: ChannelWithUpstream[],
): Promise<VideoResult> {
  if (channel && channel.upstream.enabled) {
    const tries: ChannelWithUpstream[] = [channel];
    if (channel.enableFallback && fallbackChannels?.length) {
      for (const c of fallbackChannels) {
        if (c.id !== channel.id && c.upstream.enabled) tries.push(c);
      }
    }
    let lastErr: unknown;
    for (const c of tries) {
      try {
        const r = await upstreamVideo(
          applyChannelModel(opts, c),
          channelToUpstreamConfig(c),
          opts.rawParams,
        );
        return { ...r, meta: { ...(r.meta || {}), served_channel_id: c.id } };
      } catch (e) {
        lastErr = e;
        console.warn(`[routeVideo] channel ${c.name} failed, trying next`, e);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  const up = await getUpstream();
  if (up && up.enabled) {
    console.log(`[routeVideo] -> upstream ${up.baseUrl} model=${opts.model}`);
    return upstreamVideo(opts, up, opts.rawParams);
  }
  console.log(`[routeVideo] -> mock (upstream disabled) model=${opts.model}`);
  return mockVideo(opts);
}

/* =================== Audio =================== */

export async function routeAudio(
  opts: AudioOptions,
  providerSlug: string,
  channel?: ChannelWithUpstream | null,
  fallbackChannels?: ChannelWithUpstream[],
): Promise<AudioResult> {
  if (channel && channel.upstream.enabled) {
    const tries: ChannelWithUpstream[] = [channel];
    if (channel.enableFallback && fallbackChannels?.length) {
      for (const c of fallbackChannels) {
        if (c.id !== channel.id && c.upstream.enabled) tries.push(c);
      }
    }
    let lastErr: unknown;
    for (const c of tries) {
      try {
        const r = await upstreamAudio(
          applyChannelModel(opts, c),
          channelToUpstreamConfig(c),
          opts.rawParams,
        );
        return { ...r, meta: { ...(r.meta || {}), served_channel_id: c.id } };
      } catch (e) {
        lastErr = e;
        console.warn(`[routeAudio] channel ${c.name} failed, trying next`, e);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  const up = await getUpstream();
  if (up && up.enabled) {
    console.log(`[routeAudio] -> upstream ${up.baseUrl} model=${opts.model}`);
    return upstreamAudio(opts, up, opts.rawParams);
  }
  console.log(`[routeAudio] -> mock (upstream disabled) model=${opts.model}`);
  return mockAudio(opts);
}
