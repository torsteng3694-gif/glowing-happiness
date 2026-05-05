/**
 * 剧本拆分接口
 *
 * POST /api/comic/scenes/draft
 *   body: {
 *     script: string,         // 必填，原始剧本文�?
 *     style?: string,         // 风格描述，例�?"2D动画" / "真人写实"
 *     targetSceneCount?: number, // 期望分镜数；不传�?LLM 自行决定
 *     characters?: { name: string; description?: string }[], // 可选，已有的角色清单（�?LLM 复用名字�?
 *   }
 *
 * 返回 { scenes: SceneDraft[], characters: { name, description }[] }
 *
 * SceneDraft 结构�?
 *   {
 *     index: number,             // 1-based
 *     description: string,       // 画面描述（用�?image / video prompt�?
 *     dialog: string,            // 台词（可空字符串，表示纯画面无对白）
 *     speaker?: string,          // 说话角色名（dialog 非空时建议给�?
 *     emotion?: string,          // 情绪 hint
 *     suggestedDurationSec?: number, // 推荐时长�?/8/10�?
 *     transitionHint?: string,   // 与下一镜的转场提示，用于尾帧生�?
 *   }
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routeChat } from "@/lib/providers";
import { resolveChannelsForCall } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";
import { getUserComicPipeline } from "@/lib/comic-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const SYSTEM_PROMPT = `You are a comic-explain video director assistant.
Task: split the user-provided script into per-shot "scenes" that can be sent to image and video models one by one.

CRITICAL OUTPUT RULES (违反则视为失�?:
1. Reply with NOTHING but a single valid JSON object. No prefix, no suffix, no markdown, no explanations, no code fences.
2. Use double quotes for ALL strings. Never trailing commas. Never comments.
3. All field names must match exactly (case-sensitive).

JSON schema:
{
  "characters": [ { "name": "string", "description": "string" } ],
  "scenes": [
    {
      "index": 1,                                 // 1-based, integer
      "description": "string (vivid visual: subject + action + scene + lighting + camera)",
      "dialog": "string (may be empty)",
      "speaker": "string (character name; required if dialog is non-empty)",
      "emotion": "happy|sad|angry|fearful|disgusted|surprised|calm",
      "suggestedDurationSec": 5,                  // integer, MUST be one of [5, 8, 10]
      "transitionHint": "string (how this shot transitions visually into the next)"
    }
  ]
}

Content rules:
- Each scene = one image-able shot + at most one dialog line (15-40 chars per shot for natural pacing).
- description must be in 中文 if the input script is Chinese; concrete and visual, no abstract feelings.
- Identify ALL named speakers (including 旁白 / Narrator) and put them in characters with short visual + personality description.
- If user provided existing characters, REUSE the same names without renaming.

Output: ONLY the JSON. Begin with { and end with }.`;

function buildUserPrompt(opts: {
  script: string;
  style?: string;
  targetSceneCount?: number;
  characters?: { name: string; description?: string }[];
}): string {
  const lines: string[] = [];
  if (opts.style) lines.push(`视频风格�?{opts.style}`);
  if (opts.targetSceneCount) lines.push(`期望分镜数：�?${opts.targetSceneCount} 个`);
  if (opts.characters && opts.characters.length > 0) {
    lines.push(`已有角色（请尽量复用名字，不要重命名）：`);
    for (const c of opts.characters) {
      lines.push(`- ${c.name}${c.description ? "�? + c.description : ""}`);
    }
  }
  lines.push("", "剧本原文�?, opts.script);
  return lines.join("\n");
}

/**
 * �?LLM 的回复里抽出 JSON 块。多级容错策略：
 *   1. 直接 JSON.parse 整段
 *   2. 抽取 ```json ...``` 围栏
 *   3. 抽取 ``` ...``` 通用围栏
 *   4. 取第一�?{ 到最后一�?} 的子�?
 *   5. 上面拿到的子串里把常见的 LLM 坏字符清洗：未转义换行、智能引号、尾随逗号
 */
function cleanupJsonLike(slice: string): string {
  return (
    slice
      // 智能引号 �?直引�?
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      // 中文标点的引号当字符串包裹用，转成英文双引号
      .replace(/[\u300C\u300E]/g, '"')
      .replace(/[\u300D\u300F]/g, '"')
      // 删除 BOM / 零宽 / 不可见控制字�?
      .replace(/[\uFEFF\u200B-\u200D]/g, "")
      // 行尾注释  // xxx
      .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1")
      // 块注�?/* ... */
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // 字符串里的真实换�?�?\n（仅在被双引号包裹的范围内做最小替换）
      .replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/\r?\n/g, "\\n"))
      // 数组/对象尾随逗号  ,]  ,}
      .replace(/,(\s*[}\]])/g, "$1")
  );
}

