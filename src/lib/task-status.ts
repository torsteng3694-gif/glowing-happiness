/**
 * 异步任务状态映射表 / 工具
 *
 * 来自平台规范：4 大状态组，共 37 个可能的 raw status 值。
 * 约定：业务判断是否「终态」请用 `isFinal()`，不要依赖具体字面值。
 */

export type StatusGroup = "waiting" | "processing" | "completed" | "failed";

type StatusEntry = {
  status: string;      // raw 字面值（原样返回给调用方，大小写与源一致）
  label: string;       // 中文名
  group: StatusGroup;  // 4 大组
  desc: string;        // 说明
};

/* ---------- 等待中 13 种 ---------- */
const WAITING: StatusEntry[] = [
  { status: "pending",                       label: "等待中",            group: "waiting", desc: "任务已创建，等待处理" },
  { status: "queued",                        label: "排队中",            group: "waiting", desc: "任务已进入队列，等待执行" },
  { status: "submitted",                     label: "已提交",            group: "waiting", desc: "任务已提交到渠道" },
  { status: "not_start",                     label: "未开始",            group: "waiting", desc: "任务未开始" },
  { status: "waiting",                       label: "等待中",            group: "waiting", desc: "任务等待中" },
  { status: "creating",                      label: "任务创建中",        group: "waiting", desc: "写入任务记录时的初始状态" },
  { status: "prompt_enhancing",              label: "提示词优化中",      group: "waiting", desc: "调整提示词结构/语气/细节以提升模型输出质量" },
  { status: "prompt_enhancement_checking",   label: "提示词优化验证中",  group: "waiting", desc: "对优化后的提示词做合规性/有效性/格式校验" },
  { status: "video_downloading",             label: "视频下载中",        group: "waiting", desc: "视频下载中" },
  { status: "queueing",                      label: "任务排队中",        group: "waiting", desc: "任务排队中" },
  { status: "created",                       label: "创建成功",          group: "waiting", desc: "创建成功" },
  { status: "run",                           label: "运行中",            group: "waiting", desc: "任务运行中" },
  { status: "audio_downloading",             label: "音频下载中",        group: "waiting", desc: "音频下载中" },
];

/* ---------- 进行中 8 种 ---------- */
const PROCESSING: StatusEntry[] = [
  { status: "processing",           label: "处理中",       group: "processing", desc: "任务正在处理" },
  { status: "image_downloading",    label: "图片下载中",   group: "processing", desc: "正在下载输入图片" },
  { status: "video_generating",     label: "视频生成中",   group: "processing", desc: "正在生成视频" },
  { status: "video_upsampling",     label: "视频升采样中", group: "processing", desc: "正在进行视频升采样" },
  { status: "in_progress",          label: "进行中",       group: "processing", desc: "任务进行中" },
  { status: "running",              label: "运行中",       group: "processing", desc: "任务运行中" },
  { status: "downloading",          label: "下载中",       group: "processing", desc: "下载中" },
  { status: "runnning",             label: "运行中",       group: "processing", desc: "运行中（保留的历史拼写）" },
];

/* ---------- 已完成 8 种（终态） ---------- */
const COMPLETED: StatusEntry[] = [
  { status: "completed",                    label: "已完成",         group: "completed", desc: "任务成功完成" },
  { status: "video_generation_completed",   label: "视频生成完成",   group: "completed", desc: "视频生成完成" },
  { status: "video_upsampling_completed",   label: "视频升采样完成", group: "completed", desc: "视频升采样完成" },
  { status: "success",                      label: "成功",           group: "completed", desc: "任务成功" },
  { status: "succeed",                      label: "任务成功",       group: "completed", desc: "任务成功" },
  { status: "succeeded",                    label: "成功",           group: "completed", desc: "任务成功" },
  { status: "finish",                       label: "完成",           group: "completed", desc: "任务完成" },
  { status: "done",                         label: "已完成",         group: "completed", desc: "任务已完成" },
];

