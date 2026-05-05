/**
 * 电商一键出图 · 前端 API 封装
 *
 * 所有客户端请求统一走这里，方便后续替换 SWR / 加全局错误 toast。
 */

import type { ProjectSnapshot } from "./snapshot";
import type { NodeKey } from "./nodes";

async function request<T>(
  url: string,
  init?: RequestInit & { body?: BodyInit | object | null },
): Promise<T> {
  let body: BodyInit | undefined;
  if (init?.body && typeof init.body === "object" && !(init.body instanceof FormData)) {
    body = JSON.stringify(init.body);
  } else if (init?.body) {
    body = init.body as BodyInit;
  }
  const res = await fetch(url, {
    ...init,
    body,
    headers: {
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ============================================================
// 项目集合
// ============================================================

export interface ProjectListItem {
  id: string;
  title: string;
  status: string;
  currentNode: string | null;
  progress: number;
  coverUrl: string | null;
  finalZipUrl: string | null;
  initialImageCount: number;
  totalCost: number;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
}

export const ecomApi = {
  listProjects: () =>
    request<{ projects: ProjectListItem[] }>("/api/ecom-image/projects"),

  createProject: (input: {
    prompt: string;
    title?: string;
    sourceImageUrls?: string[];
  }) =>
    request<{ projectId: string; status: string }>("/api/ecom-image/projects", {
      method: "POST",
      body: input,
    }),

  createDemoProject: () =>
    request<{ projectId: string; demo: boolean }>("/api/ecom-image/projects", {
      method: "POST",
      body: { demo: true },
    }),

  getSnapshot: (projectId: string) =>
    request<ProjectSnapshot>(`/api/ecom-image/projects/${projectId}`),

  deleteProject: (projectId: string) =>
    request<{ ok: boolean }>(`/api/ecom-image/projects/${projectId}`, {
      method: "DELETE",
    }),

  // ---- 节点动作 ----
  runNode: (
    projectId: string,
    nodeKey: NodeKey,
    body: { modelSlug?: string; sourceImageId?: string } = {},
  ) =>
    request<{ ok: boolean }>(`/api/ecom-image/projects/${projectId}/nodes/${nodeKey}/run`, {
      method: "POST",
      body,
    }),

  // ---- 视觉模型列表 ----
  listVisionModels: () =>
    request<{
      models: Array<{
        slug: string;
        name: string;
        provider: string;
        tags: string[];
        description: string | null;
        contextLength: number | null;
        sellInputPrice: number;
        sellOutputPrice: number;
      }>;
    }>("/api/ecom-image/models"),
  confirmNode: (projectId: string, nodeKey: NodeKey) =>
    request<{ ok: boolean; nextKey: NodeKey | null }>(
      `/api/ecom-image/projects/${projectId}/nodes/${nodeKey}/confirm`,
      { method: "POST", body: {} },
    ),
  rejectNode: (projectId: string, nodeKey: NodeKey, feedback: string) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/nodes/${nodeKey}/reject`,
      { method: "POST", body: { feedback } },
    ),
  skipNode: (projectId: string, nodeKey: NodeKey) =>
    request<{ ok: boolean; nextKey: NodeKey | null }>(
      `/api/ecom-image/projects/${projectId}/nodes/${nodeKey}/skip`,
      { method: "POST", body: {} },
    ),
  rollbackNode: (projectId: string, nodeKey: NodeKey) =>
    request<{ ok: boolean; prevKey: NodeKey }>(
      `/api/ecom-image/projects/${projectId}/nodes/${nodeKey}/rollback`,
      { method: "POST", body: {} },
    ),

  // ---- 单产物动作 ----
  patchSourceImage: (
    projectId: string,
    imageId: string,
    patch: { title?: string; description?: string; analyzeStatus?: string },
  ) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/source-images/${imageId}`,
      { method: "PATCH", body: patch },
    ),
  reanalyzeSourceImage: (projectId: string, imageId: string, feedback?: string) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/source-images/${imageId}/reanalyze`,
      { method: "POST", body: { feedback } },
    ),

  patchImageType: (
    projectId: string,
    typeId: string,
    patch: { selected?: boolean; name?: string; description?: string; plannedCount?: number },
  ) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/image-types/${typeId}`,
      { method: "PATCH", body: patch },
    ),
  deleteImageType: (projectId: string, typeId: string) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/image-types/${typeId}`,
      { method: "DELETE" },
    ),

  patchImagePlan: (
    projectId: string,
    planId: string,
    patch: {
      title?: string;
      description?: string;
      aspectRatio?: string;
      referenceIds?: Array<{ type: "source" | "generated"; id: string }>;
      prompt?: string;
      negativePrompt?: string;
    },
  ) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/image-plans/${planId}`,
      { method: "PATCH", body: patch },
    ),
  deleteImagePlan: (projectId: string, planId: string) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/image-plans/${planId}`,
      { method: "DELETE" },
    ),
  addImagePlan: (
    projectId: string,
    input: {
      imageTypeId: string;
      title?: string;
      description?: string;
      aspectRatio?: string;
      origin?: "manual" | "ai_added";
    },
  ) =>
    request<{ ok: boolean }>(`/api/ecom-image/projects/${projectId}/image-plans`, {
      method: "POST",
      body: input,
    }),

  // ---- 候选图 ----
  patchGeneratedImage: (
    projectId: string,
    genId: string,
    patch: { picked?: boolean },
  ) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/generated-images/${genId}`,
      { method: "PATCH", body: patch },
    ),
  deleteGeneratedImage: (projectId: string, genId: string) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/generated-images/${genId}`,
      { method: "DELETE" },
    ),
  /** 单 plan 追加 / 重试候选（节点 07） */
  generateForPlan: (
    projectId: string,
    planId: string,
    body: { generatedImageId?: string } = {},
  ) =>
    request<{ ok: boolean; generatedImageId?: string }>(
      `/api/ecom-image/projects/${projectId}/image-plans/${planId}/generate`,
      { method: "POST", body },
    ),

  /** 批量提交所有 plan 缺失候选 */
  generateAll: (projectId: string, mode: "missing" | "full" = "missing") =>
    request<{ ok: boolean; inserted: number }>(
      `/api/ecom-image/projects/${projectId}/generate-all`,
      { method: "POST", body: { mode } },
    ),

  /** 重试所有失败候选 */
  retryFailed: (projectId: string) =>
    request<{ ok: boolean; retried: number }>(
      `/api/ecom-image/projects/${projectId}/retry-failed`,
      { method: "POST", body: {} },
    ),

  /** 单张图规划 AI 重写（节点 04） */
  rewriteImagePlan: (
    projectId: string,
    planId: string,
    feedback: string,
    modelSlug?: string,
  ) =>
    request<{ ok: boolean }>(
      `/api/ecom-image/projects/${projectId}/image-plans/${planId}/rewrite`,
      { method: "POST", body: { feedback, modelSlug } },
    ),

  /** 单条 plan 提示词 AI 重写（节点 06） */
  regeneratePromptForPlan: (
    projectId: string,
    planId: string,
    feedback: string,
    modelSlug?: string,
  ) =>
    request<{ ok: boolean; plan: { id: string; prompt: string | null } }>(
      `/api/ecom-image/projects/${projectId}/image-plans/${planId}/regenerate-prompt`,
      { method: "POST", body: { feedback, modelSlug } },
    ),

  // ---- 节点 05 模型配置 ----
  patchModelConfig: (
    projectId: string,
    patch: { imageModelSlug?: string; promptLanguage?: "zh" | "en"; imagesPerPlan?: number },
  ) =>
    request<{ ok: boolean }>(`/api/ecom-image/projects/${projectId}/model-config`, {
      method: "PATCH",
      body: patch,
    }),
};
