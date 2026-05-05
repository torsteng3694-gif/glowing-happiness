/**
 * 每一步的 runner。统一签名：
 *   (ctx) => Promise<StepRunResult>
 *
 * - runner 只负责"做这一步"，不操作 project 表（写入由调度器统一做）
 * - 可以读 ctx.policy 获取重试上限 / 每镜目标数 等托管参数
 * - 出错抛异常即可，调度器会在 retry 限内重跑；耗尽后标 failed
 */

import { prisma } from "@/lib/db";
import { callLLM, callImage, callVideo, parseLooseJSON } from "./helpers";
import { STEP_KEYS } from "./steps";
import { getStylePrefix } from "./visual-styles";
import { generateAssetImagesForCharacter } from "./shot-helpers";
import type {
  StepRunContext,
  StepRunResult,
  IntentAnalysisOutput,
  DirectionPickOutput,
  DirectionRefineOutput,
  DirectionExtractOutput,
  OutlineOutput,
  NovelAdaptOutput,
  ScriptBreakdownOutput,
  StoryboardScriptOutput,
  AssetMatchOutput,
  MotionPromptOutput,
  KeyframesOutput,
  VideoGenOutput,
  VideoComposeOutput,
  ArtifactItem,
} from "./types";

export type Runner = (ctx: StepRunContext) => Promise<StepRunResult>;

const SYS_BASE =
  "你是一个专业的「漫剧 / 短剧」剧本与分镜导演。所有产出必须严格遵循请求的 JSON 模式，不要输出任何额外文本或 Markdown 围栏，禁止在 JSON 外加解释。";

/* ================================================================
 * 1. 意图分析
 * ================================================================ */
const runIntentAnalysis: Runner = async (ctx) => {
  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `分析下面的故事点子，给出题材定位与推荐的创作方式，输出 JSON：
{
  "genre": "题材（≤10字）",
  "audience": "目标受众（≤15字）",
  "coreConflict": "核心冲突（≤30字）",
  "themes": ["主题1","主题2","主题3"],
  "tone": "整体基调（≤10字）",
  "recommendedApproach": "推荐的创作方式（≤30字，例如：先抑后扬+多反转）"
}

故事点子：
"""
${ctx.project.initialPrompt}
"""`,
    temperature: 0.4,
    maxTokens: 700,
    metaTag: "comic-agent:intent_analysis",
  });
  const data = parseLooseJSON<IntentAnalysisOutput>(r.data.text);
  return {
    output: data,
    cost: r.cost,
    realCost: r.realCost,
    modelSlug: r.modelSlug,
    channelId: r.channelId,
  };
};

/* ================================================================
 * 2. 创意方向（生成 3 个候选 + 自动选一）
 * ================================================================ */
const runDirectionPick: Runner = async (ctx) => {
  const ia = ctx.prior[STEP_KEYS.INTENT_ANALYSIS] as IntentAnalysisOutput;
  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `基于意图分析，给出 3 个差异化创意方向候选，并选出推荐方向。仅输出 JSON：
{
  "candidates": [
    { "id": "A", "title": "方向标题（≤12字）", "summary": "方向梗概（≤60字）" },
    { "id": "B", "title": "...", "summary": "..." },
    { "id": "C", "title": "...", "summary": "..." }
  ],
  "selectedId": "A|B|C",
  "reason": "为什么选它（≤40字）"
}

意图分析：${JSON.stringify(ia)}
原始故事：${ctx.project.initialPrompt}`,
    temperature: 0.95,
    maxTokens: 900,
    metaTag: "comic-agent:direction_pick",
  });
  const data = parseLooseJSON<DirectionPickOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 3. 微调方向（在选中方向上做 3 个微调候选）
 * ================================================================ */
const runDirectionRefine: Runner = async (ctx) => {
  const dp = ctx.prior[STEP_KEYS.DIRECTION_PICK] as DirectionPickOutput | undefined;
  const ia = ctx.prior[STEP_KEYS.INTENT_ANALYSIS] as IntentAnalysisOutput;
  const selected =
    dp?.candidates.find((c) => c.id === dp.selectedId) ||
    dp?.candidates[0] ||
    {
      id: "X",
      title: ia.recommendedApproach || "默认方向",
      summary: ia.coreConflict || ctx.project.initialPrompt.slice(0, 60),
    };
  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `对下列已选方向做 3 个差异化微调（节奏/视角/反转点不同），并自动选一。仅输出 JSON：
{
  "candidates": [
    { "id":"A", "title":"...", "summary":"..." }
  ],
  "selectedId":"A",
  "reason":"≤30字"
}

已选方向：${JSON.stringify(selected)}`,
    temperature: 0.85,
    maxTokens: 800,
    metaTag: "comic-agent:direction_refine",
  });
  const data = parseLooseJSON<DirectionRefineOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 4. 提炼方向（最终落定 + 一句话主旨）
 * ================================================================ */
