/**
 * 基于 Setting 表的模型参数覆盖存储
 * --------------------------------------
 * 设计动机：
 *   让管理员在后台「模型管理」里逐个为每个模型自定义 params（name/label/type/required/default/options/description），
 *   而又不需要为了加一个 paramsJson 字段去做 Prisma migration（在 dev server 多开时会 EPERM）。
 *
 * 存储：
 *   Setting {
 *     key   = "model_params:{slug}"
 *     value = JSON.stringify(ParamDef[])
 *   }
 *
 * 读取：
 *   - 有记录 → 使用自定义 params（允许为空数组，表示"这个模型没有额外参数"）
 *   - 无记录 → 保留 model-shape.ts 里的类型模板兜底
 */
import { prisma } from "./db";
import type { ParamDef } from "./model-shape";

const PREFIX = "model_params:";
export const MODEL_PARAMS_PREFIX = PREFIX;

export function paramsKey(slug: string): string {
  return PREFIX + slug;
}

/** 读单个模型的自定义参数。null = 未配置（走默认模板） */
export async function getParamsOverride(slug: string): Promise<ParamDef[] | null> {
  const r = await prisma.setting.findUnique({ where: { key: paramsKey(slug) } });
  if (!r) return null;
  try {
    const arr = JSON.parse(r.value);
    if (Array.isArray(arr)) return arr as ParamDef[];
    return null;
  } catch {
    return null;
  }
}

/** 批量读多个 slug 的自定义参数（用于列表接口） */
export async function getParamsOverridesMany(slugs: string[]): Promise<Map<string, ParamDef[]>> {
  if (slugs.length === 0) return new Map();
  const keys = slugs.map(paramsKey);
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const out = new Map<string, ParamDef[]>();
  for (const r of rows) {
    if (!r.key.startsWith(PREFIX)) continue;
    const slug = r.key.slice(PREFIX.length);
    try {
      const arr = JSON.parse(r.value);
      if (Array.isArray(arr)) out.set(slug, arr as ParamDef[]);
    } catch { /* ignore broken entries */ }
  }
  return out;
}

/** 写/覆盖 某模型的自定义参数。传 null/空数组 都可；传 undefined 含义不清故不允许 */
export async function setParamsOverride(slug: string, params: ParamDef[] | null): Promise<void> {
  const key = paramsKey(slug);
  if (params === null) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  const value = JSON.stringify(params);
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/** 清空某 slug 的覆盖（回到默认模板） */
export async function clearParamsOverride(slug: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: paramsKey(slug) } });
}

/** 删除所有模型相关的参数覆盖（配合"清空所有模型"使用） */
export async function clearAllParamsOverrides(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: { startsWith: PREFIX } } });
}
