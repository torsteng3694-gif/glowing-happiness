/**
 * Step 2. direction — 真实实现（多候选）
 *
 * 设计：3 路并发独立调用，每路用不同的"驱动倾向" hint，强制差异化。
 * 任何一路失败不阻塞整体（如果至少 1 个成功就照常返回；全失败才抛错）。
 */

import { callLLMJson } from "../helpers-llm";
import {
  DirectionDataSchema,
  type AnalyzeOutput,
  type DirectionData,
} from "../schemas";
import { STEP_KEYS_V3 } from "../steps";
import {
  DIRECTION_SYSTEM,
  buildDirectionUser,
  DEFAULT_DIRECTION_VARIANTS,
} from "../prompts/direction";
import { buildCandidate, type RunnerV3 } from "./_shared";

export const runDirection: RunnerV3 = async (ctx) => {
  const analyze = ctx.prior[STEP_KEYS_V3.ANALYZE] as AnalyzeOutput | undefined;
  if (!analyze) {
    throw new Error("缺少 analyze 步的产物，无法生成创意方向");
  }

  // 候选数量受 policy.directionCandidates 控制（默认 3）
  const wantCount = Math.min(
    DEFAULT_DIRECTION_VARIANTS.length,
    Math.max(1, ctx.policy.directionCandidates),
  );
  const variants = DEFAULT_DIRECTION_VARIANTS.slice(0, wantCount);

  // 并发调用：每路用 creative 桶高温度求发散
  const results = await Promise.allSettled(
    variants.map((v) =>
      callLLMJson<DirectionData>({
        userId: ctx.userId,
        modelSlug: ctx.project.llmSlug,
        system: DIRECTION_SYSTEM,
        user: buildDirectionUser({
          variant: v,
          analyze,
          initialPrompt: ctx.project.initialPrompt,
        }),
        schema: DirectionDataSchema,
        mode: "creative",
        maxTokens: 900,
        metaTag: `comic-v3:direction:${v.slug}`,
      }),
    ),
  );

  type Successful = { v: (typeof variants)[number]; cost: number; realCost: number; data: DirectionData; modelSlug: string; channelId: string | null };
  const ok: Successful[] = [];
  const errs: { slug: string; error: string }[] = [];

  results.forEach((res, i) => {
    const v = variants[i];
    if (res.status === "fulfilled") {
      ok.push({
        v,
        cost: res.value.cost,
        realCost: res.value.realCost,
        data: res.value.data,
        modelSlug: res.value.modelSlug,
        channelId: res.value.channelId,
      });
    } else {
      errs.push({
        slug: v.slug,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  });

  if (ok.length === 0) {
    throw new Error(
      `所有 ${variants.length} 路候选生成失败：${errs.map((e) => `[${e.slug}] ${e.error}`).join("；")}`,
    );
  }

  const candidates = ok.map((o) =>
    buildCandidate({
      id: o.data.slug, // 用 slug 做 id 让前端友好（drama/mystery/healing）
      kind: "direction",
      data: o.data,
      mdSummary: `### ${o.v.label} · ${o.data.title}

**主旨**：${o.data.thesis}

**调性**：${o.data.tone}

**差异点**：${o.data.uniqueAngle}

---

${o.data.summary}`,
    }),
  );

  // defaultPickedId：第一个成功的（一般是 drama）
  const defaultPickedId = ok[0].data.slug;

  // 多路调用累计成本
  const cost = ok.reduce((s, o) => s + o.cost, 0);
  const realCost = ok.reduce((s, o) => s + o.realCost, 0);

  return {
    candidates,
    defaultPickedId,
    needsConfirm: true, // 创意发散：强制让用户决策
    cost,
    realCost,
    modelSlug: ok[0].modelSlug,
    channelId: ok[0].channelId,
    meta: errs.length > 0 ? { failedVariants: errs } : undefined,
  };
};