const runDirectionExtract: Runner = async (ctx) => {
  const dr = ctx.prior[STEP_KEYS.DIRECTION_REFINE] as DirectionRefineOutput | undefined;
  const dp = ctx.prior[STEP_KEYS.DIRECTION_PICK] as DirectionPickOutput | undefined;
  const ia = ctx.prior[STEP_KEYS.INTENT_ANALYSIS] as IntentAnalysisOutput;
  const upstream = dr || dp;
  const selected =
    upstream?.candidates.find((c) => c.id === upstream.selectedId) ||
    upstream?.candidates[0] ||
    {
      id: "X",
      title: ia.recommendedApproach || "默认方向",
      summary: ia.coreConflict || ctx.project.initialPrompt.slice(0, 60),
    };
  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `把下列方向提炼成最终敲定版本，包含标题、一句话主旨、基调、短梗概。仅输出 JSON：
{
  "finalTitle":"≤14字",
  "oneLineThesis":"≤30字",
  "toneFinal":"≤10字",
  "premise":"≤120字"
}

方向：${JSON.stringify(selected)}`,
    temperature: 0.5,
    maxTokens: 500,
    metaTag: "comic-agent:direction_extract",
  });
  const data = parseLooseJSON<DirectionExtractOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 5. 创意大纲
 * ================================================================ */
const runOutline: Runner = async (ctx) => {
  const de = ctx.prior[STEP_KEYS.DIRECTION_EXTRACT] as DirectionExtractOutput | undefined;
  const ia = ctx.prior[STEP_KEYS.INTENT_ANALYSIS] as IntentAnalysisOutput;
  const seed = de
    ? `最终方向：${JSON.stringify(de)}`
    : `意图分析：${JSON.stringify(ia)}\n原始故事：${ctx.project.initialPrompt}`;
  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `基于以下信息，生成 6-8 章节大纲，仅输出 JSON：
{
  "totalChapters": 6,
  "chapters": [
    { "index": 1, "title": "...", "summary": "≤80字", "emotion": "rising|tense|climax|calm|resolution" }
  ]
}

${seed}`,
    temperature: 0.7,
    maxTokens: 1500,
    metaTag: "comic-agent:outline",
  });
  const data = parseLooseJSON<OutlineOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 6. 小说创作（可跳过）
 * ================================================================ */
const runNovelAdapt: Runner = async (ctx) => {
  const outline = ctx.prior[STEP_KEYS.OUTLINE] as OutlineOutput;
  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `把下面的大纲扩写成一段连续叙事文本（800-1500 字），文风${ctx.project.style || "通俗简洁"}。
仅输出 JSON：{ "text": "...", "wordCount": 1234 }

大纲：${JSON.stringify(outline)}`,
    temperature: 0.8,
    maxTokens: 3000,
    metaTag: "comic-agent:novel_adapt",
  });
  const data = parseLooseJSON<NovelAdaptOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 7. 剧本转换（拆出场景 + 角色池）
 * ================================================================ */
