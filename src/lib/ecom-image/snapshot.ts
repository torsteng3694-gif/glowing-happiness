/**
 * 电商一键出图 · 项目快照（snapshot）
 *
 * 一次性把 EcomProject + 所有节点 + 子表行（sourceImages / imageTypes /
 * imagePlans / generatedImages / messages）组装成一个 JSON，
 * 给前端 SWR 拉取一次性渲染整个工作台。
 *
 * 该 snapshot 类型也是阶段 1 真实引擎落地后的契约，前端只对接此类型。
 */

import type {
  EcomGeneratedImage,
  EcomImagePlan,
  EcomImageType,
  EcomMessage,
  EcomProject,
  EcomProjectNode,
  EcomSourceImage,
} from "@prisma/client";

import { NODE_META, NODE_ORDER, type NodeKey, type NodeStatus, type ProjectStatus } from "./nodes";
import { safeParseJson } from "./schemas";

// ============================================================
// snapshot 类型（前后端契约）
// ============================================================

export interface NodeView {
  key: NodeKey;
  index: number;
  status: NodeStatus;
  progress: number;
  runStage: string | null;
  runStageText: string | null;
  /** 节点产物 JSON（已 parse） */
  output: unknown;
  feedback: string | null;
  runCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  confirmedAt: string | null;
  /** UI 元信息（标题 / 副标题 / CTA / 子阶段标签） */
  meta: {
    title: string;
    doneSubtitle: string;
    confirmCtaLabel: string;
    runStages: [string, string, string, string];
    skippable: boolean;
    phase: "analyze" | "plan" | "generate";
  };
}

export interface SourceImageView {
  id: string;
  url: string;
  filename: string | null;
  width: number | null;
  height: number | null;
  title: string | null;
  description: string | null;
  analyzeStatus: "pending" | "running" | "done" | "failed" | "excluded";
  analyzeRunCount: number;
  analyzeError: string | null;
  orderIdx: number;
}

export interface ImageTypeView {
  id: string;
  typeKey: string;
  name: string;
  description: string | null;
  priorityTags: string[];
  sceneTags: string[];
  valueChip: string | null;
  platforms: string[];
  reasoning: string | null;
  rating: "win" | "mid" | "low" | null;
  origin: "ai_recommended" | "user_custom";
  selected: boolean;
  plannedCount: number;
  strategy: unknown;
  orderIdx: number;
}

export interface ImagePlanView {
  id: string;
  imageTypeId: string;
  idx: number;
  title: string;
  description: string;
  aspectRatio: string;
  referenceIds: Array<{ type: "source" | "generated"; id: string }>;
  origin: "auto" | "manual" | "ai_added";
  prompt: string | null;
  negativePrompt: string | null;
  orderIdx: number;
}

export interface GeneratedImageView {
  id: string;
  planId: string;
  candidateIdx: number;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  runCount: number;
  url: string | null;
  promptSnapshot: string | null;
  modelSlugSnapshot: string | null;
  width: number | null;
  height: number | null;
  cost: number;
  realCost: number;
  picked: boolean;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface MessageView {
  id: string;
  nodeKey: string;
  role: "user" | "assistant";
  content: string;
  attachments: string[];
  orderIdx: number;
  createdAt: string;
}

export interface ProjectSnapshot {
  project: {
    id: string;
    title: string;
    initialPrompt: string;
    initialImageCount: number;
    status: ProjectStatus;
    currentNode: NodeKey | null;
    progress: number;
    imageModelSlug: string | null;
    promptLanguage: string;
    imagesPerPlan: number | null;
    estimatedCost: number;
    totalCost: number;
    finalZipUrl: string | null;
    coverUrl: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  };
  nodes: NodeView[];
  sourceImages: SourceImageView[];
  imageTypes: ImageTypeView[];
  imagePlans: ImagePlanView[];
  generatedImages: GeneratedImageView[];
  messages: MessageView[];
}

// ============================================================
// 行 → view 的转换器
// ============================================================

function toNodeView(row: EcomProjectNode): NodeView {
  const key = row.nodeKey as NodeKey;
  const meta = NODE_META[key];
  return {
    key,
    index: row.nodeIndex,
    status: row.status as NodeStatus,
    progress: row.progress,
    runStage: row.runStage,
    runStageText: row.runStageText,
    output: safeParseJson<unknown>(row.output, null),
    feedback: row.feedback,
    runCount: row.runCount,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    meta: {
      title: meta.title,
      doneSubtitle: meta.doneSubtitle(safeParseJson(row.output, null)),
      confirmCtaLabel: meta.confirmCtaLabel,
      runStages: meta.runStages,
      skippable: meta.skippable,
      phase: meta.phase,
    },
  };
}

function toSourceImageView(row: EcomSourceImage): SourceImageView {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename,
    width: row.width,
    height: row.height,
    title: row.title,
    description: row.description,
    analyzeStatus: row.analyzeStatus as SourceImageView["analyzeStatus"],
    analyzeRunCount: row.analyzeRunCount,
    analyzeError: row.analyzeError,
    orderIdx: row.orderIdx,
  };
}

function toImageTypeView(row: EcomImageType): ImageTypeView {
  return {
    id: row.id,
    typeKey: row.typeKey,
    name: row.name,
    description: row.description,
    priorityTags: safeParseJson<string[]>(row.priorityTags, []),
    sceneTags: safeParseJson<string[]>(row.sceneTags, []),
    valueChip: row.valueChip,
    platforms: safeParseJson<string[]>(row.platforms, []),
    reasoning: row.reasoning,
    rating: (row.rating as ImageTypeView["rating"]) ?? null,
    origin: row.origin as ImageTypeView["origin"],
    selected: row.selected,
    plannedCount: row.plannedCount,
    strategy: safeParseJson<unknown>(row.strategy, null),
    orderIdx: row.orderIdx,
  };
}

