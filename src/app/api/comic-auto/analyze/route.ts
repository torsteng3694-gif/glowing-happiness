import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routeChat } from "@/lib/providers";
import { pickChannel, getChannelsForModel } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";

export const runtime = "nodejs";
export const maxDuration = 800;

type PanelDraft = {
  index: number;
  title: string;
  caption: string;
  imagePrompt: string;
};

type KeywordAnalysis = {
  styleKeywords: string[];
  characterKeywords: string[];
  sceneKeywords: string[];
  moodKeywords: string[];
  cameraKeywords: string[];
  panels: PanelDraft[];
};

function extractJson(text: string): KeywordAnalysis {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || trimmed;
  const obj = candidate.match(/\{[\s\S]*\}/)?.[0] || candidate;
  const parsed = JSON.parse(obj) as KeywordAnalysis;
  if (!Array.isArray(parsed.panels) || parsed.panels.length === 0) {
    throw new Error("鍏抽敭璇嶆櫤鑳戒綋鏈繑鍥炴湁鏁?panels");
  }
  return parsed;
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

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const llmModelId = typeof body.llmModelId === "string" ? body.llmModelId : "";
  const panelCount = Math.min(Math.max(parseInt(String(body.panelCount || 4), 10) || 4, 2), 8);
  if (!prompt) return NextResponse.json({ error: "璇疯緭鍏ユ极鐢诲垱鎰忔弿杩? }, { status: 400 });
  if (!llmModelId) return NextResponse.json({ error: "璇烽?夋嫨璇█妯″瀷" }, { status: 400 });

  const [user, llmModel] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    prisma.model.findUnique({ where: { id: llmModelId }, include: { provider: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "鐢ㄦ埛涓嶅瓨鍦? }, { status: 400 });
  if (!llmModel || llmModel.type !== "chat") {
    return NextResponse.json({ error: "璇█妯″瀷涓嶅彲鐢? }, { status: 400 });
  }

  const llmChannel = await pickChannel(llmModel.id, null);
  const llmFallbacks = llmChannel ? await getChannelsForModel(llmModel.id) : [];

  const system = [
    "error",
    "蹇呴』浠呰緭鍑?JSON锛屼笉瑕佽緭鍑?markdown锛屼笉瑕佽В閲娿??,
  ].join("\n");
  const userPrompt = [
    `灏嗕笅闈㈢殑鍒涙剰鎷嗚В鎴?${panelCount} 鏍兼极鐢诲垎闀滃苟杈撳嚭 JSON锛歚,
    "{",
    '  "styleKeywords": ["..."],',
    '  "characterKeywords": ["..."],',
    '  "sceneKeywords": ["..."],',
    '  "moodKeywords": ["..."],',
    '  "cameraKeywords": ["..."],',
    '  "panels": [',
    '    {"index":1,"title":"鏍兼爣棰?,"caption":"瀛楀箷鏂囨","imagePrompt":"error"}',
    "  ]",
    "}",
    "",
    `鍒涙剰锛?{prompt}`,
    "绾︽潫锛?,
    "- 淇濇寔浜虹墿涓?鑷存?т笌鏈嶉グ涓?鑷存??,
    "- 鐢婚潰涓鸿繛璐彊浜?,
    "- imagePrompt 浣跨敤鑻辨枃锛屽寘鍚鑹层?佺幆澧冦?佸厜绾裤?佹瀯鍥俱?侀暅澶翠俊鎭?,
  ].join("\n");

  const chatStart = Date.now();
  let llmText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const stream = routeChat(
      {
        model: llmModel.slug,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        stream: true,
        temperature: 0.4,
        maxTokens: 2000,
      },
      llmModel.provider.slug,
      llmChannel,
      llmFallbacks,
    );
    for await (const chunk of stream) {
      if (chunk.delta) llmText += chunk.delta;
      if (chunk.done) {
        inputTokens = chunk.inputTokens || 0;
        outputTokens = chunk.outputTokens || 0;
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: `鍏抽敭璇嶆櫤鑳戒綋璋冪敤澶辫触锛?{e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  let analysis: KeywordAnalysis;
  try {
    analysis = extractJson(llmText);
  } catch (e) {
    return NextResponse.json(
      { error: `鍏抽敭璇嶈В鏋愬け璐ワ細${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  const llmBilling = await chargeUsage({
    userId: user.id,
    modelId: llmModel.id,
    channelId: llmChannel?.id ?? null,
    type: "chat",
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - chatStart,
    meta: { source: "comic-auto:keyword-analysis", prompt: prompt.slice(0, 160) },
  });

  return NextResponse.json({
    analysis: {
      styleKeywords: analysis.styleKeywords || [],
      characterKeywords: analysis.characterKeywords || [],
      sceneKeywords: analysis.sceneKeywords || [],
      moodKeywords: analysis.moodKeywords || [],
      cameraKeywords: analysis.cameraKeywords || [],
    },
    drafts: (analysis.panels || []).slice(0, panelCount).map((x, i) => ({
      index: x.index || i + 1,
      title: x.title || `绗?{i + 1}鏍糮,
      caption: x.caption || "",
      imagePrompt: x.imagePrompt || "",
    })),
    usage: {
      llmCost: +llmBilling.cost.toFixed(4),
    },
  });
}