const runScriptBreakdown: Runner = async (ctx) => {
  const outline = ctx.prior[STEP_KEYS.OUTLINE] as OutlineOutput;
  const novel = ctx.prior[STEP_KEYS.NOVEL_ADAPT] as NovelAdaptOutput | undefined;
  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `把大纲拆解为 5-8 个可拍摄场景，并罗列出场角色卡。仅输出 JSON：
{
  "scenes": [
    {
      "index": 1,
      "location": "地点",
      "timeOfDay": "白天|夜晚|黄昏|清晨",
      "characters": ["角色名"],
      "action": "动作叙述（≤80字）",
      "dialogues": [{"speaker":"角色","text":"对白"}]
    }
  ],
  "charactersPool": [
    {"name":"角色名（≤6字）","description":"外观+性格（≤40字）"}
  ]
}

大纲：${JSON.stringify(outline)}
${novel ? `小说文本：${novel.text.slice(0, 1500)}` : ""}`,
    temperature: 0.6,
    maxTokens: 3000,
    metaTag: "comic-agent:script_breakdown",
  });
  const data = parseLooseJSON<ScriptBreakdownOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 8. 资产提取（4 类资产 + 多角度立绘）
 *
 * 步骤：
 *   1) 调一次 LLM，把剧本拆解为 4 类资产（角色 / 场景 / 道具 / 技能），
 *      锁定唯一名字（取 charactersPool 里的原名，避免每次重生都换名）
 *   2) 为每个资产按类型生成对应角度的多张参考图：
 *        character: 正面 / 侧面 / 全身（3 张）
 *        scene:     全景 / 局部（2 张）
 *        prop:      白底（1 张）
 *        skill:     效果（1 张）
 *   3) 写入 ComicCharacter 表，referenceUrl=主图，referenceUrls=多图集
 * ================================================================ */

type AssetExtractItem = { name: string; description: string };
type AssetExtractOutput = {
  characters: AssetExtractItem[];
  scenes: AssetExtractItem[];
  props: AssetExtractItem[];
  skills: AssetExtractItem[];
};