function extractJson(s: string): unknown {
  const tryParse = (raw: string): unknown | null => {
    try { return JSON.parse(raw); } catch { return null; }
  };

  // 0) 去掉 LLM 偶发�?BOM、回车、首尾空�?
  const text = s.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();

  // 1) 整段
  const a = tryParse(text);
  if (a !== null) return a;

  // 2) ```json ... ```
  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson) {
    const raw = fencedJson[1].trim();
    const r = tryParse(raw) ?? tryParse(cleanupJsonLike(raw));
    if (r !== null) return r;
  }

  // 3) ``` ... ```
  const fenced = text.match(/```\s*([\s\S]*?)```/);
  if (fenced) {
    const raw = fenced[1].trim();
    const r = tryParse(raw) ?? tryParse(cleanupJsonLike(raw));
    if (r !== null) return r;
  }

  // 4) 第一�?{ 到最后一�?}
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i >= 0 && j > i) {
    const slice = text.slice(i, j + 1);
    const r = tryParse(slice) ?? tryParse(cleanupJsonLike(slice));
    if (r !== null) return r;

    // 4b) 截断兜底：尾部可能被截断了，尝试逐步去尾�?parse
    let s2 = slice;
    for (let k = 0; k < 12 && s2.length > 32; k++) {
      s2 = s2.slice(0, -1);
      const r3 = tryParse(cleanupJsonLike(s2 + "}"));
      if (r3 !== null) return r3;
    }
  }

  throw new Error("LLM 返回内容无法解析�?JSON");
}

type SceneDraft = {
  index: number;
  description: string;
  dialog: string;
  speaker?: string;
  emotion?: string;
  suggestedDurationSec?: number;
  transitionHint?: string;
};

