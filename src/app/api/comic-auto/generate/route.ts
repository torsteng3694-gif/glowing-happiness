import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routeChat, routeImage } from "@/lib/providers";
import { pickChannel, getChannelsForModel } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";
import { rewriteLocalRefsToBase64 } from "@/lib/media-ref";
import { saveMediaAssets } from "@/lib/media-assets";

export const runtime = "nodejs";
export const maxDuration = 800;

type KeywordAnalysis = {
  styleKeywords: string[];
  characterKeywords: string[];
  sceneKeywords: string[];
  moodKeywords: string[];
  cameraKeywords: string[];
  panels: Array<{
    index: number;
    title: string;
    caption: string;
    imagePrompt: string;
  }>;
};

function extractJson(text: string): KeywordAnalysis {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || trimmed;
  const obj = candidate.match(/\{[\s\S]*\}/)?.[0] || candidate;
  const parsed = JSON.parse(obj) as KeywordAnalysis;
  if (!Array.isArray(parsed.panels) || parsed.panels.length === 0) {
    throw new Error("error");
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
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const llmModelId = typeof body.llmModelId === "string" ? body.llmModelId : "";
  const imageModelId = typeof body.imageModelId === "string" ? body.imageModelId : "";
  const panelCount = Math.min(Math.max(parseInt(String(body.panelCount || 4), 10) || 4, 2), 8);
  const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "3:2";

  if (!prompt) return NextResponse.json({ error: "error" }, { status: 400 });
  if (!llmModelId || !imageModelId) {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const [user, llmModel, imageModel] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    prisma.model.findUnique({ where: { id: llmModelId }, include: { provider: true } }),
    prisma.model.findUnique({ where: { id: imageModelId }, include: { provider: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "error" }, { status: 400 });
  if (!llmModel || llmModel.type !== "chat") {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }
  if (!imageModel || imageModel.type !== "image") {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const llmChannel = await pickChannel(llmModel.id, null);
  const llmFallbacks = llmChannel ? await getChannelsForModel(llmModel.id) : [];

  const system = [
    "error",
    "error",
  ].join("\n");
  const userPrompt = [
    `鐏忓棔绗呴棃銏㈡畱閸掓稒鍓伴幏鍡毿掗幋?${panelCount} 閺嶅吋鏋侀悽璇插瀻闂?婊冭嫙鏉堟挸鍤? JSON閿涙瓪,
    "{",
    '  "styleKeywords": ["..."],',
    '  "characterKeywords": ["..."],',
    '  "sceneKeywords": ["..."],',
    '  "moodKeywords": ["..."],',
    '  "cameraKeywords": ["..."],',
    '  "panels": [',
    '    {"index":1,"title":"error"caption":"鐎涙绠烽弬鍥攳","imagePrompt":"error"}',
    "  ]",
    "}",
    "",
    `閸掓稒鍓伴敍?{prompt}`,
    "缁撅附娼敍?,
    "error",
    "- 閻㈠娼版稉楦跨箾鐠愵垰褰婃禍?,
    "error",
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
      { error: `閸忔娊鏁拠宥嗘閼虫垝缍嬬拫鍐暏婢惰精瑙﹂敍?{e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  let analysis: KeywordAnalysis;
  try {
    analysis = extractJson(llmText);
  } catch (e) {
    return NextResponse.json(
      { error: `閸忔娊鏁拠宥埿掗弸鎰亼鐠愩儻绱?${e instanceof Error ? e.message : String(e)}` },
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

  const imageChannel = await pickChannel(imageModel.id, null);
  const imageFallbacks = imageChannel ? await getChannelsForModel(imageModel.id) : [];

  const images: Array<{ index: number; title: string; caption: string; url?: string; error?: string }> = [];
  let totalImageCost = 0;
  // 鏉╃偟鐢绘稉?閼峰瓨?褍顤冨鐚寸窗妫ｆ牗鐗搁幋鎰閸ュ彞缍旀稉鍝勬倵缂侇厽鐗搁崣鍌??鍐ㄦ禈
  let anchorRefUrl: string | null = null;
  const batchId = `comic-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  for (const p of analysis.panels.slice(0, panelCount)) {
    const baseParams: Record<string, unknown> = {
      aspectRatio,
      imageSize: "1K",
      seed: Math.floor(Math.random() * 2_147_483_647),
    };
    if (anchorRefUrl) {
      baseParams.image = anchorRefUrl;
      baseParams.image_url = anchorRefUrl;
      baseParams.images = [anchorRefUrl];
      baseParams.reference_images = [anchorRefUrl];
    }
    const rawParams = await rewriteLocalRefsToBase64(baseParams);
    try {
      const started = Date.now();
      const img = await routeImage(
        {
          model: imageModel.slug,
          prompt: anchorRefUrl
            ? `Keep character identity strictly consistent with reference image. ${p.imagePrompt}`
            : p.imagePrompt,
          n: 1,
          size: "1024x1024",
          rawParams,
        },
        imageModel.provider.slug,
        imageChannel,
        imageFallbacks,
      );
      const url = img.images[0]?.url;
      if (!url) throw new Error("error");
      if (!anchorRefUrl) anchorRefUrl = url;
      const billing = await chargeUsage({
        userId: user.id,
        modelId: imageModel.id,
        channelId: imageChannel?.id ?? null,
        type: "image",
        units: 1,
        latencyMs: Date.now() - started,
        meta: { source: "comic-auto:panel-image", panel: p.index, title: p.title },
      });
      totalImageCost += billing.cost;
      images.push({ index: p.index, title: p.title, caption: p.caption, url });
    } catch (e) {
      images.push({
        index: p.index,
        title: p.title,
        caption: p.caption,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const successUrls = images.map((x) => x.url).filter((x): x is string => typeof x === "string" && x.length > 0);
  if (successUrls.length > 0) {
    const combinedPrompt = analysis.panels
      .slice(0, panelCount)
      .map((p) => `#${p.index} ${p.title}\n${p.imagePrompt}`)
      .join("\n\n")
      .slice(0, 2000);
    await saveMediaAssets({
      userId: user.id,
      modelId: imageModel.id,
      type: "image",
      urls: successUrls,
      prompt: combinedPrompt,
      params: {
        source: "comic-auto:generate",
        sourceLabel: "閼奉亜濮╁⿻顐ゆ暰閺呴缚鍏樻担?,
        batchId,
        aspectRatio,
        panelCount,
        anchorRefUrl,
      },
      totalCost: totalImageCost,
    }).catch((e) => console.error("saveMediaAssets error", e));
  }

  return NextResponse.json({
    analysis: {
      styleKeywords: analysis.styleKeywords || [],
      characterKeywords: analysis.characterKeywords || [],
      sceneKeywords: analysis.sceneKeywords || [],
      moodKeywords: analysis.moodKeywords || [],
      cameraKeywords: analysis.cameraKeywords || [],
    },
    panels: images,
    consistency: {
      enabled: true,
      anchorRefUrl,
    },
    usage: {
      llmCost: llmBilling.cost,
      imageCost: +totalImageCost.toFixed(4),
      totalCost: +(llmBilling.cost + totalImageCost).toFixed(4),
    },
  });
}

