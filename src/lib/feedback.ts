/**
 * 反馈相关的常量与转换工具
 */

export const FEEDBACK_TYPES = [
  { value: "bug", label: "接口报错" },
  { value: "feature", label: "功能建议" },
  { value: "quality", label: "生成质量" },
  { value: "other", label: "其他" },
] as const;

export const FEEDBACK_STATUS = [
  { value: "pending", label: "未处理", color: "amber" },
  { value: "resolved", label: "已处理", color: "green" },
  { value: "ignored", label: "已忽略", color: "slate" },
] as const;

export function typeLabel(v: string) {
  return FEEDBACK_TYPES.find((t) => t.value === v)?.label || v;
}
export function statusLabel(v: string) {
  return FEEDBACK_STATUS.find((t) => t.value === v)?.label || v;
}
export function statusColor(v: string): "amber" | "green" | "slate" {
  return (FEEDBACK_STATUS.find((t) => t.value === v)?.color as any) || "slate";
}

/**
 * 北京时区（UTC+8）的 ISO8601，例：2026-03-25T02:22:50+08:00
 */
export function isoCn(d: Date) {
  const offset = 8 * 60;
  const local = new Date(d.getTime() + offset * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = local.getUTCFullYear();
  const mm = pad(local.getUTCMonth() + 1);
  const dd = pad(local.getUTCDate());
  const hh = pad(local.getUTCHours());
  const mi = pad(local.getUTCMinutes());
  const ss = pad(local.getUTCSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+08:00`;
}

/**
 * 公开 API 返回结构（与 ai6700.com 文档一致）
 */
export function toPublicShape(fb: {
  id: number;
  type: string;
  endpoint: string | null;
  question: string;
  status: string;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    feedback_id: fb.id,
    type: typeLabel(fb.type),
    endpoint: fb.endpoint,
    question: fb.question,
    status: statusLabel(fb.status),
    resolution: fb.resolution,
    created_at: isoCn(fb.createdAt),
    updated_at: isoCn(fb.updatedAt),
  };
}
