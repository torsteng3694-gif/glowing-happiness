/**
 * Step 3. outline — 真实实现
 */

import { callLLMJson } from "../helpers-llm";
import {
  OutlineSchema,
  type AnalyzeOutput,
  type DirectionData,
  type OutlineOutput,
} from "../schemas";
import { STEP_KEYS_V3 } from "../steps";
import { OUTLINE_SYSTEM, buildOutlineUser } from "../prompts/outline";
import { buildCandidate, type RunnerV3 } from "./_shared";

const EMOTION_LABEL: Record<OutlineOutput["chapters"][number]["emotion"], string> = {
  rising: "↗ 上升",
  tense: "⚡ 紧张",
  climax: "🔥 高潮",
  calm: "～ 平稳",
  resolution: "✓ 收束",
};

export const runOutline: RunnerV3 = async (ctx) => {
  const analyze = ctx.prior[STEP_KEYS_V3.ANALYZE] as AnalyzeOutput | undefined;
  const direction = ctx.prior[STEP_KEYS_V3.DIRECTION] as DirectionData | undefined;
  if (!analyze || !direction) {
    throw new Error("缺少前置产物（analyze / direction），无法生成大纲");
  }

  const r = await callLLMJson<OutlineOutput>({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: OUTLINE_SYSTEM,
    user: buildOutlineUser({
      analyze,
      direction,
      initialPrompt: ctx.project.initialPrompt,
    }),
    schema: OutlineSchema,
    mode: "stable",
    maxTokens: 1800,
    metaTag: "comic-v3:outline",
  });

  const md = `### 故事大纲（共 ${r.data.totalChapters} 章）

${r.data.chapters
  .map(
    (c) => `**第 ${c.index} 章 · ${c.title}** _${EMOTION_LABEL[c.emotion]}_

${c.summary}`,
  )
  .join("\n\n")}`;

  return {
    candidates: [buildCandidate({ kind: "outline", data: r.data, mdSummary: md })],
    needsConfirm: false,
    cost: r.cost,
    realCost: r.realCost,
    modelSlug: r.modelSlug,
    channelId: r.channelId,
  };
};
