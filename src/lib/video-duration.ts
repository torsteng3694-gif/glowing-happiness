/**
 * 视频模型 duration 兼容表
 * ----------------------------------
 * 不同视频模型对 duration 接受的合法集差异极大：
 *   - VEO3 系列固定 8 秒
 *   - Vidu Q3 / Q3 参考生只接受 {4, 8}
 *   - Kling 系列 5 / 10
 *   - 即梦 3.5 Pro（doubao-seedance）4-15 任意整数
 *   - SD 2.0 参考生（kwvideo-v2-ref）4-15 任意整数
 *   - Sora-2 / sora-2-2 仅接受 {4, 8, 12}
 *   - grok-video-3 系列 6 / 10 / 15 / 20 / 25
 *   - 其它通用兜底用 4-30 任意
 *
 * 这里集中维护，前端表单和后端 buildVideoRawParams 共用，避免再出现
 * "参数 duration 的值 X 不合法" 这类参数失配。
 *
 * 字段含义：
 *   - kind = "enum"   ：duration 必须 ∈ values
 *   - kind = "range"  ：duration 必须落在 [min, max] 整数闭区间，preferred 用作下拉默认建议值
 *   - kind = "fixed"  ：duration 只允许某一个固定值（VEO3）
 *
 * snapDuration() 给一个用户期望值，返回该模型实际会用的合法值。
 */

export type DurationCompat =
  | { kind: "fixed"; value: number; label?: string }
  | { kind: "enum"; values: number[]; label?: string }
  | { kind: "range"; min: number; max: number; preferred?: number[]; label?: string };

const VEO3_RE = /^veo[-]?3(\.\d+)?(-(lite|fast|pro|quality|4k|frames|components))?$/;

export function getDurationCompat(slugRaw: string): DurationCompat {
  const slug = (slugRaw || "").toLowerCase();

  if (VEO3_RE.test(slug)) {
    return { kind: "fixed", value: 8, label: "VEO3 系列固定 8 秒" };
  }

  // Vidu Q3 / Q3 参考生：枚举 {4, 8, 12, 16}
  if (/^viduq3(\b|-)/.test(slug)) {
    return { kind: "enum", values: [4, 8, 12, 16], label: "Vidu Q3 支持 4 / 8 / 12 / 16 秒" };
  }

  // 其它 Vidu 系列：枚举 {4, 8, 12, 16}
  if (/^vidu/.test(slug)) {
    return { kind: "enum", values: [4, 8, 12, 16], label: "Vidu 支持 4 / 8 / 12 / 16 秒" };
  }

  if (/^kling/.test(slug)) {
    return { kind: "enum", values: [5, 10], label: "Kling 系列仅支持 5 / 10 秒" };
  }

  if (slug === "doubao-seedance-1-5-pro-251215") {
    return {
      kind: "range",
      min: 4,
      max: 15,
      preferred: [4, 5, 6, 8, 10, 12, 15],
      label: "即梦 3.5 Pro 支持 4-15 秒",
    };
  }

  if (slug === "kwvideo-v2-ref") {
    return {
      kind: "range",
      min: 4,
      max: 15,
      preferred: [4, 5, 6, 8, 10, 12, 15],
      label: "SD 2.0 参考生支持 4-15 秒",
    };
  }

  if (slug === "sora-2" || slug === "sora-2-2") {
    return { kind: "enum", values: [4, 8, 12], label: "Sora-2 仅支持 4 / 8 / 12 秒" };
  }

  if (slug === "grok-video-3") {
    return { kind: "enum", values: [6, 10], label: "grok-video-3 支持 6 / 10 秒" };
  }
  if (slug === "grok-video-3-plus") {
    return { kind: "enum", values: [10, 15, 20, 25], label: "grok-video-3-plus 支持 10/15/20/25 秒" };
  }

  // 通用兜底：1-30 秒
  return { kind: "range", min: 1, max: 30, preferred: [4, 5, 6, 8, 10, 12, 15, 20, 30] };
}

/** 返回该模型给前端下拉用的一组「推荐时长」选项（不一定穷举所有合法值） */
export function getDurationOptions(slug: string): number[] {
  const c = getDurationCompat(slug);
  if (c.kind === "fixed") return [c.value];
  if (c.kind === "enum") return [...c.values];
  if (c.preferred && c.preferred.length > 0) return c.preferred;
  // range 没给 preferred，用 min,max,中位数
  const mid = Math.round((c.min + c.max) / 2);
  return Array.from(new Set([c.min, mid, c.max])).sort((a, b) => a - b);
}

/** 用户想要 want 秒，返回该模型实际会用的合法值。always 返回正整数。 */
export function snapDuration(slug: string, want: number | undefined | null): number {
  const c = getDurationCompat(slug);
  const w = Number.isFinite(Number(want)) && Number(want) > 0 ? Math.round(Number(want)) : NaN;

  if (c.kind === "fixed") return c.value;

  if (c.kind === "enum") {
    if (!Number.isFinite(w)) return c.values[0];
    let best = c.values[0];
    let bestDiff = Math.abs(w - best);
    for (const v of c.values.slice(1)) {
      const d = Math.abs(w - v);
      if (d < bestDiff) {
        best = v;
        bestDiff = d;
      }
    }
    return best;
  }

  // range
  if (!Number.isFinite(w)) return c.preferred?.[0] ?? c.min;
  return Math.max(c.min, Math.min(c.max, w));
}
