/**
 * 鍓ф湰鎷嗗垎鎺ュ彛
 *
 * POST /api/comic/scenes/draft
 *   body: {
 *     script: string,         // 蹇呭～锛屽師濮嬪墽鏈枃鏈?
 *     style?: string,         // 椋庢牸鎻忚堪锛屼緥濡?"2D鍔ㄧ敾" / "error"
 *     targetSceneCount?: number, // 鏈熸湜鍒嗛暅鏁帮紱涓嶄紶鍒?LLM 鑷鍐冲畾
 *     characters?: { name: string; description?: string }[], // 鍙?夛紝宸叉湁鐨勮鑹叉竻鍗曪紙璁?LLM 澶嶇敤鍚嶅瓧锛?
 *   }
 *
 * 杩斿洖 { scenes: SceneDraft[], characters: { name, description }[] }
 *
 * SceneDraft 缁撴瀯锛?
 *   {
 *     index: number,             // 1-based
 *     description: string,       // 鐢婚潰鎻忚堪锛堢敤浜?image / video prompt锛?
 *     dialog: string,            // 鍙拌瘝锛堝彲绌哄瓧绗︿覆锛岃〃绀虹函鐢婚潰鏃犲鐧斤級
 *     speaker?: string,          // 璇磋瘽瑙掕壊鍚嶏紙dialog 闈炵┖鏃跺缓璁粰锛?
 *     emotion?: string,          // 鎯呯华 hint
 *     suggestedDurationSec?: number, // 鎺ㄨ崘鏃堕暱锛?/8/10锛?
 *     transitionHint?: string,   // 涓庝笅涓?闀滅殑杞満鎻愮ず锛岀敤浜庡熬甯х敓鎴?
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

CRITICAL OUTPUT RULES (杩濆弽鍒欒涓哄け璐?:
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
- description must be in 涓枃 if the input script is Chinese; concrete and visual, no abstract feelings.
- Identify ALL named speakers (including 鏃佺櫧 / Narrator) and put them in characters with short visual + personality description.
- If user provided existing characters, REUSE the same names without renaming.

Output: ONLY the JSON. Begin with { and end with }.`;

function buildUserPrompt(opts: {
  script: string;
  style?: string;
  targetSceneCount?: number;
  characters?: { name: string; description?: string }[];
}): string {
  const lines: string[] = [];
  if (opts.style) lines.push(`瑙嗛椋庢牸锛?{opts.style}`);
  if (opts.targetSceneCount) lines.push(`鏈熸湜鍒嗛暅鏁帮細绾?${opts.targetSceneCount} 涓猔);
  if (opts.characters && opts.characters.length > 0) {
    lines.push(`宸叉湁瑙掕壊锛堣灏介噺澶嶇敤鍚嶅瓧锛屼笉瑕侀噸鍛藉悕锛夛細`);
    for (const c of opts.characters) {
      lines.push(`- ${c.name}${c.description ? "锛? + c.description : ""}`);
    }
  }
  lines.push("", "鍓ф湰鍘熸枃锛?, opts.script);
  return lines.join("\n");
}

/**
 * 浠?LLM 鐨勫洖澶嶉噷鎶藉嚭 JSON 鍧椼?傚绾у閿欑瓥鐣ワ細
 *   1. 鐩存帴 JSON.parse 鏁存
 *   2. 鎶藉彇 ```json ...``` 鍥存爮
 *   3. 鎶藉彇 ``` ...``` 閫氱敤鍥存爮
 *   4. 鍙栫涓?涓?{ 鍒版渶鍚庝竴涓?} 鐨勫瓙涓?
 *   5. 涓婇潰鎷垮埌鐨勫瓙涓查噷鎶婂父瑙佺殑 LLM 鍧忓瓧绗︽竻娲楋細鏈浆涔夋崲琛屻?佹櫤鑳藉紩鍙枫?佸熬闅忛?楀彿
 */
