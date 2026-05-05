import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routeChat } from "@/lib/providers";
import { pickChannel, getChannelsForModel } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    throw new Error("关键词智能体未返回有效 panels");
  }
  return parsed;
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
    return NextResponse.json({ error: "请求体非法" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const llmModelId = typeof body.llmModelId === "string" ? body.llmModelId : "";
  const panelCount = Math.min(Math.max(parseInt(String(body.panelCount || 4), 10) || 4, 2), 8);
  if (!prompt) return NextResponse.json({ error: "请输入漫画创意描述" }, { status: 400 });
  if (!llmModelId) return NextResponse.json({ error: "请选择语言模型" }, { status: 400 });

  const [user, llmModel] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    prisma.model.findUnique({ where: { id: llmModelId }, include: { provider: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 400 });
  if (!llmModel || llmModel.type !== "chat") {
    return NextResponse.json({ error: "语言模型不可用" }, { status: 400 });
  }

  const llmChannel = await pickChannel(llmModel.id, null);
  const llmFallbacks = llmChannel ? await getChannelsForModel(llmModel.id) : [];

  const system = [
    "你是「漫画关键词智能体」，负责把用户创意拆成可生成漫画的关键词与分镜。",
    "必须仅输出 JSON，不要输出 markdown，不要解释。",
  ].join("\n");
  const userPrompt = [
    `将下面的创意拆解成 ${panelCount} 格漫画分镜并输出 JSON：`,
    "{",
    '  "styleKeywords": ["..."],',
    '  "characterKeywords": ["..."],',
    '  "sceneKeywords": ["..."],',
    '  "moodKeywords": ["..."],',
    '  "cameraKeywords": ["..."],',
    '  "panels": [',
    '    {"index":1,"title":"格标题","caption":"字幕文案","imagePrompt":"可直接用于文生图的英文提示词"}',
    "  ]",
    "}",
    "",
    `创意：${prompt}`,
    "约束：",
    "- 保持人物一致性与服饰一致性",
    "- 画面为连贯叙事",
    "- imagePrompt 使用英文，包含角色、环境、光线、构图、镜头信息",
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
      { error: `关键词智能体调用失败：${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  let analysis: KeywordAnalysis;
  try {
    analysis = extractJson(llmText);
  } catch (e) {
    return NextResponse.json(
      { error: `关键词解析失败：${e instanceof Error ? e.message : String(e)}` },
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
      title: x.title || `第${i + 1}格`,
      caption: x.caption || "",
      imagePrompt: x.imagePrompt || "",
    })),
    usage: {
      llmCost: +llmBilling.cost.toFixed(4),
    },
  });
}

