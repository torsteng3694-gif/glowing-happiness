/**
 * 浠庡墽鏈?LLM 鎶藉彇璧勪骇娓呭崟锛堣鑹?/ 鍦烘櫙 / 閬撳叿锛?
 *
 * POST /api/comic/assets/extract
 *   body: { script: string, style?: string }
 *
 * 杩斿洖:
 *   {
 *     characters: { name: string; description: string; imagePrompt: string }[],
 *     scenes:     { name: string; description: string; imagePrompt: string }[],
 *     props:      { name: string; description: string; imagePrompt: string }[],
 *     cost: number, balance: number,
 *   }
 *
 * 鐢?user 褰撳墠 comic_pipeline.llmSlug 鏉ヨ窇銆?
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
  1. characters  鈥?named persons / creatures
  2. scenes      鈥?distinct locations / environments
  3. props       鈥?important interactable objects, weapons, artifacts

CRITICAL OUTPUT RULES (杩濆弽瑙嗕负澶辫触):
- Reply with NOTHING but a single valid JSON object. No prefix, no suffix, no markdown, no explanations, no code fences.
- Use double quotes. No trailing commas. No comments.

JSON schema:
{
  "characters": [
    {
      "name":         "string 鈮?10 chars (涓枃浼樺厛)",
      "description":  "string 鈥?澶栬矊 / 鎬ф牸 / 鏈嶉グ / 骞撮緞绛夊叧閿弿杩?,
      "imagePrompt":  "string 鈥?閫傚悎鐢ㄤ簬瑙掕壊绔嬬粯 / 涓夎鍥剧敓鎴愮殑涓枃鎻愮ず璇嶏紝<= 200 瀛?
    }
  ],
  "scenes": [
    {
      "name":         "string 鈮?10 chars",
      "description":  "string 鈥?鏃朵唬 / 姘涘洿 / 鍏抽敭瑙嗚鍏冪礌",
      "imagePrompt":  "string 鈥?閫傚悎鐢ㄤ簬鍦烘櫙鍥剧敓鎴愮殑涓枃鎻愮ず璇?
    }
  ],
  "props": [
    {
      "name":         "string 鈮?10 chars",
      "description":  "error",
      "imagePrompt":  "string 鈥?閫傚悎鐢ㄤ簬閬撳叿鍥剧敓鎴愮殑涓枃鎻愮ず璇?
    }
  ]
}

Content rules:
- Avoid duplicates; each asset only once.
- 瑙掕壊蹇呴』鍑哄満琚彨鍒板悕瀛楋紙鍚梺鐧?Narrator锛夋墠鍒楀叆锛涘彧鍦ㄨ儗鏅竴闂?岃繃鐨勪笉瑕佸垪銆?
- 鍦烘櫙鑷冲皯瑕佸嚭鐜板墽鎯咃紱鍚屼竴鍦扮偣涓嶅悓鏃堕棿鍚堝苟涓轰竴涓??
- 閬撳叿锛氫紭鍏堝叧閿鍣ㄣ?佹硶瀹濄?佸墽鎯呰Е鍙戠墿銆侀グ鍝併?傛櫘閫氭棩鐢ㄧ墿涓嶅垪銆?
- imagePrompt 涓嶈甯︾敾椋庡瓧娈碉紙鐢婚鐢辩郴缁熸嫾鎺ワ級锛屽叾瀹冪粏鑺傝秺鍏蜂綋瓒婂ソ銆?
- 涓嶈秴杩囷細characters 鈮?12锛宻cenes 鈮?10锛宲rops 鈮?10銆?

Output: ONLY the JSON. Begin with { and end with }.`;

function buildUserPrompt(script: string, style?: string): string {
  const lines: string[] = [];
  if (style) lines.push(`瑙嗛椋庢牸锛?{style}`);
  lines.push("鍓ф湰鍘熸枃锛?, script);
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
  throw new Error("LLM 杩斿洖鍐呭鏃犳硶瑙ｆ瀽涓?JSON");
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
    return NextResponse.json({ error: "error" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "璇锋眰浣撻潪娉? }, { status: 400 });
  }
  const script = typeof body.script === "string" ? body.script : "";
  const cpLen = [...script].length;
  if (cpLen < 30 || cpLen > 5000) {
    return NextResponse.json({ error: "script 蹇呴』 30-5000 瀛? }, { status: 400 });
  }
  const style = typeof body.style === "string" ? body.style.slice(0, 30) : undefined;

  const pipeline = await getUserComicPipeline(session.id);
  const model = await prisma.model.findUnique({
    where: { slug: pipeline.llmSlug },
    include: { provider: true },
  });
  if (!model || model.type !== "chat" || !model.enabled) {
    return NextResponse.json(
      { error: `LLM 妯″瀷 '${pipeline.llmSlug}' 涓嶅彲鐢紝璇峰埌 /admin/comic-pipeline 閰嶇疆` },
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
      { error: `LLM 妯″瀷 '${pipeline.llmSlug}' 娌℃湁鍙敤娓犻亾` },
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
      { error: `LLM 璋冪敤澶辫触锛?{e instanceof Error ? e.message : String(e)}` },
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
        { error: `LLM 杩斿洖鏍煎紡涓嶅悎娉曪細${e instanceof Error ? e.message : String(e)}`, rawSample: buffer.slice(0, 1500) },
        { status: 502 },
      );
    }
  }

  const root = (parsed && typeof parsed === "object") ? (parsed as Record<string, unknown>) : {};
  const characters = normalizeList(root.characters, 12);
  const scenes = normalizeList(root.scenes, 10);
  const props = normalizeList(root.props, 10);

  // 璁¤垂
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
