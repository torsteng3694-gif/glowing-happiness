/**
 * 视觉风格预设。每个预设由一段英文 prompt 片段组成，会被自动拼接到所有
 * 图像/视频生成的 prompt 前面，确保跨镜头/跨角色的视觉风格统一。
 *
 * 命名约定：slug 用 snake_case；新增预设直接往这个数组里加。
 */

export type VisualStylePreset = {
  slug: string;
  label: string;          // 中文名（UI 显示）
  hint?: string;          // 简短描述
  promptPrefix: string;   // 注入到 image/video prompt 开头
};

export const VISUAL_STYLES: VisualStylePreset[] = [
  {
    slug: "hk_neon",
    label: "港式复古霓虹",
    hint: "1990s 香港 · 霓虹光影 · 王家卫色调",
    promptPrefix:
      "1990s Hong Kong cinematic style, neon-lit cyberpunk streets, Wong Kar-wai color grading, moody warm/teal contrast, film grain, anamorphic flare, ",
  },
  {
    slug: "guofeng",
    label: "国风水墨",
    hint: "宋元水墨 · 留白 · 工笔",
    promptPrefix:
      "Chinese guofeng ink-wash painting style, song-yuan dynasty aesthetic, gongbi linework, soft rice-paper texture, muted earth palette, ",
  },
  {
    slug: "anime90s",
    label: "90 年代日漫",
    hint: "胶片日漫 · 高饱和 · 手绘线",
    promptPrefix:
      "1990s Japanese anime cel-shading, hand-drawn lineart, vivid saturated palette, retro film grain, ",
  },
  {
    slug: "pixar3d",
    label: "皮克斯 3D",
    hint: "皮克斯渲染 · 圆润造型 · 暖光",
    promptPrefix:
      "Pixar-style 3D animation, rounded character design, soft global illumination, warm cinematic lighting, ",
  },
  {
    slug: "noir",
    label: "黑色电影",
    hint: "高对比黑白 · 硬光阴影",
    promptPrefix:
      "Film noir black-and-white cinematography, high-contrast hard shadows, venetian blind light, 1940s detective mood, ",
  },
  {
    slug: "ghibli",
    label: "吉卜力",
    hint: "宫崎骏 · 田园奇幻 · 柔光",
    promptPrefix:
      "Studio Ghibli animation style, hand-painted backgrounds, soft pastoral lighting, whimsical fantasy mood, ",
  },
  {
    slug: "cyberpunk",
    label: "赛博朋克",
    hint: "霓虹 · 未来都市 · 全息",
    promptPrefix:
      "Cyberpunk dystopia, neon-drenched megacity, holographic ads, rain-slick streets, dark futurism, ",
  },
  {
    slug: "realistic",
    label: "写实摄影",
    hint: "电影感 · 真实光影 · 35mm",
    promptPrefix:
      "Photorealistic cinematic photography, 35mm lens, natural lighting, shallow depth of field, ",
  },
];

export const STYLE_BY_SLUG: Record<string, VisualStylePreset> = Object.fromEntries(
  VISUAL_STYLES.map((s) => [s.slug, s]),
);

export function getStylePrefix(slug: string | null | undefined): string {
  if (!slug) return "";
  return STYLE_BY_SLUG[slug]?.promptPrefix || "";
}

/* ============ 多角度生成的常量 ============ */

/**
 * 角色立绘的标准角度池。subject_binding 默认为每个角色生成这 3 张。
 * 用户也可以在 AssetLibraryDialog 里点 "+ 新增一张" 选择其他角度补图。
 */
export const CHARACTER_ANGLES = [
  { id: "front", label: "正面", suffix: "frontal portrait, looking at camera" },
  { id: "side", label: "侧面", suffix: "profile view from the side" },
  { id: "fullbody", label: "全身", suffix: "full body shot, T-pose neutral" },
];

/**
 * 场景资产的标准角度（不同光线 / 视角）
 */
export const SCENE_ANGLES = [
  { id: "wide", label: "全景", suffix: "wide establishing shot, no people" },
  { id: "detail", label: "局部", suffix: "tight detail shot of the location" },
];

/**
 * 道具：单图即可，但允许"白底产品图 vs 使用场景图"
 */
export const PROP_ANGLES = [
  { id: "isolated", label: "白底", suffix: "centered isolated object on clean white background, product shot" },
];

/**
 * 技能：抽象视觉效果，单图
 */
export const SKILL_ANGLES = [
  { id: "effect", label: "效果", suffix: "abstract visual effect, motion energy, dramatic" },
];

export function anglesForType(type: "character" | "scene" | "prop" | "skill") {
  switch (type) {
    case "character":
      return CHARACTER_ANGLES;
    case "scene":
      return SCENE_ANGLES;
    case "prop":
      return PROP_ANGLES;
    case "skill":
      return SKILL_ANGLES;
    default:
      return CHARACTER_ANGLES;
  }
}