const runSubjectBinding: Runner = async (ctx) => {
  const sb = ctx.prior[STEP_KEYS.SCRIPT_BREAKDOWN] as ScriptBreakdownOutput;

  // —— A. LLM 提取 4 类资产 ——
  const llm = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `从下列剧本中提取四类资产，仅输出 JSON：
{
  "characters": [{"name":"≤8字","description":"外观+性格（≤40字）"}],
  "scenes":     [{"name":"≤8字","description":"地点描述（≤40字）"}],
  "props":      [{"name":"≤8字","description":"道具描述（≤30字）"}],
  "skills":     [{"name":"≤8字","description":"特殊技能/能力的视觉描述（≤30字），无可省略"}]
}

要求：
- characters 上限 6 个，scenes 上限 6 个，props 上限 8 个，skills 上限 4 个
- 名字简洁、稳定、可复用（比如就叫"林克"而不是"主角林克"）

剧本场景：${JSON.stringify(sb.scenes)}
原始角色池：${JSON.stringify(sb.charactersPool || [])}`,
    temperature: 0.3,
    maxTokens: 1500,
    metaTag: "comic-agent:subject_binding:extract",
  });
  const ext = parseLooseJSON<AssetExtractOutput>(llm.data.text);

  // —— B. 复用检查：已锁定的本项目资产 + 用户全局资产库 ——
  const lockedExisting = await prisma.comicCharacter.findMany({
    where: { projectId: ctx.projectId, nameLocked: true },
  });
  const lockedNames = new Set(lockedExisting.map((c) => `${c.type}:${c.name}`));

  // 删除非锁定的旧资产
  await prisma.comicCharacter.deleteMany({
    where: { projectId: ctx.projectId, nameLocked: false },
  });

  // 全局资产库：用户已生成过的同 (type, name)
  const globalAssets = await prisma.asset.findMany({ where: { userId: ctx.userId } });
  const globalByKey = new Map(globalAssets.map((a) => [`${a.type}:${a.name}`, a]));

  // —— C. 把所有资产作为 ComicCharacter 行落库（带 genStatus） ——
  type AssetType = "character" | "scene" | "prop" | "skill";
  const queue: { type: AssetType; item: AssetExtractItem }[] = [
    ...(ext.characters || []).slice(0, 6).map((it) => ({ type: "character" as const, item: it })),
    ...(ext.scenes || []).slice(0, 6).map((it) => ({ type: "scene" as const, item: it })),
    ...(ext.props || []).slice(0, 8).map((it) => ({ type: "prop" as const, item: it })),
    ...(ext.skills || []).slice(0, 4).map((it) => ({ type: "skill" as const, item: it })),
  ];

  let orderIdx = 0;
  const usedKey = new Set(lockedNames);
  const newCharIds: string[] = []; // 待生图
  const reusedSummary: SubjectSummaryItem[] = [];
  const ids: string[] = [];

  for (const { type, item } of queue) {
    let name = (item.name || "").trim().slice(0, 12);
    if (!name) continue;
    const key = `${type}:${name}`;
    if (usedKey.has(key)) continue;
    usedKey.add(key);

    const visualAnchor = `${name}：${item.description}`;
    const reuse = globalByKey.get(key);

    if (reuse) {
      // 直接复用全局资产：referenceUrls 直接抄过来
      const reuseUrls = reuse.referenceUrls ? safeJsonArr(reuse.referenceUrls) : reuse.referenceUrl ? [reuse.referenceUrl] : [];
      const created = await prisma.comicCharacter.create({
        data: {
          projectId: ctx.projectId,
          type,
          name,
          description: item.description || reuse.description,
          referenceUrl: reuse.referenceUrl,
          referenceUrls: reuse.referenceUrls,
          visualAnchor,
          orderIdx: orderIdx++,
          nameLocked: false,
          sourceAssetId: reuse.id,
          genStatus: reuseUrls.length > 0 ? "ready" : "pending",
        },
      });
      ids.push(created.id);
      reusedSummary.push({
        id: created.id,
        type,
        name,
        referenceUrl: reuse.referenceUrl ?? undefined,
        visualAnchor,
      });
      // 复用计数 +1
      await prisma.asset.update({ where: { id: reuse.id }, data: { usageCount: { increment: 1 } } });
    } else {
      // 新建资产：先建 row，状态 pending，下面循环生图
      const created = await prisma.comicCharacter.create({
        data: {
          projectId: ctx.projectId,
          type,
          name,
          description: item.description,
          visualAnchor,
          orderIdx: orderIdx++,
          nameLocked: false,
          genStatus: "pending",
        },
      });
      ids.push(created.id);
      newCharIds.push(created.id);
    }
  }

  // —— D. 串行为新建资产生图（每张写到 DB，前端 SSE 实时看到） ——
  const summary: SubjectSummaryItem[] = [...reusedSummary];
  let totalCost = llm.cost;
  let totalRealCost = llm.realCost;
  let lastUpstreamErr: string | undefined;
  const artifacts: ArtifactItem[] = [];

  for (const charId of newCharIds) {
    try {
      const r = await generateAssetImagesForCharacter({
        userId: ctx.userId,
        projectId: ctx.projectId,
        charId,
      });
      if (r.urls[0]) artifacts.push({ url: r.urls[0], type: "image" });
      const ch = await prisma.comicCharacter.findUnique({ where: { id: charId } });
      if (ch) {
        summary.push({
          id: ch.id,
          type: ch.type as SubjectSummaryItem["type"],
          name: ch.name,
          referenceUrl: ch.referenceUrl ?? undefined,
          visualAnchor: ch.visualAnchor ?? undefined,
          error: r.genStatus === "failed" ? ch.genError ?? "生图失败" : undefined,
        });
      }
    } catch (e) {
      lastUpstreamErr = e instanceof Error ? e.message : String(e);
    }
  }

  // 整体没产出任何角色（包括复用的）
  if (summary.length === 0) {
    throw new Error("资产识别失败，请检查剧本");
  }
  // 全部新建都失败 + 没有可复用项
  if (
    reusedSummary.length === 0 &&
    summary.length > 0 &&
    summary.every((s) => !s.referenceUrl)
  ) {
    const hint = lastUpstreamErr ? `（上游：${truncate(lastUpstreamErr, 200)}）` : "";
    throw new Error(`所有资产参考图均生成失败${hint}`);
  }

  return {
    output: { characterIds: ids, summary },
    artifacts,
    cost: +totalCost.toFixed(4),
    realCost: +totalRealCost.toFixed(4),
    modelSlug: ctx.project.imageSlug,
    channelId: null,
  };
};

function safeJsonArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

type SubjectSummaryItem = {
  id: string;
  type: "character" | "scene" | "prop" | "skill";
  name: string;
  referenceUrl?: string;
  visualAnchor?: string;
  error?: string;
};

/* ================================================================
 * 9. 分镜脚本（一次性出 imagePrompt，不再单独有 design 步）
 * ================================================================ */
