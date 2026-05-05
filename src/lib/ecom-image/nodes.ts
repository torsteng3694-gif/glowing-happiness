/**
 * 电商一键出图 · 7 节点常量与元信息
 *
 * 与 prisma schema 中 EcomProjectNode.nodeKey 一一对应。
 * UI 与引擎共享此处定义的 NODE_KEYS / NODE_META。
 */

export const NODE_KEYS = {
  PRODUCT_ANALYSIS: "product_analysis",
  SUPPLEMENT_INFO: "supplement_info",
  IMAGE_ANALYSIS: "image_analysis",
  PLAN_CREATION: "plan_creation",
  MODEL_SELECTION: "model_selection",
  PROMPT_GENERATION: "prompt_generation",
  IMAGE_GENERATION: "image_generation",
} as const;

export type NodeKey = (typeof NODE_KEYS)[keyof typeof NODE_KEYS];

/**
 * 7 节点的固定顺序（节点 index 0~6）。
 *
 * 注意：4/5 已互换，模型选择放在方案规划之前。
 * 这样能保证：
 *   - 方案规划阶段就知道用的哪个生图模型，可以按模型支持范围给出 aspectRatio
 *   - 提示词生成阶段也能知道目标模型的语言/风格偏好
 */
export const NODE_ORDER: NodeKey[] = [
  NODE_KEYS.PRODUCT_ANALYSIS,
  NODE_KEYS.SUPPLEMENT_INFO,
  NODE_KEYS.IMAGE_ANALYSIS,
  NODE_KEYS.MODEL_SELECTION, // 04 = 模型选择（先锁定模型）
  NODE_KEYS.PLAN_CREATION, //   05 = 方案规划（在锁定模型的约束下）
  NODE_KEYS.PROMPT_GENERATION,
  NODE_KEYS.IMAGE_GENERATION,
];

/** 节点状态机：与 prisma EcomProjectNode.status 字面量一致 */
export const NODE_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  AWAITING_REVIEW: "awaiting_review",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  SKIPPED: "skipped",
  FAILED: "failed",
} as const;

export type NodeStatus = (typeof NODE_STATUS)[keyof typeof NODE_STATUS];

/** 项目级状态：与 prisma EcomProject.status 字面量一致 */
export const PROJECT_STATUS = {
  DRAFT: "draft",
  RUNNING: "running",
  AWAITING_USER: "awaiting_user",
  COMPLETED: "completed",
  FAILED: "failed",
  PAUSED: "paused",
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export interface NodeMeta {
  key: NodeKey;
  index: number;
  /** 阶段分组：分析 / 规划 / 出图 */
  phase: "analyze" | "plan" | "generate";
  /** 折叠卡 / 进行中 / 完成态 标题 */
  title: string;
  /** 完成态副标题 */
  doneSubtitle: (output: unknown) => string;
  /** 主操作按钮文案（确认进入下一节点） */
  confirmCtaLabel: string;
  /** 子阶段标签（4 段进度条用），各节点可不同 */
  runStages: [string, string, string, string];
  /** 是否允许 skip（节点 02 资料补全 = true，其他都是 false） */
  skippable: boolean;
}

export const NODE_META: Record<NodeKey, NodeMeta> = {
  [NODE_KEYS.PRODUCT_ANALYSIS]: {
    key: NODE_KEYS.PRODUCT_ANALYSIS,
    index: 0,
    phase: "analyze",
    title: "商品智能分析",
    doneSubtitle: () => "已为您规划出图类型，请勾选需要的类型",
    confirmCtaLabel: "确认选择并继续",
    runStages: ["调度", "识别", "构建", "完成"],
    skippable: false,
  },
  [NODE_KEYS.SUPPLEMENT_INFO]: {
    key: NODE_KEYS.SUPPLEMENT_INFO,
    index: 1,
    phase: "analyze",
    title: "资料补全",
    doneSubtitle: () => "AI 判断当前信息已足够，可直接进入下一步",
    confirmCtaLabel: "确认并继续",
    runStages: ["调度", "提问", "整理", "完成"],
    skippable: true,
  },
  [NODE_KEYS.IMAGE_ANALYSIS]: {
    key: NODE_KEYS.IMAGE_ANALYSIS,
    index: 2,
    phase: "analyze",
    title: "图片内容分析",
    doneSubtitle: () => "每张图已独立解析，可微调标题与描述",
    confirmCtaLabel: "确认分析结果并继续",
    runStages: ["调度", "解析", "整理", "完成"],
    skippable: false,
  },
  [NODE_KEYS.MODEL_SELECTION]: {
    key: NODE_KEYS.MODEL_SELECTION,
    index: 3,
    phase: "plan",
    title: "模型选择",
    doneSubtitle: () => "锁定本项目的生图模型 + 出图参数（提示词语言、每方案张数）",
    confirmCtaLabel: "确认模型并继续",
    runStages: ["调度", "拉取", "整理", "完成"],
    skippable: false,
  },
  [NODE_KEYS.PLAN_CREATION]: {
    key: NODE_KEYS.PLAN_CREATION,
    index: 4,
    phase: "plan",
    title: "出图方案规划",
    doneSubtitle: () => "在已锁模型的约束下生成方案，可增删 / 编辑每张图规划",
    confirmCtaLabel: "确认出图方案并继续",
    runStages: ["调度", "思考", "构建", "完成"],
    skippable: false,
  },
  [NODE_KEYS.PROMPT_GENERATION]: {
    key: NODE_KEYS.PROMPT_GENERATION,
    index: 5,
    phase: "generate",
    title: "提示词生成",
    doneSubtitle: () => "每张图的提示词已生成，可逐条审阅与编辑",
    confirmCtaLabel: "确认提示词并开始出图",
    runStages: ["调度", "撰写", "校对", "完成"],
    skippable: false,
  },
  [NODE_KEYS.IMAGE_GENERATION]: {
    key: NODE_KEYS.IMAGE_GENERATION,
    index: 6,
    phase: "generate",
    title: "批量出图",
    doneSubtitle: () => "图片生成完成，可挑选最满意的并批量下载",
    confirmCtaLabel: "完成项目",
    runStages: ["排队", "渲染", "汇总", "完成"],
    skippable: false,
  },
};

/** 阶段标签（落地页/列表页可视化用） */
export const PHASE_LABEL: Record<NodeMeta["phase"], string> = {
  analyze: "分析",
  plan: "规划",
  generate: "出图",
};

/** 给定 nodeKey 拿 nodeIndex（封装 NODE_ORDER.indexOf 的语义） */
export function getNodeIndex(key: NodeKey): number {
  return NODE_ORDER.indexOf(key);
}

/** 给定 index 拿 nodeKey；越界返回 null */
export function getNodeByIndex(index: number): NodeKey | null {
  return NODE_ORDER[index] ?? null;
}

/** 给定 nodeKey 拿下一个 nodeKey；末节点返回 null */
export function getNextNodeKey(key: NodeKey): NodeKey | null {
  const idx = getNodeIndex(key);
  return getNodeByIndex(idx + 1);
}

/** 给定 nodeKey 拿上一个 nodeKey；首节点返回 null */
export function getPrevNodeKey(key: NodeKey): NodeKey | null {
  const idx = getNodeIndex(key);
  return idx <= 0 ? null : getNodeByIndex(idx - 1);
}