function toImagePlanView(row: EcomImagePlan): ImagePlanView {
  return {
    id: row.id,
    imageTypeId: row.imageTypeId,
    idx: row.idx,
    title: row.title,
    description: row.description,
    aspectRatio: row.aspectRatio,
    referenceIds: safeParseJson<ImagePlanView["referenceIds"]>(row.referenceIds, []),
    origin: row.origin as ImagePlanView["origin"],
    prompt: row.prompt,
    negativePrompt: row.negativePrompt,
    orderIdx: row.orderIdx,
  };
}

function toGeneratedImageView(row: EcomGeneratedImage): GeneratedImageView {
  return {
    id: row.id,
    planId: row.planId,
    candidateIdx: row.candidateIdx,
    status: row.status as GeneratedImageView["status"],
    progress: row.progress,
    runCount: row.runCount,
    url: row.url,
    promptSnapshot: row.promptSnapshot,
    modelSlugSnapshot: row.modelSlugSnapshot,
    width: row.width,
    height: row.height,
    cost: row.cost,
    realCost: row.realCost,
    picked: row.picked,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function toMessageView(row: EcomMessage): MessageView {
  return {
    id: row.id,
    nodeKey: row.nodeKey,
    role: row.role as MessageView["role"],
    content: row.content,
    attachments: safeParseJson<string[]>(row.attachments, []),
    orderIdx: row.orderIdx,
    createdAt: row.createdAt.toISOString(),
  };
}

function toProjectView(row: EcomProject): ProjectSnapshot["project"] {
  return {
    id: row.id,
    title: row.title,
    initialPrompt: row.initialPrompt,
    initialImageCount: row.initialImageCount,
    status: row.status as ProjectStatus,
    currentNode: (row.currentNode as NodeKey | null) ?? null,
    progress: row.progress,
    imageModelSlug: row.imageModelSlug,
    promptLanguage: row.promptLanguage,
    imagesPerPlan: row.imagesPerPlan,
    estimatedCost: row.estimatedCost,
    totalCost: row.totalCost,
    finalZipUrl: row.finalZipUrl,
    coverUrl: row.coverUrl,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ============================================================
// 顶层组装（从一组 prisma 行装出完整 snapshot）
// ============================================================

export interface SnapshotInput {
  project: EcomProject;
  nodes: EcomProjectNode[];
  sourceImages: EcomSourceImage[];
  imageTypes: EcomImageType[];
  imagePlans: EcomImagePlan[];
  generatedImages: EcomGeneratedImage[];
  messages: EcomMessage[];
}

export function buildSnapshot(input: SnapshotInput): ProjectSnapshot {
  // 节点按固定顺序补齐：即使某些节点行还没建好，也输出 7 个槽位
  const nodeMap = new Map(input.nodes.map((n) => [n.nodeKey, n]));
  const nodes: NodeView[] = NODE_ORDER.map((key, idx) => {
    const row = nodeMap.get(key);
    if (row) return toNodeView(row);
    // 占位 NodeView（pending、空 output）
    const meta = NODE_META[key];
    return {
      key,
      index: idx,
      status: "pending",
      progress: 0,
      runStage: null,
      runStageText: null,
      output: null,
      feedback: null,
      runCount: 0,
      errorMessage: null,
      startedAt: null,
      confirmedAt: null,
      meta: {
        title: meta.title,
        doneSubtitle: meta.doneSubtitle(null),
        confirmCtaLabel: meta.confirmCtaLabel,
        runStages: meta.runStages,
        skippable: meta.skippable,
        phase: meta.phase,
      },
    };
  });

  return {
    project: toProjectView(input.project),
    nodes,
    sourceImages: input.sourceImages.map(toSourceImageView).sort((a, b) => a.orderIdx - b.orderIdx),
    imageTypes: input.imageTypes.map(toImageTypeView).sort((a, b) => a.orderIdx - b.orderIdx),
    imagePlans: input.imagePlans.map(toImagePlanView).sort((a, b) => a.orderIdx - b.orderIdx),
    generatedImages: input.generatedImages.map(toGeneratedImageView),
    messages: input.messages.map(toMessageView).sort((a, b) => a.orderIdx - b.orderIdx),
  };
}

// ============================================================
// Prisma 查询封装：一次拉齐一个项目的所有行
// ============================================================

import { prisma } from "@/lib/db";

/** 拉取项目快照；用户不匹配返回 null（鉴权由调用方处理） */
export async function loadProjectSnapshot(
  projectId: string,
): Promise<ProjectSnapshot | null> {
  const project = await prisma.ecomProject.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const [nodes, sourceImages, imageTypes, imagePlans, generatedImages, messages] = await Promise.all([
    prisma.ecomProjectNode.findMany({ where: { projectId }, orderBy: { nodeIndex: "asc" } }),
    prisma.ecomSourceImage.findMany({ where: { projectId }, orderBy: { orderIdx: "asc" } }),
    prisma.ecomImageType.findMany({ where: { projectId }, orderBy: { orderIdx: "asc" } }),
    prisma.ecomImagePlan.findMany({ where: { projectId }, orderBy: { orderIdx: "asc" } }),
    prisma.ecomGeneratedImage.findMany({ where: { projectId } }),
    prisma.ecomMessage.findMany({ where: { projectId }, orderBy: { orderIdx: "asc" } }),
  ]);

  return buildSnapshot({ project, nodes, sourceImages, imageTypes, imagePlans, generatedImages, messages });
}