const runStoryboardScript: Runner = async (ctx) => {
  const sb = ctx.prior[STEP_KEYS.SCRIPT_BREAKDOWN] as ScriptBreakdownOutput;
  const characters = await prisma.comicCharacter.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { orderIdx: "asc" },
  });
  const anchors = characters
    .map((c) => `${c.name}：${c.visualAnchor || c.description || ""}`)
    .join("\n");

  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `把下列场景拆成 6-10 个分镜（shot），每镜直接给出可喂给图像模型的 imagePrompt。
要求：
- imagePrompt 英文优先，包含人物视觉锚、场景、光线、构图
- motionPrompt 留空（后续步骤再生成）
- dialogue 来自场景对白（中文，可空）
仅输出 JSON：
{
  "shots": [
    { "index":1, "sceneIndex":1, "imagePrompt":"...", "motionPrompt":"", "dialogue":"...", "durationSec":5 }
  ]
}

场景：${JSON.stringify(sb.scenes)}
角色视觉锚：
${anchors}`,
    temperature: 0.6,
    maxTokens: 3500,
    metaTag: "comic-agent:storyboard_script",
  });
  const data = parseLooseJSON<StoryboardScriptOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 10. 匹配出镜资产（无外调，纯 LLM 把 shot.imagePrompt + 角色名做映射）
 *     或者直接做"名字包含匹配"，省一次 LLM 调用
 * ================================================================ */
const runAssetMatch: Runner = async (ctx) => {
  const ss = ctx.prior[STEP_KEYS.STORYBOARD_SCRIPT] as StoryboardScriptOutput;
  const characters = await prisma.comicCharacter.findMany({
    where: { projectId: ctx.projectId },
    orderBy: { orderIdx: "asc" },
  });

  // 先做基于"名字出现"的快速匹配
  const fast: AssetMatchOutput["shotAssets"] = ss.shots.map((shot) => {
    const ids = characters
      .filter((c) => shot.imagePrompt.includes(c.name) || shot.dialogue?.includes(c.name))
      .map((c) => c.id);
    return { shotIndex: shot.index, characterIds: ids };
  });

  // 若超过半数 shot 没匹配到，再用 LLM 兜底
  const missing = fast.filter((x) => x.characterIds.length === 0).length;
  if (missing < fast.length / 2) {
    return {
      output: { shotAssets: fast } satisfies AssetMatchOutput,
      cost: 0,
      realCost: 0,
      modelSlug: ctx.project.llmSlug,
      channelId: null,
    };
  }

  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `为每个分镜匹配出镜的角色 id。仅输出 JSON：
{ "shotAssets": [ { "shotIndex": 1, "characterIds": ["id1","id2"] } ] }

分镜：${JSON.stringify(ss.shots.map((s) => ({ idx: s.index, prompt: s.imagePrompt, dlg: s.dialogue })))}
角色：${JSON.stringify(characters.map((c) => ({ id: c.id, name: c.name })))}`,
    temperature: 0.2,
    maxTokens: 1500,
    metaTag: "comic-agent:asset_match",
  });
  const data = parseLooseJSON<AssetMatchOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 11. 生成分镜图（关键帧）—— 每帧失败重试
 * ================================================================ */
const runKeyframes: Runner = async (ctx) => {
  const ss = ctx.prior[STEP_KEYS.STORYBOARD_SCRIPT] as StoryboardScriptOutput;
  const shots = (ss.shots || []).slice(0, 12);
  if (shots.length === 0) throw new Error("分镜脚本为空");

  const aspect = aspectFromResolution(ctx.project.aspectRatio);
  const stylePrefix = getStylePrefix(ctx.project.visualStyle);
  const items: ArtifactItem[] = [];
  let totalCost = 0;
  let totalReal = 0;
  const maxRetry = ctx.policy.retry.image;
  let lastErr: string | undefined;
  const failedShots: { shotIndex: number; error: string }[] = [];

  for (const shot of shots) {
    let url: string | undefined;
    let shotErr: string | undefined;
    for (let attempt = 0; attempt < maxRetry && !url; attempt++) {
      try {
        const img = await callImage({
          userId: ctx.userId,
          modelSlug: ctx.project.imageSlug,
          prompt: stylePrefix + shot.imagePrompt,
          n: 1,
          rawParams: { aspectRatio: aspect },
          metaTag: `comic-agent:keyframes:shot${shot.index}#${attempt}`,
          saveAs: {
            projectId: ctx.projectId,
            category: "keyframe",
            label: `shot-${shot.index}`,
          },
        });
        totalCost += img.cost;
        totalReal += img.realCost;
        url = img.data.urls[0];
      } catch (e) {
        shotErr = e instanceof Error ? e.message : String(e);
        lastErr = shotErr;
        console.warn(
          `[comic-agent] 关键帧 shot ${shot.index} 第 ${attempt + 1}/${maxRetry} 次失败:`,
          shotErr,
        );
      }
    }
    if (url) items.push({ url, type: "image", shotIndex: shot.index });
    else if (shotErr) failedShots.push({ shotIndex: shot.index, error: shotErr });
  }

  if (items.length === 0) {
    const hint = lastErr ? `（上游：${truncate(lastErr, 200)}）` : "";
    throw new Error(`所有关键帧均生成失败${hint}`);
  }

  const out: KeyframesOutput = {
    count: items.length,
    items,
    failed: failedShots.length > 0 ? failedShots : undefined,
  };
  return {
    output: out,
    artifacts: items,
    cost: +totalCost.toFixed(4),
    realCost: +totalReal.toFixed(4),
    modelSlug: ctx.project.imageSlug,
    channelId: null,
  };
};

