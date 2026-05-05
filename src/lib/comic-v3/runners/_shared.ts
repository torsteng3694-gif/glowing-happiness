/**
 * runners 共享工具：候选构造 / id 生成 / 类型别名
 */

import type { Candidate, RunnerResultV3 } from "../schemas";
import type { StepRunContextV3 } from "../engine";

export type RunnerV3 = (ctx: StepRunContextV3) => Promise<RunnerResultV3>;

export function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
}

/** 包一个 candidate */
export function buildCandidate<T>(opts: {
  id?: string;
  kind: string;
  data: T;
  mdSummary?: string;
  artifacts?: Candidate["artifacts"];
}): Candidate<T> {
  return {
    id: opts.id ?? newId(),
    kind: opts.kind,
    data: opts.data,
    mdSummary: opts.mdSummary,
    artifacts: opts.artifacts,
  };
}

export const STUB_TAG = "[STUB · 待 P3/P4 替换为真实实现]";
