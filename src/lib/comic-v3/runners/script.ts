/**
 * Step 4. script — 真实实现
 *
 * needsConfirm = true：用户经常想改场景/对白
 */

import { callLLMJson } from "../helpers-llm";
import {
  ScriptSchema,
  type AnalyzeOutput,
  type DirectionData,
  type OutlineOutput,
  type ScriptOutput,
} from "../schemas";
import { STEP_KEYS_V3 } from "../steps";
import { SCRIPT_SYSTEM, buildScriptUser } from "../prompts/script";
import { buildCandidate, type RunnerV3 } from "./_shared";

const IMPORTANCE_LABEL: Record<ScriptOutput["charactersPool"][number]["importance"], string> = {
  main: "主角",
  supporting: "配角",
  minor: "次要",
};

export const runScript: RunnerV3 = async (ctx) => {
  const analyze = ctx.prior[STEP_KEYS_V3.ANALYZE] as AnalyzeOutput | undefined;
  const direction = ctx.prior[STEP_KEYS_V3.DIRECTION] as DirectionData | undefined;
  const outline = ctx.prior[STEP_KEYS_V3.OUTLINE] as OutlineOutput | undefined;
  if (!analyze || !direction || !outline) {
    throw new Error("缺少前置产物（analyze / direction / outline），无法拆解剧本");
  }

  const r = await callLLMJson<ScriptOutput>({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: SCRIPT_SYSTEM,
    user: buildScriptUser({
      analyze,
      direction,
      outline,
      initialPrompt: ctx.project.initialPrompt,
    }),
    schema: ScriptSchema,
    mode: "stable",
    maxTokens: 6000,
    metaTag: "comic-v3:script",
  });

  const md = `### 剧本拆解

**总览**：${r.data.scenes.length} 个场景，${r.data.charactersPool.length} 个角色

#### 角色池
${r.data.charactersPool
  .map((c) => `- **${c.name}**（${IMPORTANCE_LABEL[c.importance]}）：${c.description}`)
  .join("\n")}

#### 场景池
${r.data.scenesPool && r.data.scenesPool.length > 0
  ? r.data.scenesPool.map((s) => `- **${s.name}**：${s.description}`).join("\n")
  : "_（无单独场景池，场景描述见各 scene）_"}

#### 场景剧本（前 3 个预览）
${r.data.scenes
  .slice(0, 3)
  .map(
    (sc) => `**场景 ${sc.index} · ${sc.location}**（${sc.timeOfDay}）

出场角色：${sc.characters.join("、")}

${sc.action}

${sc.dialogues.length > 0
  ? sc.dialogues.map((d) => `> **${d.speaker}**：${d.text}`).join("\n")
  : ""}`,
  )
  .join("\n\n---\n\n")}

${r.data.scenes.length > 3 ? `\n_（还有 ${r.data.scenes.length - 3} 个场景未展示，可在确认后查看完整 JSON）_` : ""}`;

  return {
    candidates: [buildCandidate({ kind: "script", data: r.data, mdSummary: md })],
    needsConfirm: true,
    cost: r.cost,
    realCost: r.realCost,
    modelSlug: r.modelSlug,
    channelId: r.channelId,
  };
};
