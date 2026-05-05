/**
 * Step 1. analyze — 真实实现
 *
 * 调用 LLM 分析 initialPrompt，输出 AnalyzeOutput。
 * 单候选，不暂停。
 */

import { callLLMJson } from "../helpers-llm";
import { AnalyzeSchema, type AnalyzeOutput } from "../schemas";
import { ANALYZE_SYSTEM, buildAnalyzeUser } from "../prompts/analyze";
import { buildCandidate, type RunnerV3 } from "./_shared";

export const runAnalyze: RunnerV3 = async (ctx) => {
  const r = await callLLMJson<AnalyzeOutput>({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: ANALYZE_SYSTEM,
    user: buildAnalyzeUser(ctx.project.initialPrompt),
    schema: AnalyzeSchema,
    mode: "stable",
    maxTokens: 800,
    metaTag: "comic-v3:analyze",
  });

  const md = `### 意图分析

- **题材**：${r.data.genre}
- **目标受众**：${r.data.audience}
- **核心冲突**：${r.data.coreConflict}
- **主题**：${r.data.themes.join(" · ")}
- **整体基调**：${r.data.tone}
- **推荐创作方式**：${r.data.recommendedApproach}`;

  return {
    candidates: [buildCandidate({ kind: "analyze", data: r.data, mdSummary: md })],
    needsConfirm: false,
    cost: r.cost,
    realCost: r.realCost,
    modelSlug: r.modelSlug,
    channelId: r.channelId,
  };
};