function cleanupJsonLike(slice: string): string {
  return (
    slice
      // 鏅鸿兘寮曞彿 鈫?鐩村紩鍙?
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      // 涓枃鏍囩偣鐨勫紩鍙峰綋瀛楃涓插寘瑁圭敤锛岃浆鎴愯嫳鏂囧弻寮曞彿
      .replace(/[\u300C\u300E]/g, '"')
      .replace(/[\u300D\u300F]/g, '"')
      // 鍒犻櫎 BOM / 闆跺 / 涓嶅彲瑙佹帶鍒跺瓧绗?
      .replace(/[\uFEFF\u200B-\u200D]/g, "")
      // 琛屽熬娉ㄩ噴  // xxx
      .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1")
      // 鍧楁敞閲?/* ... */
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // 瀛楃涓查噷鐨勭湡瀹炴崲琛?鈫?\n锛堜粎鍦ㄨ鍙屽紩鍙峰寘瑁圭殑鑼冨洿鍐呭仛鏈?灏忔浛鎹級
      .replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/\r?\n/g, "\\n"))
      // 鏁扮粍/瀵硅薄灏鹃殢閫楀彿  ,]  ,}
      .replace(/,(\s*[}\]])/g, "$1")
  );
}

function extractJson(s: string): unknown {
  const tryParse = (raw: string): unknown | null => {
    try { return JSON.parse(raw); } catch { return null; }
  };

  // 0) 鍘绘帀 LLM 鍋跺彂鐨?BOM銆佸洖杞︺?侀灏剧┖鐧?
  const text = s.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();

  // 1) 鏁存
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

  // 4) 绗竴涓?{ 鍒版渶鍚庝竴涓?}
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i >= 0 && j > i) {
    const slice = text.slice(i, j + 1);
    const r = tryParse(slice) ?? tryParse(cleanupJsonLike(slice));
    if (r !== null) return r;

    // 4b) 鎴柇鍏滃簳锛氬熬閮ㄥ彲鑳借鎴柇浜嗭紝灏濊瘯閫愭鍘诲熬鍐?parse
    let s2 = slice;
    for (let k = 0; k < 12 && s2.length > 32; k++) {
      s2 = s2.slice(0, -1);
      const r3 = tryParse(cleanupJsonLike(s2 + "}"));
      if (r3 !== null) return r3;
    }
  }

  throw new Error("LLM 杩斿洖鍐呭鏃犳硶瑙ｆ瀽涓?JSON");
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
  if (!raw || typeof raw !== "object") throw new Error("LLM 杩斿洖涓嶆槸 JSON 瀵硅薄");
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
  const targetSceneCount = Number.isFinite(Number(body.targetSceneCount))
    ? Math.max(1, Math.min(50, Math.round(Number(body.targetSceneCount))))
    : undefined;
  const characters = Array.isArray(body.characters)
    ? body.characters
        .filter((c: any) => c && typeof c === "object" && typeof c.name === "string")
        .map((c: any) => ({ name: String(c.name).trim(), description: c.description ? String(c.description) : undefined }))
    : undefined;

  // 鎵惧埌绠＄嚎閲岄厤缃殑 LLM 妯″瀷锛堢敤鎴风鏈?> 鍏ㄥ眬榛樿锛?
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

  // 璋?LLM锛堟祦寮忔敹闆嗘垚瀹屾暣瀛楃涓诧級銆俆S 鍦ㄥ唴閮?async 鍑芥暟閲屼細涓㈠け `model` 鐨勯潪绌虹獎鍖栵紝
  // 杩欓噷鍥哄寲鎴?const 璁╅棴鍖呭唴鍙斁蹇冪敤銆?
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
      { error: `LLM 璋冪敤澶辫触锛?{e instanceof Error ? e.message : String(e)}` },
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

  // 绗簩杞細瑙ｆ瀽澶辫触锛屾垨瑙ｆ瀽鎴愬姛浣?scenes 涓虹┖ 鈫?鐢ㄦ洿寮虹殑"鍙緭鍑?JSON"鎻愮ず閲嶈瘯涓?娆?
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
        error: `LLM 杩斿洖鏍煎紡涓嶅悎娉曪細${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        rawSample: buffer.slice(0, 1500),
        hint: "璇锋鏌ユ墍閫?LLM 鏄惁鑳界ǔ瀹氳緭鍑?JSON銆傚缓璁崲鏇村己鐨勬ā鍨嬫垨閲嶈瘯銆?,
      },
      { status: 502 },
    );
  }
  if (parsed.scenes.length === 0) {
    console.error("[comic/scenes/draft] empty scenes; raw:\n" + buffer.slice(0, 4000));
    return NextResponse.json(
      {
        error: "LLM 娌℃湁鐢熸垚浠讳綍鍒嗛暅锛岃灏濊瘯鏇村叿浣撶殑鍓ф湰鎴栭噸鏂版彁浜?,
        rawSample: buffer.slice(0, 1500),
      },
      { status: 502 },
    );
  }

  // 璁¤垂锛坈hat token锛?
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
