/**
 * 节点 05 · 模型选择 runner
 *
 * 不调 LLM，仅从 prisma Model 表拉 type=image、enabled、有启用 channel 的模型。
 * 输出写入节点 output.availableModels；用户在 UI 中选定后通过 model-config API 落到 EcomProject。
 *
 * 默认值（首次运行）：
 *   - selectedSlug: 拉到的第一个（按 priority 排序）
 *   - promptLanguage: zh
 *   - imagesPerPlan: 2
 */

import { prisma } from "@/lib/db";
import { NODE_KEYS } from "../nodes";
import { ModelSelectionOutputSchema, type SelectableModel } from "../schemas";

/**
 * 推断模型偏好的提示词语言（基于 slug / tags）
 */
function inferPreferredLanguage(slug: string, tags: string | null): "zh" | "en" | undefined {
  const t = (tags ?? "").toLowerCase();
  const s = slug.toLowerCase();
  if (t.includes("英文") || t.includes("english")) return "en";
  if (t.includes("中文") || t.includes("国产") || t.includes("国风")) return "zh";
  // GPT-image / DALL-E 类英文偏好；nano-banana / seedream / 即梦 等中文偏好
  if (/^gpt-image|dall-?e|imagen/i.test(s)) return "en";
  if (/^(nano-banana|seedream|jimeng|wanx|cogview|kolors)/i.test(s)) return "zh";
  return undefined;
}

export interface RunModelSelectionOpts {
  projectId: string;
  /** reject 时的反馈，节点 05 不调 LLM 故无效，仅记录 */
  feedback?: string | null;
}

export async function runModelSelection(opts: RunModelSelectionOpts) {
  const { projectId } = opts;

  const project = await prisma.ecomProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("项目不存在");

  // 拉所有启用的 image 模型 + 至少有一个启用 channel
  const rows = await prisma.model.findMany({
    where: {
      type: "image",
      enabled: true,
      channels: { some: { enabled: true } },
    },
    select: {
      slug: true,
      name: true,
      description: true,
      tags: true,
      unitPrice: true,
      unit: true,
      provider: { select: { slug: true, name: true } },
      channels: {
        where: { enabled: true },
        orderBy: { priority: "asc" },
        select: { sellUnitPrice: true, name: true },
        take: 1,
      },
    },
    orderBy: { slug: "asc" },
  });

  if (rows.length === 0) {
    throw new Error("当前没有可用的生图模型，请联系管理员开启");
  }

  const availableModels: SelectableModel[] = rows.map((m) => {
    const tags = (m.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    // 价格：渠道 sellUnitPrice 优先，否则 model.unitPrice
    const price = m.channels[0]?.sellUnitPrice ?? m.unitPrice ?? 0;
    return {
      slug: m.slug,
      name: m.name,
      description: m.description ?? undefined,
      unitPrice: price,
      tags,
      preferredLanguage: inferPreferredLanguage(m.slug, m.tags),
      sampleUrls: [],
    };
  });

  // 默认选定（沿用项目已锁定的，否则取第一个）
  const currentSelected = project.imageModelSlug;
  const selectedSlug =
    currentSelected && availableModels.some((m) => m.slug === currentSelected)
      ? currentSelected
      : availableModels[0]?.slug ?? null;

  const promptLanguage = (project.promptLanguage as "zh" | "en") ?? "zh";
  const imagesPerPlan = project.imagesPerPlan ?? 2;

  // 估算总价（plans × 候选数 × 单价）
  const planCount = await prisma.ecomImagePlan.count({ where: { projectId } });
  const selectedModel = availableModels.find((m) => m.slug === selectedSlug);
  const estimatedTotalCost = (selectedModel?.unitPrice ?? 0) * planCount * imagesPerPlan;

  const output = ModelSelectionOutputSchema.parse({
    availableModels,
    selectedSlug,
    promptLanguage,
    imagesPerPlan,
    estimatedTotalCost,
  });

  await prisma.ecomProjectNode.update({
    where: {
      projectId_nodeKey: { projectId, nodeKey: NODE_KEYS.MODEL_SELECTION },
    },
    data: { output: JSON.stringify(output) },
  });

  // 首次运行时把默认 selectedSlug 写到 EcomProject（如果之前没锁定）
  if (!project.imageModelSlug && selectedSlug) {
    await prisma.ecomProject.update({
      where: { id: projectId },
      data: { imageModelSlug: selectedSlug },
    });
  }
}
