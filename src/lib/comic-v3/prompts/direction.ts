/**
 * Step 2. direction — 创意方向 prompt
 *
 * 关键设计：
 *   - **不让一个 LLM 调用产出 3 个候选**（v2 的做法），那样 LLM 会偷懒给 3 个换皮方案
 *   - 改为**并发 3 路独立调用**，每路用不同的"驱动倾向" hint，强制差异化
 *   - 每路都用 creative 桶高温度求发散
 *
 * 3 路倾向（可在 policy 里调整数量）：
 *   - drama   戏剧冲突向：用激烈外冲突推动主角内变
 *   - mystery 悬疑反转向：层层揭示真相，反转出人意料
 *   - healing 情感治愈向：细腻情感、慢节奏、自我和解
 */

import { SYS_BASE, SYS_CREATIVE_HINT } from "./system";
import type { AnalyzeOutput } from "../schemas";

export const DIRECTION_SYSTEM = SYS_BASE + SYS_CREATIVE_HINT;

export type DirectionVariant = {
  /** 候选 id（写到 candidate.id） */
  slug: string;
  /** 候选标题（也是 UI 上的标签） */
  label: string;
  /** 给 LLM 的"驱动倾向"提示 */
  drive: string;
};

export const DEFAULT_DIRECTION_VARIANTS: DirectionVariant[] = [
  {
    slug: "drama",
    label: "戏剧冲突向",
    drive: `主线靠激烈的外部冲突（对抗、追逐、危机）推动；情绪曲线起伏剧烈；
角色在被迫的极端处境里做选择，从而暴露内心。
适合做强代入感的"爆款短剧"，每集都有钩子。`,
  },
  {
    slug: "mystery",
    label: "悬疑反转向",
    drive: `主线靠"真相未明"维持张力；通过线索逐步揭示，故意误导观众；
关键反转放在第二幕末或第三幕初；
每个出场角色都可能是"另一面"，慎用旁白直接交代。`,
  },
  {
    slug: "healing",
    label: "情感治愈向",
    drive: `主线靠"角色的情感与自我和解"推动；节奏舒缓、镜头细腻；
重视"小事件中的大情绪"——一杯茶、一个眼神、一段沉默；
冲突克制，不依赖外部强对抗；结局给观众留下温暖与释然。`,
  },
];

export function buildDirectionUser(opts: {
  variant: DirectionVariant;
  analyze: AnalyzeOutput;
  initialPrompt: string;
}): string {
  return `基于「意图分析」给出**一个**符合下方"驱动倾向"的创意方向方案。

# 你的驱动倾向
名称：${opts.variant.label}
要点：${opts.variant.drive}

# 意图分析（前置产物）
${JSON.stringify(opts.analyze, null, 2)}

# 原始故事点子
"""
${opts.initialPrompt}
"""

# 输出 schema（仅一个方向，不要数组）
{
  "slug":         "${opts.variant.slug}",                  // 必须等于 ${opts.variant.slug}，不要改
  "title":        "方向标题，≤30字（突出驱动倾向，不要起得太抽象）",
  "thesis":       "一句话主旨，≤80字（'谁在哪里因为什么被迫做某事'）",
  "summary":      "300-500字详细梗概，含起承转合关键节点，要让人一看就有画面感",
  "tone":         "本方向的具体调性，≤30字（应明显区别于另外两个方向）",
  "uniqueAngle":  "本方向的差异化卖点，≤80字（'同样的题材，我和另外两个方向最大的不同是…'）"
}

注意：
- 严格围绕意图分析给出的题材/受众/冲突展开，不要漂移
- 必须体现你的"驱动倾向"特点；不要写得像别的倾向
- summary 要具体到事件、人物动机、关键转折——不要泛泛而谈

请直接输出 JSON。`;
}
