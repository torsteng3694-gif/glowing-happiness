/**
 * AI 漫剧 · S3.0 — 流水线步骤定义
 *
 * 与 v2 相比，v3 将 14 步重新设计为 10 步：
 *   - 合并 direction_pick / refine / extract → direction
 *   - 合并 novel_adapt / script_breakdown   → script
 *   - 合并 asset_match / keyframes          → keyframes（每镜内含资产匹配）
 *
 * 每一步多了「交互」语义：
 *   - canHaveCandidates：runner 是否会产出多候选（≥2）
 *   - defaultNeedsConfirm：默认是否暂停等用户确认（用户级 mode 可覆盖）
 */

export type StepKindV3 = "llm" | "image" | "video" | "compose";

export type StepDefV3 = {
  /** stepKey 是 step 的唯一标识；不可改名（DB 已有数据会失效） */
  key: string;
  kind: StepKindV3;
  title: string;
  subtitle: string;
  /** UI 时间轴分组：1=剧本 / 2=资产分镜 / 3=成片 */
  group: 1 | 2 | 3;
  /** 依赖前置步骤 key（必须 succeeded 或 skipped） */
  depends: string[];
  /** 是否允许跳过 */
  canSkip: boolean;
  /** 该 step 的 runner 是否会产出 ≥2 个候选 */
  canHaveCandidates: boolean;
  /** 默认是否暂停等用户确认（用户的 project.mode 可覆盖） */
  defaultNeedsConfirm: boolean;
  /** 预估单位用量，用于创建项目时算预估总价 */
  estUnits: number;
};

export const STEP_KEYS_V3 = {
  ANALYZE: "analyze",                 // 1. 意图分析
  DIRECTION: "direction",             // 2. 创意方向
  OUTLINE: "outline",                 // 3. 大纲
  SCRIPT: "script",                   // 4. 剧本
  ASSETS_PLAN: "assets_plan",         // 5. 资产骨架（LLM 推导 prompt，不生图，可审/改）
  ASSETS_RENDER: "assets_render",     // 6. 资产渲染（基于 5 的 prompt 生图，可挑/换模型）
  STORYBOARD: "storyboard",           // 7. 分镜脚本
  KEYFRAMES: "keyframes",             // 8. 关键帧生成
  MOTION: "motion",                   // 9. 视频运动 prompt
  VIDEOS: "videos",                   // 10. 视频生成
  COMPOSE: "compose",                 // 11. 成片合成
} as const;

