/**
 * Step 6. storyboard — 分镜脚本 prompt
 *
 * 关键：
 *   - 把 script.scenes 转为可执行的镜头序列（每镜含景别、运动、时长、对白）
 *   - imagePrompt 要写成"能直接喂给图像模型生成关键帧"的英文 prompt
 *   - 引用 assets 的 visualAnchor 作为跨镜一致性的锚（angryAnchor 嵌入 imagePrompt）
 */

import { SYS_BASE, SYS_FOLLOWUP_HINT } from "./system";
import type { ScriptOutput, AssetsOutput } from "../schemas";

export const STORYBOARD_SYSTEM = SYS_BASE + SYS_FOLLOWUP_HINT;

export function buildStoryboardUser(opts: {
  script: ScriptOutput;
  assets: AssetsOutput;
  /** 项目级风格（融进每条 imagePrompt） */
  styleHint?: string | null;
  aspectRatio: string;
  /** 目标总秒数（影响 shot 数量与每镜时长） */
  targetTotalSec?: number;
}): string {
  // 整理 assets 的视觉锚 + id（让 LLM 引用）
  const assetsForLLM = opts.assets.assets.map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    visualAnchor: a.visualAnchor,
  }));

  return `把剧本转化为可执行的分镜脚本。

# 前置 · 剧本（场景 + 角色池）
${JSON.stringify(opts.script, null, 2)}

# 前置 · 资产视觉锚
（每个 asset 的 visualAnchor 是该角色/场景的"视觉DNA"，必须在引用它的 shot 的 imagePrompt 里完整复用一遍）
${JSON.stringify(assetsForLLM, null, 2)}

# 项目参数
风格：${opts.styleHint || "现实主义电影质感"}
比例：${opts.aspectRatio}
${opts.targetTotalSec ? `目标总时长：约 ${opts.targetTotalSec} 秒` : "目标总时长：约 60-90 秒（短剧节奏）"}

# 输出 schema
{
  "shots": [
    {
      "index":        1,                        // 从 1 开始连续
      "sceneIndex":   1,                        // 必须对应 script.scenes[].index
      "shotType":     "wide" | "medium" | "close" | "extreme_close" | "over_shoulder",
      "cameraMove":   "static" | "pan" | "zoom_in" | "zoom_out" | "dolly" | "tracking",
      "durationSec":  4,                        // 1-15 秒（普通对白镜 3-5，强情绪镜 5-8）
      "imagePrompt":  "完整英文 prompt，含构图、光线、人物动作、环境元素；
                       必须把出场角色的 visualAnchor 完整嵌入进来；
                       约 80-200 词",
      "motionHint":   "短句（≤30字），描述这一镜的运动主轴（如 '对手缓步逼近，主角后退半步'）",
      "dialogue":     "本镜内对白（≤80 字），可空字符串",
      "assetIds":     ["asset-id-1", "asset-id-2"]   // 引用上面的 assets[].id
    }
  ]
}

要求：
- 镜头数控制在 8-15（短剧节奏）
- shot.sceneIndex 必须对应 script.scenes[].index（不要无中生有）
- shot.assetIds 必须引用真实存在的 asset id（不能编造）
- 每条 imagePrompt 必须**完整嵌入**对应角色/场景的 visualAnchor（这是跨镜一致性的关键，不要只引用 name）
- shotType / cameraMove 严格使用枚举值
- 对白镜以 medium / close 为主；情绪转折用 extreme_close；环境交代用 wide
- durationSec 总和应接近 ${opts.targetTotalSec ?? 60} 秒

请直接输出 JSON。`;
}
