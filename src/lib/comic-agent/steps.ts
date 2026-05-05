/**
 * AI 漫剧 · S2.0 — 11 步流水线定义
 *
 * 每步描述：
 *   - key      数据库 stepKey 字段，固定枚举（不可改名，否则历史数据失效）
 *   - kind     执行类型：llm | image | video | compose
 *              决定调度器选哪条 runner、按 token / 图 / 秒 计费
 *   - title    UI 展示标题（与前端 PIPELINE_GROUPS 对齐）
 *   - group    时间轴分组：1=创意构思 / 2=编剧精排 / 3=制作合成
 *   - depends  依赖前置步骤的 stepKey；这一步执行需要这些产物
 *   - canSkip  是否允许用户跳过（不参与最终成片的步骤可跳）
 *   - estUnits 预估的"单位用量"，用于全片预估扣费：
 *              llm 单位=输出 token/1K（参考值）
 *              image 单位=张数
 *              video 单位=秒数
 *              compose 单位=秒数（按总时长）
 */

export type StepKind = "llm" | "image" | "video" | "compose";

export type StepDef = {
  key: string;
  kind: StepKind;
  title: string;
  subtitle: string;
  group: 1 | 2 | 3;
  depends: string[];
  canSkip: boolean;
  /** 估算单位（仅用于创建项目时算预估总价；真实扣费按实际跑出来的量） */
  estUnits: number;
};

export const STEP_KEYS = {
  // —— 剧本创作阶段（7）——
  INTENT_ANALYSIS: "intent_analysis",        // 意图分析
  DIRECTION_PICK: "direction_pick",          // 创意方向
  DIRECTION_REFINE: "direction_refine",      // 微调方向
  DIRECTION_EXTRACT: "direction_extract",    // 提炼方向
  OUTLINE: "outline",                        // 创意大纲
  NOVEL_ADAPT: "novel_adapt",                // 小说创作
  SCRIPT_BREAKDOWN: "script_breakdown",      // 剧本转换
  // —— 资产与分镜阶段（2）——
  SUBJECT_BINDING: "subject_binding",        // 资产提取
  STORYBOARD_SCRIPT: "storyboard_script",    // 分镜脚本
  // —— 视频制作阶段（4）——
  ASSET_MATCH: "asset_match",                // 匹配出镜资产
  KEYFRAMES: "keyframes",                    // 生成分镜图
  MOTION_PROMPT: "motion_prompt",            // 生成视频提示词
  VIDEO_GEN: "video_gen",                    // 批量生成视频
  // —— 终态合成（1）——
  VIDEO_COMPOSE: "video_compose",            // 视频合成
} as const;

export const STEPS: StepDef[] = [
  // ===== 剧本创作阶段（group 1） =====
  {
    key: STEP_KEYS.INTENT_ANALYSIS,
    kind: "llm",
    title: "意图分析",
    subtitle: "解析题材、受众、核心冲突；推荐创作方式",
    group: 1,
    depends: [],
    canSkip: false,
    estUnits: 1.2,
  },
  {
    key: STEP_KEYS.DIRECTION_PICK,
    kind: "llm",
    title: "创意方向",
    subtitle: "给出多个创意方向候选，自动选一",
    group: 1,
    depends: [STEP_KEYS.INTENT_ANALYSIS],
    canSkip: true,
    estUnits: 1.0,
  },
  {
    key: STEP_KEYS.DIRECTION_REFINE,
    kind: "llm",
    title: "微调方向",
    subtitle: "对方向做局部调整，候选并自动选一",
    group: 1,
    depends: [STEP_KEYS.DIRECTION_PICK],
    canSkip: true,
    estUnits: 0.8,
  },
  {
    key: STEP_KEYS.DIRECTION_EXTRACT,
    kind: "llm",
    title: "提炼方向",
    subtitle: "提炼最终方向 + 一句话主旨",
    group: 1,
    depends: [STEP_KEYS.DIRECTION_REFINE],
    canSkip: true,
    estUnits: 0.6,
  },
  {
    key: STEP_KEYS.OUTLINE,
    kind: "llm",
    title: "创意大纲",
    subtitle: "生成章节级大纲与情绪曲线",
    group: 1,
    depends: [STEP_KEYS.DIRECTION_EXTRACT],
    canSkip: false,
    estUnits: 2.0,
  },
  {
    key: STEP_KEYS.NOVEL_ADAPT,
    kind: "llm",
    title: "小说创作",
    subtitle: "把大纲扩写成可拍摄文本",
    group: 1,
    depends: [STEP_KEYS.OUTLINE],
    canSkip: true,
    estUnits: 3.0,
  },
  {
    key: STEP_KEYS.SCRIPT_BREAKDOWN,
    kind: "llm",
    title: "剧本转换",
    subtitle: "拆出场景、角色、对白",
    group: 1,
    depends: [STEP_KEYS.OUTLINE],
    canSkip: false,
    estUnits: 2.5,
  },
  // ===== 资产与分镜阶段（group 2） =====
  {
    key: STEP_KEYS.SUBJECT_BINDING,
    kind: "image",
    title: "资产提取",
    subtitle: "为每个角色/场景/道具生成视觉锚定参考图",
    group: 2,
    depends: [STEP_KEYS.SCRIPT_BREAKDOWN],
    canSkip: false,
    estUnits: 3,
  },
  {
    key: STEP_KEYS.STORYBOARD_SCRIPT,
    kind: "llm",
    title: "分镜脚本",
    subtitle: "导出可执行的分镜脚本（景别+运动+时长+对白）",
    group: 2,
    depends: [STEP_KEYS.SCRIPT_BREAKDOWN, STEP_KEYS.SUBJECT_BINDING],
    canSkip: false,
    estUnits: 3.0,
  },
  // ===== 视频制作阶段（group 3） =====
  {
    key: STEP_KEYS.ASSET_MATCH,
    kind: "llm",
    title: "匹配出镜资产",
    subtitle: "为每个分镜匹配出场角色/场景/道具",
    group: 3,
    depends: [STEP_KEYS.STORYBOARD_SCRIPT, STEP_KEYS.SUBJECT_BINDING],
    canSkip: false,
    estUnits: 1.0,
  },
  {
    key: STEP_KEYS.KEYFRAMES,
    kind: "image",
    title: "生成分镜图",
    subtitle: "按分镜逐帧生成关键帧画面",
    group: 3,
    depends: [STEP_KEYS.ASSET_MATCH],
    canSkip: false,
    estUnits: 8,
  },
  {
    key: STEP_KEYS.MOTION_PROMPT,
    kind: "llm",
    title: "生成视频提示词",
    subtitle: "为每张关键帧生成图生视频的运动 prompt",
    group: 3,
    depends: [STEP_KEYS.KEYFRAMES],
    canSkip: false,
    estUnits: 1.5,
  },
  {
    key: STEP_KEYS.VIDEO_GEN,
    kind: "video",
    title: "批量生成视频",
    subtitle: "把每一帧动起来（图生视频，达到目标数即止）",
    group: 3,
    depends: [STEP_KEYS.MOTION_PROMPT],
    canSkip: false,
    estUnits: 40,
  },
  {
    key: STEP_KEYS.VIDEO_COMPOSE,
    kind: "compose",
    title: "视频合成",
    subtitle: "拼接 + 配音 + 字幕 + 转场",
    group: 3,
    depends: [STEP_KEYS.VIDEO_GEN],
    canSkip: false,
    estUnits: 40,
  },
];

