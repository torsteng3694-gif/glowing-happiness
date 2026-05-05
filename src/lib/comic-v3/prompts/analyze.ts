/**
 * Step 1. analyze — 意图分析 prompt
 *
 * 任务：把用户那一句模糊点子，结构化为题材/受众/冲突/主题/基调/创作方式。
 * 关键设计：低温度（stable 桶）+ 1 个 few-shot 示例 + 严格字段长度。
 */

import { SYS_BASE } from "./system";

export const ANALYZE_SYSTEM = SYS_BASE;

export function buildAnalyzeUser(initialPrompt: string): string {
  return `分析下面的故事点子，给出题材定位与推荐的创作方式。

# 输出 schema
{
  "genre":              "题材，简体中文，≤10字（如：都市悬疑 / 末世科幻 / 家庭伦理）",
  "audience":           "目标受众画像，≤25字（含年龄段+兴趣偏好）",
  "coreConflict":       "核心冲突，一句话，≤60字",
  "themes":             ["主题词1","主题词2","主题词3"],   // 1-5 个，每个 ≤15字
  "tone":               "整体基调，≤15字（如：克制悬疑 / 温暖治愈 / 黑色幽默）",
  "recommendedApproach":"推荐的创作方式，≤50字（含结构 + 节奏，例：双线叙事+三幕结构+第三集反转）"
}

# 示例
输入：一个程序员发现公司用 AI 复刻了已故同事的人格继续工作
输出：{"genre":"都市科幻","audience":"25-35岁男性观众，偏好悬疑科技题材","coreConflict":"主角发现身边的'同事'是 AI 复刻的死者人格，必须决定是否揭穿","themes":["数字永生","职场伦理","失去与告别"],"tone":"冷静克制带温度","recommendedApproach":"第一人称视角+三幕结构+第二幕末段反转"}

# 你要分析的故事点子
"""
${initialPrompt}
"""

请直接输出 JSON。`;
}