export const STEPS_V3: StepDefV3[] = [
  {
    key: STEP_KEYS_V3.ANALYZE,
    kind: "llm",
    title: "意图分析",
    subtitle: "解析题材、受众、核心冲突；推荐创作方式",
    group: 1,
    depends: [],
    canSkip: false,
    canHaveCandidates: false,
    defaultNeedsConfirm: false,
    estUnits: 1.2,
  },
  {
    key: STEP_KEYS_V3.DIRECTION,
    kind: "llm",
    title: "创意方向",
    subtitle: "并行产出 3 个差异化方向，由你选定",
    group: 1,
    depends: [STEP_KEYS_V3.ANALYZE],
    canSkip: true,
    canHaveCandidates: true,
    defaultNeedsConfirm: true, // ← 关键决策点，强烈建议人工挑选
    estUnits: 2.4,             // 3 路并发
  },
  {
    key: STEP_KEYS_V3.OUTLINE,
    kind: "llm",
    title: "故事大纲",
    subtitle: "生成章节级大纲与情绪曲线",
    group: 1,
    depends: [STEP_KEYS_V3.DIRECTION],
    canSkip: false,
    canHaveCandidates: false,
    defaultNeedsConfirm: false,
    estUnits: 2.0,
  },
  {
    key: STEP_KEYS_V3.SCRIPT,
    kind: "llm",
    title: "剧本拆解",
    subtitle: "扩写为可拍摄场景，含角色/动作/对白",
    group: 1,
    depends: [STEP_KEYS_V3.OUTLINE],
    canSkip: false,
    canHaveCandidates: false,
    defaultNeedsConfirm: true, // ← 用户常想改场景/对白
    estUnits: 4.0,
  },
  {
    key: STEP_KEYS_V3.ASSETS_PLAN,
    kind: "llm",
    title: "资产骨架",
    subtitle: "为每个角色/场景推导 imagePrompt + visualAnchor（不生图，可审改）",
    group: 2,
    depends: [STEP_KEYS_V3.SCRIPT],
    canSkip: false,
    canHaveCandidates: false,
    defaultNeedsConfirm: true, // ← 让用户审 prompt 后再去花图像费
    estUnits: 1.5,
  },
  {
    key: STEP_KEYS_V3.ASSETS_RENDER,
    kind: "image",
    title: "资产渲染",
    subtitle: "按骨架生成多张候选图；可逐个 asset 重生成或换模型",
    group: 2,
    depends: [STEP_KEYS_V3.ASSETS_PLAN],
    canSkip: false,
    canHaveCandidates: true,
    defaultNeedsConfirm: true,
    /// 估每个项目约 3 个角色 / 场景，单次每个出 1 张 = 3 张
    estUnits: 3,
  },
  {
    key: STEP_KEYS_V3.STORYBOARD,
    kind: "llm",
    title: "分镜脚本",
    subtitle: "导出可执行分镜（景别+运动+时长+对白）",
    group: 2,
    depends: [STEP_KEYS_V3.SCRIPT, STEP_KEYS_V3.ASSETS_RENDER],
    canSkip: false,
    canHaveCandidates: false,
    defaultNeedsConfirm: true,
    estUnits: 3.0,
  },
  {
    key: STEP_KEYS_V3.KEYFRAMES,
    kind: "image",
    title: "关键帧生成",
    subtitle: "逐镜生成关键帧（含资产匹配），单镜可重试",
    group: 3,
    depends: [STEP_KEYS_V3.STORYBOARD],
    canSkip: false,
    canHaveCandidates: false, // 每镜单图，但内部支持 per-shot 重试
    defaultNeedsConfirm: false,
    estUnits: 8,
  },
  {
    key: STEP_KEYS_V3.MOTION,
    kind: "llm",
    title: "运动 Prompt",
    subtitle: "为每张关键帧生成图生视频的运动描述",
    group: 3,
    depends: [STEP_KEYS_V3.KEYFRAMES],
    canSkip: false,
    canHaveCandidates: false,
    defaultNeedsConfirm: false,
    estUnits: 1.5,
  },
  {
    key: STEP_KEYS_V3.VIDEOS,
    kind: "video",
    title: "视频生成",
    subtitle: "把每一镜的关键帧动起来",
    group: 3,
    depends: [STEP_KEYS_V3.MOTION],
    canSkip: false,
    canHaveCandidates: false,
    defaultNeedsConfirm: false,
    estUnits: 40,
  },
  {
    key: STEP_KEYS_V3.COMPOSE,
    kind: "compose",
    title: "成片合成",
    subtitle: "拼接 + 配音 + 字幕（+ BGM 如启用）",
    group: 3,
    depends: [STEP_KEYS_V3.VIDEOS],
    canSkip: false,
    canHaveCandidates: false,
    defaultNeedsConfirm: false,
    estUnits: 40,
  },
];

export const STEP_BY_KEY_V3: Record<string, StepDefV3> = Object.fromEntries(
  STEPS_V3.map((s) => [s.key, s]),
);

/* ============================================================
 * 项目级运行模式
 * ============================================================ */

/** mode：决定 step.defaultNeedsConfirm 怎么被用户的"全局意愿"覆盖 */
export type ProjectMode = "auto" | "step";

/**
 * 实际是否需要用户确认 = 项目 mode + step 默认 + runner 当次返回
 *
 * 优先级（高 → 低）：
 *   1. mode = "step" → 总是 true（用户主动选了"逐步审视"）
 *   2. runner 返回 needsConfirm = true → true
 *   3. step.defaultNeedsConfirm + mode = "auto" → 仍走 step 默认
 *   4. mode = "auto" 且 step.defaultNeedsConfirm = false → false（一路飞）
 */