/* ================================================================
 * 12. 生成视频提示词（motionPrompt）—— 一次 LLM 完成
 * ================================================================ */
const runMotionPrompt: Runner = async (ctx) => {
  const ss = ctx.prior[STEP_KEYS.STORYBOARD_SCRIPT] as StoryboardScriptOutput;
  const r = await callLLM({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SYS_BASE,
    user: `为每个分镜生成图生视频用的运动 prompt（英文优先），描述本镜的镜头运动+主体动作（≤30词）。
仅输出 JSON：
{ "items": [ { "shotIndex":1, "motionPrompt":"...", "durationSec":5 } ] }

分镜：${JSON.stringify(ss.shots.map((s) => ({ idx: s.index, prompt: s.imagePrompt, dur: s.durationSec })))}`,
    temperature: 0.5,
    maxTokens: 1500,
    metaTag: "comic-agent:motion_prompt",
  });
  const data = parseLooseJSON<MotionPromptOutput>(r.data.text);
  return { output: data, cost: r.cost, realCost: r.realCost, modelSlug: r.modelSlug, channelId: r.channelId };
};

/* ================================================================
 * 13. 批量生成视频
 *     每个镜头：尝试到拿到 policy.videoTargetPerShot 个成功，或重试上限耗尽
 * ================================================================ */