/* ---------- 失败 8 种（终态） ---------- */
const FAILED: StatusEntry[] = [
  { status: "failed",                     label: "失败",                  group: "failed", desc: "任务执行失败" },
  { status: "error",                      label: "错误",                  group: "failed", desc: "系统错误或异常" },
  { status: "video_generation_failed",    label: "视频生成失败",          group: "failed", desc: "视频生成失败" },
  { status: "video_upsampling_failed",    label: "视频升采样失败",        group: "failed", desc: "视频升采样失败" },
  { status: "failure",                    label: "失败",                  group: "failed", desc: "任务失败" },
  { status: "cancelled",                  label: "已取消",                group: "failed", desc: "任务已取消" },
  { status: "CANCELED",                   label: "任务已取消",            group: "failed", desc: "任务已取消（大写）" },
  { status: "UNKNOWN",                    label: "任务不存在或状态未知",  group: "failed", desc: "任务不存在或状态未知" },
];

export const STATUS_TABLE: StatusEntry[] = [...WAITING, ...PROCESSING, ...COMPLETED, ...FAILED];
const MAP: Record<string, StatusEntry> = Object.fromEntries(STATUS_TABLE.map((s) => [s.status, s]));

const FINAL_GROUPS: StatusGroup[] = ["completed", "failed"];

export function lookup(status: string | null | undefined): StatusEntry {
  if (!status) return MAP["UNKNOWN"];
  return MAP[status] || MAP["UNKNOWN"];
}

export function groupOf(status: string): StatusGroup {
  return lookup(status).group;
}

export function labelOf(status: string): string {
  return lookup(status).label;
}

export function isFinal(status: string): boolean {
  return FINAL_GROUPS.includes(groupOf(status));
}

export function isFailure(status: string): boolean {
  return groupOf(status) === "failed";
}

export function isSuccess(status: string): boolean {
  return groupOf(status) === "completed";
}

/** 4 档粗粒度 state（与最新 API 文档保持一致） */
export type State = "pending" | "running" | "success" | "failed";
export function stateOf(status: string): State {
  const g = groupOf(status);
  if (g === "waiting") return "pending";
  if (g === "processing") return "running";
  if (g === "completed") return "success";
  return "failed";
}

export const GROUP_LABEL: Record<StatusGroup, string> = {
  waiting: "等待中",
  processing: "进行中",
  completed: "已完成",
  failed: "失败",
};

export const GROUP_COLOR: Record<StatusGroup, "slate" | "brand" | "green" | "rose"> = {
  waiting: "slate",
  processing: "brand",
  completed: "green",
  failed: "rose",
};

/** 组装公开 API 的响应体（status / is_final / 分组 / 进度 / 结果） */
export function toStatusShape(task: {
  id: number;
  type: string;
  status: string;
  progress: number;
  resultUrls: string | null;
  errorMessage: string | null;
  refunded: boolean;
  cost: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}) {
  const entry = lookup(task.status);
  const urls: string[] = task.resultUrls ? JSON.parse(task.resultUrls) : [];
  return {
    task_id: task.id,
    type: task.type,
    state: stateOf(task.status),                 // pending | running | success | failed
    status: task.status,                         // raw 英文值（也可做展示用）
    status_label: entry.label,                   // 中文状态名（展示用）
    status_group: GROUP_LABEL[entry.group],      // 等待中/进行中/已完成/失败（展示用）
    fenzu: GROUP_LABEL[entry.group],             // 旧别名，保留向后兼容
    group: entry.group,
    is_final: isFinal(task.status),
    progress: task.progress,
    result_url: urls[0] || "",                   // 单 URL 快捷字段（便于前端直接显示）
    result_type: task.type === "music" ? "audio" : task.type,
    result: urls.length > 0 ? { urls } : null,
    error: task.errorMessage || "",
    cost: task.cost,
    refunded: task.refunded,
    created_at: isoCn(task.createdAt),
    updated_at: isoCn(task.updatedAt),
    started_at: task.startedAt ? isoCn(task.startedAt) : null,
    finished_at: task.finishedAt ? isoCn(task.finishedAt) : null,
  };
}

export function isoCn(d: Date) {
  const offset = 8 * 60;
  const local = new Date(d.getTime() + offset * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}+08:00`;
}
