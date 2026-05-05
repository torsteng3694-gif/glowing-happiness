/**
 * 从剧�?LLM 抽取资产清单（角�?/ 场景 / 道具�?
 *
 * POST /api/comic/assets/extract
 *   body: { script: string, style?: string }
 *
 * 返回:
 *   {
 *     characters: { name: string; description: string; imagePrompt: string }[],
 *     scenes:     { name: string; description: string; imagePrompt: string }[],
 *     props:      { name: string; description: string; imagePrompt: string }[],
 *     cost: number, balance: number,
 *   }
 *
 * �?user 当前 comic_pipeline.llmSlug 来跑�?
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
TASK: Read the user's script and extract three groups of reusable visual assets:
  1. characters  �?named persons / creatures
  2. scenes      �?distinct locations / environments
  3. props       �?important interactable objects, weapons, artifacts

CRITICAL OUTPUT RULES (违反视为失败):
- Reply with NOTHING but a single valid JSON object. No prefix, no suffix, no markdown, no explanations, no code fences.
- Use double quotes. No trailing commas. No comments.

JSON schema:
{
  "characters": [
    {
      "name":         "string �?10 chars (中文优先)",
      "description":  "string �?外貌 / 性格 / 服饰 / 年龄等关键描�?,
      "imagePrompt":  "string �?适合用于角色立绘 / 三视图生成的中文提示词，<= 200 �?
    }
  ],
  "scenes": [
    {
      "name":         "string �?10 chars",
      "description":  "string �?时代 / 氛围 / 关键视觉元素",
      "imagePrompt":  "string �?适合用于场景图生成的中文提示�?
    }
  ],
  "props": [
    {
      "name":         "string �?10 chars",
      "description":  "string �?形�?/ 材质 / 用�?,
      "imagePrompt":  "string �?适合用于道具图生成的中文提示�?
    }
  ]
}

Content rules:
- Avoid duplicates; each asset only once.
- 角色必须出场被叫到名字（含旁�?Narrator）才列入；只在背景一闪而过的不要列�?
- 场景至少要出现剧情；同一地点不同时间合并为一个�?
- 道具：优先关键武器、法宝、剧情触发物、饰品。普通日用物不列�?
- imagePrompt 不要带画风字段（画风由系统拼接），其它细节越具体越好�?
- 不超过：characters �?12，scenes �?10，props �?10�?

Output: ONLY the JSON. Begin with { and end with }.`;

function buildUserPrompt(script: string, style?: string): string {
  const lines: string[] = [];
  if (style) lines.push(`视频风格�?{style}`);
  lines.push("剧本原文�?, script);
  return lines.join("\n");
}

function cleanupJsonLike(slice: string): string {
  return slice
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u300C\u300E]/g, '"')
    .replace(/[\u300D\u300F]/g, '"')
    .replace(/[\uFEFF\u200B-\u200D]/g, "")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/\r?\n/g, "\\n"))
    .replace(/,(\s*[}\]])/g, "$1");
}

function extractJson(s: string): unknown {
  const tryParse = (raw: string): unknown | null => {
    try { return JSON.parse(raw); } catch { return null; }
  };
  const text = s.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  const a = tryParse(text);
  if (a !== null) return a;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const r = tryParse(fenced[1].trim()) ?? tryParse(cleanupJsonLike(fenced[1].trim()));
    if (r !== null) return r;
  }
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i >= 0 && j > i) {
    const slice = text.slice(i, j + 1);
    const r = tryParse(slice) ?? tryParse(cleanupJsonLike(slice));
    if (r !== null) return r;
  }
  throw new Error("LLM 返回内容无法解析�?JSON");
}

type Item = { name: string; description: string; imagePrompt: string };

function normalizeList(raw: unknown, max: number): Item[] {
  if (!Array.isArray(raw)) return [];
  const out: Item[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    const name = String(v.name ?? "").trim().slice(0, 10);
    if (!name) continue;
    out.push({
      name,
      description: String(v.description ?? "").trim().slice(0, 400),
      imagePrompt: String(v.imagePrompt ?? v.image_prompt ?? "").trim().slice(0, 400),
    });
    if (out.length >= max) break;
  }
  return out;
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
          { role: "user", content: buildUserPrompt(script, style) },
        ],
        temperature: 0.4,
        maxTokens: 4500,
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
  let parsed: unknown = null;
  try {
    parsed = extractJson(buffer);
  } catch {
    try {
      const retry = await callLLM(
        "STRICT JSON ONLY. Do NOT wrap in markdown. The very first character of your reply MUST be '{' and the very last character MUST be '}'.",
      );
      buffer = retry;
      parsed = extractJson(retry);
    } catch (e) {
      console.error("[comic/assets/extract] parse failed:", e);
      return NextResponse.json(
        { error: `LLM 返回格式不合法：${e instanceof Error ? e.message : String(e)}`, rawSample: buffer.slice(0, 1500) },
        { status: 502 },
      );
    }
  }

  const root = (parsed && typeof parsed === "object") ? (parsed as Record<string, unknown>) : {};
  const characters = normalizeList(root.characters, 12);
  const scenes = normalizeList(root.scenes, 10);
  const props = normalizeList(root.props, 10);

  // 计费
  const billing = await chargeUsage({
    userId: session.id,
    modelId: model.id,
    channelId: channel.id,
    type: "chat",
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startTs,
    meta: {
      source: "comic-assets-extract",
      scriptLen: cpLen,
      counts: { characters: characters.length, scenes: scenes.length, props: props.length },
    },
  }).catch((e) => {
    console.warn("[comic/assets/extract] charge failed:", e);
    return { cost: 0, balance: 0 };
  });

  return NextResponse.json({
    characters,
    scenes,
    props,
    cost: billing.cost,
    balance: billing.balance,
    pipeline,
  });
}