const runVideoGen: Runner = async (ctx) => {
  const kf = ctx.prior[STEP_KEYS.KEYFRAMES] as KeyframesOutput;
  const mp = ctx.prior[STEP_KEYS.MOTION_PROMPT] as MotionPromptOutput;
  if (!kf || kf.items.length === 0) throw new Error("缺少关键帧");
  if (!mp) throw new Error("缺少视频提示词");

  const motionByShot = new Map<number, { motionPrompt: string; durationSec: number }>();
  for (const it of mp.items) motionByShot.set(it.shotIndex, it);

  const items: ArtifactItem[] = [];
  let totalCost = 0;
  let totalReal = 0;
  let totalDur = 0;
  const target = Math.max(1, ctx.policy.videoTargetPerShot);
  const maxRetry = ctx.policy.retry.video;

  for (const frame of kf.items) {
    if (frame.shotIndex == null) continue;
    const m = motionByShot.get(frame.shotIndex);
    if (!m) continue;

    let okCount = 0;
    let attempts = 0;
    while (okCount < target && attempts < maxRetry) {
      attempts++;
      try {
        const v = await callVideo({
          userId: ctx.userId,
          modelSlug: ctx.project.videoSlug,
          prompt: m.motionPrompt,
          duration: m.durationSec || 5,
          aspectRatio: aspectFromResolution(ctx.project.aspectRatio),
          // 不同上游图生视频模型接收的字段名不同，这里多塞几种常见命名，
          // 上游会忽略不识别的字段。
          rawParams: {
            image: frame.url,
            image_url: frame.url,
            images: [frame.url],
            first_frame_image: frame.url,
          },
          metaTag: `comic-agent:video_gen:shot${frame.shotIndex}#${attempts}`,
          saveAs: {
            projectId: ctx.projectId,
            category: "shot",
            label: `shot-${frame.shotIndex}`,
          },
        });
        totalCost += v.cost;
        totalReal += v.realCost;
        totalDur += v.data.duration;
        items.push({
          url: v.data.url,
          type: "video",
          shotIndex: frame.shotIndex,
          durationSec: v.data.duration,
        });
        okCount++;
      } catch (e) {
        console.warn(
          `[comic-agent] 视频 shot ${frame.shotIndex} 第 ${attempts}/${maxRetry} 次失败:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  if (items.length === 0) throw new Error("所有视频片段均生成失败");

  const out: VideoGenOutput = {
    count: items.length,
    totalDurationSec: +totalDur.toFixed(2),
    items,
  };
  return {
    output: out,
    artifacts: items,
    cost: +totalCost.toFixed(4),
    realCost: +totalReal.toFixed(4),
    modelSlug: ctx.project.videoSlug,
    channelId: null,
  };
};

/* ================================================================
 * 14. 视频合成
 * ================================================================ */
const runVideoCompose: Runner = async (ctx) => {
  const vg = ctx.prior[STEP_KEYS.VIDEO_GEN] as VideoGenOutput;
  if (!vg || vg.items.length === 0) throw new Error("没有可合成的视频片段");

  const finalUrl = vg.items[0].url;
  const cover = vg.items[0].url;

  const videoModel = await prisma.model.findUnique({
    where: { slug: ctx.project.videoSlug },
  });
  const unit = videoModel?.unitPrice ?? 0;
  const fee = +(unit * vg.totalDurationSec * 0.3).toFixed(4);
  if (fee > 0 && videoModel) {
    await prisma.usage.create({
      data: {
        userId: ctx.userId,
        modelId: videoModel.id,
        type: "video",
        units: vg.totalDurationSec,
        cost: fee,
        realCost: 0,
        status: "success",
        meta: JSON.stringify({ source: "comic-agent:video_compose", note: "本地软合成服务费" }),
      },
    });
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { balance: { decrement: fee }, totalSpent: { increment: fee } },
    });
    await prisma.transaction.create({
      data: {
        userId: ctx.userId,
        type: "consume",
        amount: -fee,
        balance: 0,
        note: "AI 漫剧 · 视频合成",
        meta: JSON.stringify({ source: "comic-agent:video_compose" }),
      },
    });
  }

  await prisma.comicProject.update({
    where: { id: ctx.projectId },
    data: { finalVideoUrl: finalUrl, coverUrl: cover },
  });

  // 把成片写到「我的作品」
  if (videoModel && finalUrl) {
    const { saveMediaAssets } = await import("@/lib/media-assets");
    saveMediaAssets({
      userId: ctx.userId,
      modelId: videoModel.id,
      type: "video",
      urls: [finalUrl],
      thumbnailUrl: cover,
      durationSec: vg.totalDurationSec,
      prompt: ctx.project.title,
      params: {
        source: "comic-agent",
        projectId: ctx.projectId,
        category: "final",
        label: ctx.project.title,
      },
      totalCost: fee,
    }).catch((e) => console.error("[comic-agent] saveMediaAssets final video failed:", e));
  }

  const out: VideoComposeOutput = {
    videoUrl: finalUrl,
    coverUrl: cover,
    durationSec: vg.totalDurationSec,
  };
  return {
    output: out,
    artifacts: [{ url: finalUrl, type: "video", durationSec: vg.totalDurationSec }],
    cost: fee,
    realCost: 0,
    modelSlug: ctx.project.videoSlug,
    channelId: null,
  };
};

/* ================================================================
 * 注册表
 * ================================================================ */
export const RUNNERS: Record<string, Runner> = {
  [STEP_KEYS.INTENT_ANALYSIS]: runIntentAnalysis,
  [STEP_KEYS.DIRECTION_PICK]: runDirectionPick,
  [STEP_KEYS.DIRECTION_REFINE]: runDirectionRefine,
  [STEP_KEYS.DIRECTION_EXTRACT]: runDirectionExtract,
  [STEP_KEYS.OUTLINE]: runOutline,
  [STEP_KEYS.NOVEL_ADAPT]: runNovelAdapt,
  [STEP_KEYS.SCRIPT_BREAKDOWN]: runScriptBreakdown,
  [STEP_KEYS.SUBJECT_BINDING]: runSubjectBinding,
  [STEP_KEYS.STORYBOARD_SCRIPT]: runStoryboardScript,
  [STEP_KEYS.ASSET_MATCH]: runAssetMatch,
  [STEP_KEYS.KEYFRAMES]: runKeyframes,
  [STEP_KEYS.MOTION_PROMPT]: runMotionPrompt,
  [STEP_KEYS.VIDEO_GEN]: runVideoGen,
  [STEP_KEYS.VIDEO_COMPOSE]: runVideoCompose,
};

function aspectFromResolution(aspect: string): string {
  return aspect && /^\d+:\d+$/.test(aspect) ? aspect : "16:9";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
