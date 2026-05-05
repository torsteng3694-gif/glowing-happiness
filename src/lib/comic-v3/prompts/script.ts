/**
 * Step 4. script — 剧本拆解 prompt
 *
 * 关键设计：
 *   - 输出含 scenes / charactersPool / scenesPool 三块
 *   - 每个场景必须有 location / timeOfDay / characters / action / dialogues
 *   - charactersPool 是后续 assets 步生成参考图的依据，描述要可视觉化
 */

import { SYS_BASE, SYS_FOLLOWUP_HINT } from "./system";
import type { AnalyzeOutput, DirectionData, OutlineOutput } from "../schemas";

export const SCRIPT_SYSTEM = SYS_BASE + SYS_FOLLOWUP_HINT;

export function buildScriptUser(opts: {
  analyze: AnalyzeOutput;
  direction: DirectionData;
  outline: OutlineOutput;
  initialPrompt: string;
}): string {
  return `基于已确定的方向与大纲，把故事拆解为可拍摄的场景剧本。

# 前置产物 · 意图分析
${JSON.stringify(opts.analyze, null, 2)}

# 前置产物 · 创意方向
${JSON.stringify(opts.direction, null, 2)}

# 前置产物 · 大纲
${JSON.stringify(opts.outline, null, 2)}

# 原始故事点子
"""
${opts.initialPrompt}
"""

# 输出 schema
{
  "scenes": [
    {
      "index":      1,                        // 从 1 开始连续
      "location":   "场景地点，≤30字（具体到可视觉化的地点）",
      "timeOfDay":  "白天 | 夜晚 | 黄昏 | 清晨 | 室内 | ...",
      "characters": ["出场角色名1", "出场角色名2"],   // 角色名要在 charactersPool 里
      "action":     "动作叙述，200-500 字（含动作、镜头氛围、情绪）",
      "dialogues":  [                          // 0-N 句对白；可空数组
        { "speaker": "角色名", "text": "对白内容（不超过 80 字）" }
      ]
    }
  ],
  "charactersPool": [
    {
      "name":        "角色名（≤12字）",
      "description": "可视觉化的外观+性格描述（年龄、身材、发型、穿衣风格、眼神、口头禅等），200字内",
      "importance":  "main | supporting | minor"
    }
  ],
  "scenesPool": [
    {
      "name":        "场景名（与 scenes[].location 一致）",
      "description": "可视觉化的环境描述（光线、色温、布景元素），200字内"
    }
  ]
}

要求：
- scenes 总数控制在 8-15 之间（短剧节奏）
- 每个 scene 必须服务于至少 1 个大纲章节，不要无关的过场
- charactersPool 必须覆盖所有 scenes[].characters 出现过的角色名（不能多也不能少）
- charactersPool 描述必须**可被图像模型理解**——避免"很有气质"这种主观词，多用"30 岁男性，深色西装，眉骨突出，眼神锐利"这种具体描述
- scenesPool 同理，描述要让图像模型能渲染出来
- importance：main 1-2 个，supporting 0-3 个，其余 minor

请直接输出 JSON。`;
}