export const STEP_BY_KEY: Record<string, StepDef> = Object.fromEntries(
  STEPS.map((s) => [s.key, s]),
);

/* ============================================================
 * AutoRunPolicy：智能托管时的细化策略
 * ============================================================ */

export type AutoRunPolicy = {
  /// 13/15 个步骤的"是否自动跑"。未列出 = 跟随默认（true）
  steps: Record<string, boolean>;
  /// 失败重试上限
  retry: {
    chat: number;
    image: number;
    video: number;
  };
  /// 视频生成时每镜的目标成片数（>=1，达到即停止重试）
  videoTargetPerShot: number;
};

export const DEFAULT_AUTO_POLICY: AutoRunPolicy = {
  steps: Object.fromEntries(STEPS.map((s) => [s.key, true])),
  retry: { chat: 5, image: 5, video: 10 },
  videoTargetPerShot: 1,
};

/**
 * 把外部传入的（可能局部）policy 与默认值合并，得到一份完整 policy。
 * 字段缺失全部走默认。
 */
export function normalizeAutoPolicy(input?: Partial<AutoRunPolicy> | null): AutoRunPolicy {
  if (!input) return { ...DEFAULT_AUTO_POLICY, steps: { ...DEFAULT_AUTO_POLICY.steps } };
  const steps: Record<string, boolean> = { ...DEFAULT_AUTO_POLICY.steps };
  if (input.steps) {
    for (const k of Object.keys(input.steps)) {
      steps[k] = !!input.steps[k];
    }
  }
  const r = (input.retry || {}) as Partial<AutoRunPolicy["retry"]>;
  return {
    steps,
    retry: {
      chat: clampInt(r.chat, 1, 20, DEFAULT_AUTO_POLICY.retry.chat),
      image: clampInt(r.image, 1, 20, DEFAULT_AUTO_POLICY.retry.image),
      video: clampInt(r.video, 1, 30, DEFAULT_AUTO_POLICY.retry.video),
    },
    videoTargetPerShot: clampInt(
      input.videoTargetPerShot,
      1,
      5,
      DEFAULT_AUTO_POLICY.videoTargetPerShot,
    ),
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function stepIndex(key: string): number {
  return STEPS.findIndex((s) => s.key === key);
}

export function nextStepKey(currentKey: string | null | undefined): string | null {
  if (!currentKey) return STEPS[0].key;
  const i = stepIndex(currentKey);
  if (i < 0 || i >= STEPS.length - 1) return null;
  return STEPS[i + 1].key;
}

/** 计算项目当前进度 0-100：按已完成步数 / 总步数 */
export function calcProjectProgress(succeededKeys: string[]): number {
  const total = STEPS.length;
  const done = succeededKeys.filter((k) => STEP_BY_KEY[k]).length;
  return Math.round((done / total) * 100);
}
