/**
 * AI 漫剧 · S3.0 — 图像模型套餐
 *
 * 设计：
 *   - 把"具体哪个 imageSlug"包装成几个用户友好的"套餐"
 *   - 用户在创建项目时只看见套餐选项，不暴露 slug 细节
 *   - 套餐 → imageSlug 的映射在这里维护，需要换上游模型时改这一处即可
 *
 * 当前 slug 与项目里实际 enabled 的图像模型对齐（见 prisma seed / admin/models）。
 * 如果某个 slug 在你部署的环境里不存在，创建项目时 ensurePipelineUsable 会拦下来。
 *
 * 不传套餐 / "default" → 走 admin 配置的全局 imageSlug（最稳）。
 */

export type ImagePresetSlug =
  | "default"
  | "balanced"
  | "quality"
  | "midjourney"
  | "experimental";

export type ImagePresetDef = {
  slug: ImagePresetSlug;
  label: string;
  description: string;
  /** 主推 image model slug；为 null 表示走全局默认 */
  imageSlug: string | null;
  /** UI 上的强调色（tailwind class） */
  accentClass: string;
  /** 推荐场景描述 */
  bestFor: string;
};

export const IMAGE_PRESETS: ImagePresetDef[] = [
  {
    slug: "default",
    label: "跟随系统",
    description: "使用管理员配置的默认图像模型",
    imageSlug: null,
    accentClass: "bg-slate-100 text-slate-700 border-slate-200",
    bestFor: "省心 · 不知道选哪个就用这个",
  },
  {
    slug: "balanced",
    label: "性价比",
    description: "Nano Banana 2，Google 官方，速度快价格友好",
    imageSlug: "gemini-3.1-flash-image-preview",
    accentClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bestFor: "草稿 / 快速预览 / 长剧集",
  },
  {
    slug: "quality",
    label: "最佳质量",
    description: "Nano Banana Pro，画面精致细节丰富",
    imageSlug: "gemini-3-pro-image-preview",
    accentClass: "bg-violet-50 text-violet-700 border-violet-200",
    bestFor: "error",
  },
  {
    slug: "midjourney",
    label: "Midjourney",
    description: "MJ 经典艺术风，强构图氛围感",
    imageSlug: "mj_imagine",
    accentClass: "bg-rose-50 text-rose-700 border-rose-200",
    bestFor: "氛围向 / 概念图 / 风格化",
  },
  {
    slug: "experimental",
    label: "实验性",
    description: "GPT Image 2.0，最新模型偶有不稳定",
    imageSlug: "gpt-image-2-all",
    accentClass: "bg-amber-50 text-amber-700 border-amber-200",
    bestFor: "尝鲜 / 风格化探索",
  },
];

export const IMAGE_PRESET_BY_SLUG: Record<string, ImagePresetDef> = Object.fromEntries(
  IMAGE_PRESETS.map((p) => [p.slug, p]),
);

/**
 * 把套餐 slug 翻译为 imageSlug。
 * 返回 null 表示"用全局默认"。
 */
export function resolveImageSlugFromPreset(presetSlug?: string | null): string | null {
  if (!presetSlug) return null;
  const def = IMAGE_PRESET_BY_SLUG[presetSlug];
  return def?.imageSlug ?? null;
}