export function shouldConfirm(opts: {
  mode: ProjectMode;
  stepDefault: boolean;
  runnerWants: boolean;
}): boolean {
  if (opts.mode === "step") return true;
  if (opts.runnerWants) return true;
  return opts.stepDefault;
}

/* ============================================================
 * 扩展能力（用户在创建项目时勾选）
 * ============================================================ */

export type ExtensionKey = "bgm" | "subtitles" | "multiVoice";

export type Extensions = Partial<Record<ExtensionKey, boolean>>;

export const DEFAULT_EXTENSIONS: Extensions = {
  bgm: false,
  subtitles: true,
  multiVoice: false,
};

/* ============================================================
 * Policy（重试 / 候选数 / 超时等）
 * ============================================================ */

export type PolicyV3 = {
  /** 各 step 是否允许跑（用户在前端勾选关掉某些可跳过的） */
  steps: Record<string, boolean>;
  /** 失败重试上限 */
  retry: { llm: number; image: number; video: number };
  /** direction 步骤要产出几个候选（默认 3） */
  directionCandidates: number;
  /** assets 步骤每个角色要产出几张候选（默认 3） */
  assetsCandidatesPerSubject: number;
  /** videos 步骤每镜目标成片数（达到即停止重试，默认 1） */
  videoTargetPerShot: number;
};

export const DEFAULT_POLICY_V3: PolicyV3 = {
  steps: Object.fromEntries(STEPS_V3.map((s) => [s.key, true])),
  retry: { llm: 3, image: 3, video: 8 },
  directionCandidates: 3,
  /// assets 步骤每个角色出 1 张图；不满意走「重生成」
  assetsCandidatesPerSubject: 1,
  videoTargetPerShot: 1,
};

export function normalizePolicyV3(input?: Partial<PolicyV3> | null): PolicyV3 {
  if (!input) {
    return {
      ...DEFAULT_POLICY_V3,
      steps: { ...DEFAULT_POLICY_V3.steps },
      retry: { ...DEFAULT_POLICY_V3.retry },
    };
  }
  const steps: Record<string, boolean> = { ...DEFAULT_POLICY_V3.steps };
  if (input.steps) {
    for (const k of Object.keys(input.steps)) steps[k] = !!input.steps[k];
  }
  const r = (input.retry || {}) as Partial<PolicyV3["retry"]>;
  return {
    steps,
    retry: {
      llm: clampInt(r.llm, 1, 10, DEFAULT_POLICY_V3.retry.llm),
      image: clampInt(r.image, 1, 10, DEFAULT_POLICY_V3.retry.image),
      video: clampInt(r.video, 1, 20, DEFAULT_POLICY_V3.retry.video),
    },
    directionCandidates: clampInt(input.directionCandidates, 1, 5, DEFAULT_POLICY_V3.directionCandidates),
    assetsCandidatesPerSubject: clampInt(
      input.assetsCandidatesPerSubject,
      1,
      5,
      DEFAULT_POLICY_V3.assetsCandidatesPerSubject,
    ),
    videoTargetPerShot: clampInt(
      input.videoTargetPerShot,
      1,
      5,
      DEFAULT_POLICY_V3.videoTargetPerShot,
    ),
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/* ============================================================
 * 进度计算 / 流水线导航
 * ============================================================ */

export function stepIndexV3(key: string): number {
  return STEPS_V3.findIndex((s) => s.key === key);
}

export function nextStepKeyV3(currentKey: string | null | undefined): string | null {
  if (!currentKey) return STEPS_V3[0].key;
  const i = stepIndexV3(currentKey);
  if (i < 0 || i >= STEPS_V3.length - 1) return null;
  return STEPS_V3[i + 1].key;
}

export function calcProjectProgressV3(succeededOrSkippedKeys: string[]): number {
  const total = STEPS_V3.length;
  const done = succeededOrSkippedKeys.filter((k) => STEP_BY_KEY_V3[k]).length;
  return Math.round((done / total) * 100);
}
