/**
 * Step 5. assets_plan — 资产骨架（仅 LLM 推导，不生图）
 *
 * 流程：
 *   1. 读 prior script，合并 charactersPool + scenesPool
 *   2. 一次 LLM 调用产出每个 asset 的 imagePrompt + visualAnchor + negativePrompt
 *   3. 写 ComicAssetV3 行（已存在则复用）
 *      genStatus = "planned"（骨架已就绪，等待 assets_render 步去生图）
 *   4. needsConfirm = true：让用户审核 prompt 才往下走
 *
 * 设计意图：
 *   - 把"创意导演" 和 "图像生成"两件事分开
 *   - 用户能在 0 图像费用 的情况下迭代 prompt
 *   - 出错时定位极清晰：plan 错 = LLM 问题；render 错 = 图像模型/上游问题
 */

import { prisma } from "@/lib/db";
import { callLLMJson } from "../helpers-llm";
import { AssetsPlanOutputSchema, type AssetsPlanOutput, type ScriptOutput } from "../schemas";
import { STEP_KEYS_V3 } from "../steps";
import {
  ASSETS_PREP_SYSTEM,
  AssetPrepBatchSchema,
  buildAssetsPrepUser,
} from "../prompts/assets-prep";
import { buildCandidate, type RunnerV3 } from "./_shared";

const TYPE_ICON: Record<"character" | "scene" | "prop", string> = {
  character: "👤",
  scene: "🏞️",
  prop: "🎯",
};

export const runAssetsPlan: RunnerV3 = async (ctx) => {
  const script = ctx.prior[STEP_KEYS_V3.SCRIPT] as ScriptOutput | undefined;
  if (!script) {
    throw new Error("缺少 script 步的产物，无法生成资产骨架");
  }

  // ====== 1. 准备输入 ======
  const charItems = (script.charactersPool || []).map((c) => ({
    type: "character" as const,
    name: c.name,
    description: c.description,
  }));
  const sceneItems = (script.scenesPool || []).map((s) => ({
    type: "scene" as const,
    name: s.name,
    description: s.description,
  }));
  const allItems = [...charItems, ...sceneItems];

  if (allItems.length === 0) {
    return {
      candidates: [
        buildCandidate({
          kind: "assets_plan",
          data: AssetsPlanOutputSchema.parse({ assets: [] }),
          mdSummary:
            "### 资产骨架\n剧本未声明任何角色/场景。可直接确认进入下一步。",
        }),
      ],
      needsConfirm: false,
      cost: 0,
      realCost: 0,
    };
  }

  // ====== 2. LLM 推导 ======
  // 动态 maxTokens（每 asset ~700 token + 1000 余量；封顶 12000）
  const dynamicMaxTokens = Math.min(12000, allItems.length * 700 + 1000);
  const prep = await callLLMJson({
    userId: ctx.userId,
    modelSlug: ctx.project.llmSlug,
    system: ASSETS_PREP_SYSTEM,
    user: buildAssetsPrepUser({
      script,
      styleHint: ctx.project.style,
      aspectRatio: ctx.project.aspectRatio,
    }),
    schema: AssetPrepBatchSchema,
    mode: "stable",
    maxTokens: dynamicMaxTokens,
    metaTag: "comic-v3:assets_plan",
  });

  const prepMap = new Map<string, (typeof prep.data.items)[number]>();
  for (const it of prep.data.items) prepMap.set(it.name, it);

  // ====== 3. 写 / 复用 ComicAssetV3 ======
  // 重跑场景：同 (projectId, name) 已存在则复用（保留之前生成的图，让用户决定是否清理）
  const existing = await prisma.comicAssetV3.findMany({
    where: { projectId: ctx.projectId },
  });
  const existingByName = new Map(existing.map((a) => [a.name, a]));

  const finalAssetIds: string[] = [];

  for (let i = 0; i < allItems.length; i++) {
    const it = allItems[i];
    const p = prepMap.get(it.name);
    if (!p) {
      // LLM 漏了这个 asset，我们仍创建一行（imagePrompt 留空，让用户手动填）
      const row = await prisma.comicAssetV3.create({
        data: {
          projectId: ctx.projectId,
          type: it.type,
          name: it.name,
          description: it.description,
          orderIdx: i,
          genStatus: "pending",
          genError: "LLM 未为此资产生成 prompt，请手动填写后再渲染",
        },
      });
      finalAssetIds.push(row.id);
      continue;
    }

    const existingRow = existingByName.get(it.name);
    if (!existingRow) {
      const row = await prisma.comicAssetV3.create({
        data: {
          projectId: ctx.projectId,
          type: it.type,
          name: it.name,
          description: it.description,
          visualAnchor: p.visualAnchor,
          imagePrompt: p.imagePrompt,
          negativePrompt: p.negativePrompt ?? null,
          orderIdx: i,
          genStatus: "planned",
        },
      });
      finalAssetIds.push(row.id);
    } else {
      // 复用：仅更新 prompt（保留 candidates / pickedUrl / 用户编辑过的字段）
      // 但若该行此前是 failed/pending，重置为 planned 让 render 能跑它
      const nextStatus =
        existingRow.genStatus === "ready" || existingRow.genStatus === "awaiting_pick"
          ? existingRow.genStatus
          : "planned";
      const row = await prisma.comicAssetV3.update({
        where: { id: existingRow.id },
        data: {
          visualAnchor: p.visualAnchor,
          imagePrompt: p.imagePrompt,
          negativePrompt: p.negativePrompt ?? null,
          genStatus: nextStatus,
          genError: null,
        },
      });
      finalAssetIds.push(row.id);
    }
  }

  // ====== 4. 构造产物 ======
  const finalAssets = await prisma.comicAssetV3.findMany({
    where: { projectId: ctx.projectId, id: { in: finalAssetIds } },
    orderBy: { orderIdx: "asc" },
  });

  const data: AssetsPlanOutput = AssetsPlanOutputSchema.parse({
    assets: finalAssets.map((a) => ({
      id: a.id,
      type: a.type as "character" | "scene" | "prop",
      name: a.name,
      imagePrompt: a.imagePrompt,
      visualAnchor: a.visualAnchor,
      negativePrompt: a.negativePrompt,
      imageModelOverride: a.imageModelOverride,
    })),
  });

  const md = `### 资产骨架（已就绪，未生图）

共 **${finalAssets.length}** 个资产，每个都已得到 imagePrompt + 视觉锚。

${finalAssets
  .map(
    (a) =>
      `- ${TYPE_ICON[a.type as "character" | "scene" | "prop"]} **${a.name}** ${
        a.imagePrompt ? "✓ 已生成 prompt" : "⚠ 缺失 prompt"
      }`,
  )
  .join("\n")}

请在右侧工作台审阅每个资产的 prompt，必要时修改后再确认进入下一步（生图）。

> 这一步**不消耗图像模型费用**，可以反复重跑直到 prompt 合适。`;

  return {
    candidates: [
      buildCandidate({
        kind: "assets_plan",
        data,
        mdSummary: md,
      }),
    ],
    needsConfirm: true,
    cost: prep.cost,
    realCost: prep.realCost,
    modelSlug: prep.modelSlug,
    channelId: prep.channelId,
    meta: { assetCount: finalAssets.length },
  };
};