function normalizeScenes(raw: unknown): {
  scenes: SceneDraft[];
  characters: { name: string; description: string }[];
} {
  if (!raw || typeof raw !== "object") throw new Error("LLM 返回不是 JSON 对象");
  const r = raw as Record<string, unknown>;
  const rawScenes = Array.isArray(r.scenes) ? r.scenes : [];
  const scenes: SceneDraft[] = rawScenes
    .map((s: any, i: number): SceneDraft | null => {
      if (!s || typeof s !== "object") return null;
      const description = String(s.description ?? "").trim();
      if (!description) return null;
      const dialog = String(s.dialog ?? "").trim();
      const dur = Number(s.suggestedDurationSec ?? s.duration_sec ?? 8);
      return {
        index: Number(s.index ?? i + 1),
        description,
        dialog,
        speaker: typeof s.speaker === "string" ? s.speaker.trim() || undefined : undefined,
        emotion: typeof s.emotion === "string" ? s.emotion.trim().toLowerCase() || undefined : undefined,
        suggestedDurationSec:
          Number.isFinite(dur) && dur > 0 ? Math.max(5, Math.min(10, Math.round(dur))) : 8,
        transitionHint:
          typeof s.transitionHint === "string" ? s.transitionHint.trim() || undefined : undefined,
      };
    })
    .filter((x: SceneDraft | null): x is SceneDraft => x !== null)
    .map((s, i) => ({ ...s, index: i + 1 }));

  const rawChars = Array.isArray(r.characters) ? r.characters : [];
  const characters = rawChars
    .map((c: any) => {
      if (!c || typeof c !== "object") return null;
      const name = String(c.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        description: String(c.description ?? "").trim(),
      };
    })
    .filter((x: { name: string; description: string } | null): x is { name: string; description: string } => x !== null);

  return { scenes, characters };
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体非�? }, { status: 400 });
  }
  const script = typeof body.script === "string" ? body.script : "";
  const cpLen = [...script].length;
  if (cpLen < 30 || cpLen > 5000) {
    return NextResponse.json({ error: "script 必须 30-5000 �? }, { status: 400 });
  }
  const style = typeof body.style === "string" ? body.style.slice(0, 30) : undefined;
  const targetSceneCount = Number.isFinite(Number(body.targetSceneCount))
    ? Math.max(1, Math.min(50, Math.round(Number(body.targetSceneCount))))
    : undefined;
  const characters = Array.isArray(body.characters)
    ? body.characters
        .filter((c: any) => c && typeof c === "object" && typeof c.name === "string")
        .map((c: any) => ({ name: String(c.name).trim(), description: c.description ? String(c.description) : undefined }))
    : undefined;

  // 找到管线里配置的 LLM 模型（用户私�?> 全局默认�?
  const pipeline = await getUserComicPipeline(session.id);
  const model = await prisma.model.findUnique({
    where: { slug: pipeline.llmSlug },
    include: { provider: true },
  });
  if (!model || model.type !== "chat" || !model.enabled) {
    return NextResponse.json(
      { error: `LLM 模型 '${pipeline.llmSlug}' 不可用，请到 /admin/comic-pipeline 配置` },
      { status: 503 },
    );
  }
  const { primary: channel } = await resolveChannelsForCall({
    apiKeyId: null,
    modelId: model.id,
    preferredChannelId: null,
  });
  if (!channel) {
    return NextResponse.json(
      { error: `LLM 模型 '${pipeline.llmSlug}' 没有可用渠道` },
      { status: 503 },
    );
  }

  // �?LLM（流式收集成完整字符串）。TS 在内�?async 函数里会丢失 `model` 的非空窄化，
  // 这里固化�?const 让闭包内可放心用�?
  const llmModel = model;
  const llmChannel = channel;
  const startTs = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  async function callLLM(extraSystem?: string): Promise<string> {
    let buf = "";
    for await (const chunk of routeChat(
      {
        model: llmModel.slug,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + (extraSystem ? "\n\n" + extraSystem : "") },
          { role: "user", content: buildUserPrompt({ script, style, targetSceneCount, characters }) },
        ],
        temperature: 0.4,
        maxTokens: 6000,
        stream: true,
      },
      llmModel.provider?.slug || "google",
      llmChannel,
    )) {
      if (chunk.delta) buf += chunk.delta;
      if (chunk.inputTokens) inputTokens = chunk.inputTokens;
      if (chunk.outputTokens) outputTokens = chunk.outputTokens;
      if (chunk.done) break;
    }
    return buf;
  }

  let buffer = "";
  try {
    buffer = await callLLM();
  } catch (e) {
    return NextResponse.json(
      { error: `LLM 调用失败�?{e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  let parsed: { scenes: SceneDraft[]; characters: { name: string; description: string }[] } | null = null;
  let parseErr: unknown = null;
  try {
    parsed = normalizeScenes(extractJson(buffer));
  } catch (e) {
    parseErr = e;
  }

  // 第二轮：解析失败，或解析成功�?scenes 为空 �?用更强的"只输�?JSON"提示重试一�?
  if (!parsed || parsed.scenes.length === 0) {
    console.warn(
      "[comic/scenes/draft] first attempt unusable, retrying. err=",
      parseErr instanceof Error ? parseErr.message : parseErr,
    );
    try {
      const retryBuffer = await callLLM(
        "STRICT JSON ONLY. Do NOT wrap in markdown. Do NOT add commentary. The very first character of your reply MUST be '{' and the very last character MUST be '}'.",
      );
      buffer = retryBuffer;
      parsed = normalizeScenes(extractJson(retryBuffer));
      parseErr = null;
    } catch (e) {
      parseErr = e;
    }
  }

  if (!parsed) {
    console.error("[comic/scenes/draft] parse failed:", parseErr instanceof Error ? parseErr.message : parseErr);
    console.error("[comic/scenes/draft] raw LLM output (first 4000 chars):\n" + buffer.slice(0, 4000));
    return NextResponse.json(
      {
        error: `LLM 返回格式不合法：${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        rawSample: buffer.slice(0, 1500),
        hint: "请检查所�?LLM 是否能稳定输�?JSON。建议换更强的模型或重试�?,
      },
      { status: 502 },
    );
  }
  if (parsed.scenes.length === 0) {
    console.error("[comic/scenes/draft] empty scenes; raw:\n" + buffer.slice(0, 4000));
    return NextResponse.json(
      {
        error: "LLM 没有生成任何分镜，请尝试更具体的剧本或重新提�?,
        rawSample: buffer.slice(0, 1500),
      },
      { status: 502 },
    );
  }

  // 计费（chat token�?
  const billing = await chargeUsage({
    userId: session.id,
    modelId: model.id,
    channelId: channel.id,
    type: "chat",
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startTs,
    meta: { source: "comic-scenes-draft", scriptLen: cpLen, scenesCount: parsed.scenes.length },
  }).catch((e) => {
    console.warn("[comic/scenes/draft] charge failed:", e);
    return { cost: 0, balance: 0 };
  });

  console.log(
    `[comic/scenes/draft] OK scenes=${parsed.scenes.length} chars=${parsed.characters.length} model=${model.slug}`,
  );
  return NextResponse.json({
    scenes: parsed.scenes,
    characters: parsed.characters,
    cost: billing.cost,
    balance: billing.balance,
    pipeline,
  });
}
