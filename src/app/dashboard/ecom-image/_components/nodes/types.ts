/**
 * 节点组件统一的 props 与 callback 类型
 *
 * 节点组件接收：
 *   - node: NodeView（snapshot 中对应的节点行）
 *   - snapshot: ProjectSnapshot（拉取的整体数据，便于跨节点引用）
 *   - actions: 节点级动作 + 单产物级动作
 *
 * 阶段 0：actions 由 Workspace 容器实现（调 fetch），节点组件只 emit 不 fetch。
 */

import type {
  GeneratedImageView,
  ImagePlanView,
  ImageTypeView,
  NodeView,
  ProjectSnapshot,
  SourceImageView,
} from "@/lib/ecom-image/snapshot";

/** 节点级动作（每个节点都需要） */
export interface NodeActions {
  /** 确认当前节点并进入下一节点 */
  onConfirm: () => Promise<void>;
  /** 驳回当前节点（带反馈），随后会自动重新 run */
  onReject: (feedback: string) => Promise<void>;
  /** 回退到上一节点 */
  onRollback: () => Promise<void>;
  /** 跳过当前节点（仅节点 02 等可跳过节点用） */
  onSkip?: () => Promise<void>;
}

/** 节点 01 卡片级动作 */
export interface ImageTypeActions {
  /** 切换勾选 */
  onToggleSelected: (typeId: string, selected: boolean) => Promise<void>;
  /** 修改名称/描述 */
  onPatch: (typeId: string, patch: { name?: string; description?: string }) => Promise<void>;
  /** 删除 */
  onDelete: (typeId: string) => Promise<void>;
}

/** 节点 03 卡片级动作 */
export interface SourceImageActions {
  /** 修改标题/描述 */
  onPatch: (
    imageId: string,
    patch: { title?: string; description?: string },
  ) => Promise<void>;
  /** 重新分析（带反馈） */
  onReanalyze: (imageId: string, feedback?: string) => Promise<void>;
  /** 切换"不分析这张" */
  onToggleExclude: (imageId: string, excluded: boolean) => Promise<void>;
}

/** 节点 04 卡片级动作 */
export interface PlanActions {
  /** 修改 plan 字段 */
  onPatchPlan: (
    planId: string,
    patch: {
      title?: string;
      description?: string;
      aspectRatio?: string;
      referenceIds?: Array<{ type: "source" | "generated"; id: string }>;
      prompt?: string;
      negativePrompt?: string;
    },
  ) => Promise<void>;
  /** 删除单个 plan */
  onDeletePlan: (planId: string) => Promise<void>;
  /** 在某个 type 下追加新 plan（manual 或 ai_added） */
  onAddPlan: (typeId: string, origin: "manual" | "ai_added") => Promise<void>;
  /** 节点 04：单张图规划 AI 重写（带反馈） */
  onRewritePlan: (planId: string, feedback: string) => Promise<void>;
  /** 节点 06：单条 plan 的提示词 AI 重写（带反馈，调真 LLM） */
  onRegeneratePrompt: (planId: string, feedback: string) => Promise<void>;
}

/** 节点 05 卡片级动作（项目级模型配置） */
export interface ModelConfigActions {
  onPatch: (patch: {
    imageModelSlug?: string;
    promptLanguage?: "zh" | "en";
    imagesPerPlan?: number;
  }) => Promise<void>;
}

/** 节点 07 卡片级动作 */
export interface GeneratedImageActions {
  /** 切换 picked */
  onTogglePicked: (genId: string, picked: boolean) => Promise<void>;
  /** 删除候选 */
  onDelete: (genId: string) => Promise<void>;
  /** 触发新一轮生成
   *   - generatedImageId 不传：新增一张候选
   *   - generatedImageId 传：把该候选重置为 queued（重试 / 失败重生）
   */
  onGenerate: (planId: string, generatedImageId?: string) => Promise<void>;
  /** 节点 07 顶部"全部生成" */
  onGenerateAll: (mode?: "missing" | "full") => Promise<void>;
  /** 重试所有失败 */
  onRetryFailed: () => Promise<void>;
}

/** 节点公共 props */
export interface NodeComponentProps {
  node: NodeView;
  snapshot: ProjectSnapshot;
  actions: NodeActions;
  /** 阶段 0：mock 模式下用此 flag 控制某些"还没接入"的提示 */
  busy?: boolean;
  /** 是否是节点流的最后一个（用于不画下方延伸虚线） */
  isLast?: boolean;
}

// 重新导出常用 view 类型，避免节点组件每个都长 import
export type {
  GeneratedImageView,
  ImagePlanView,
  ImageTypeView,
  NodeView,
  ProjectSnapshot,
  SourceImageView,
};
