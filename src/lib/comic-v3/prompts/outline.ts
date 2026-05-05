/**
 * Step 3. outline — 故事大纲 prompt
 */

import { SYS_BASE, SYS_FOLLOWUP_HINT } from "./system";
import type { AnalyzeOutput, DirectionData } from "../schemas";

export const OUTLINE_SYSTEM = SYS_BASE + SYS_FOLLOWUP_HINT;

export function buildOutlineUser(opts: {
  analyze: AnalyzeOutput;
  direction: DirectionData;
  initialPrompt: string;
  /** 用户偏好集数；不传则按 LLM 自己判断（4-8 集） */
  desiredChapters?: number;
}): string {
  return `基于已确定的「创意方向」生成故事大纲。

# 前置产物 · 意图分析
${JSON.stringify(opts.analyze, null, 2)}

# 前置产物 · 创意方向（已落定）
${JSON.stringify(opts.direction, null, 2)}

# 原始故事点子
"""
${opts.initialPrompt}
"""

# 输出 schema
{
  "totalChapters": ${opts.desiredChapters ?? 4},   // 章节数（短剧建议 4-8）
  "chapters": [
    {
      "index":    1,                              // 从 1 开始
      "title":    "章节标题，≤30字",
      "summary":  "本章梗概，100-200 字，包含关键事件和情绪节奏",
      "emotion":  "rising"                        // 情绪标签，必须从枚举里选
    }
    // ... 共 totalChapters 个，索引连续
  ]
}

# emotion 枚举
- rising      上升（情绪在累积，悬念在发酵）
- tense       紧张（冲突已出现，张力高）
- climax      高潮（最关键转折/对抗）
- calm        平稳（节奏放缓，铺陈或喘息）
- resolution  收束（情绪释放，故事落定）

要求：
- 章节数严格等于 totalChapters
- 整体情绪曲线要符合短剧节奏：起 → 升 → 紧 → 高潮 → 收（不要全是 climax，也不要全是 calm）
- 每章 summary 必须出现至少 1 个具体事件或冲突，不要"主角思考人生"这种空话
- 不要漂移到方向以外的题材

请直接输出 JSON。`;
}
