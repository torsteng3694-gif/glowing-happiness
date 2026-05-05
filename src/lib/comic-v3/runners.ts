/**
 * AI 漫剧 · S3.0 — Runners 注册表（barrel）
 *
 * 真实 runner 拆到 runners/ 目录下：
 *   - P2 已接真实 LLM：analyze / direction / outline / script
 *   - P3 已接真实图像/LLM：assets / storyboard
 *   - P4 待实现（仍是 _stubs.ts）：keyframes / motion / videos / compose
 *
 * engine.ts 仍按 RUNNERS_V3[stepKey] 取 runner，无需感知文件位置。
 */

export type { RunnerV3 } from "./runners/_shared";

import { STEP_KEYS_V3 } from "./steps";
import type { RunnerV3 } from "./runners/_shared";
import { runAnalyze } from "./runners/analyze";
import { runDirection } from "./runners/direction";
import { runOutline } from "./runners/outline";
import { runScript } from "./runners/script";
import { runAssetsPlan } from "./runners/assets-plan";
import { runAssetsRender } from "./runners/assets-render";
import { runStoryboard } from "./runners/storyboard";
import {
  runKeyframes,
  runMotion,
  runVideos,
  runCompose,
} from "./runners/_stubs";

export const RUNNERS_V3: Record<string, RunnerV3> = {
  [STEP_KEYS_V3.ANALYZE]: runAnalyze,
  [STEP_KEYS_V3.DIRECTION]: runDirection,
  [STEP_KEYS_V3.OUTLINE]: runOutline,
  [STEP_KEYS_V3.SCRIPT]: runScript,
  [STEP_KEYS_V3.ASSETS_PLAN]: runAssetsPlan,
  [STEP_KEYS_V3.ASSETS_RENDER]: runAssetsRender,
  [STEP_KEYS_V3.STORYBOARD]: runStoryboard,
  [STEP_KEYS_V3.KEYFRAMES]: runKeyframes,
  [STEP_KEYS_V3.MOTION]: runMotion,
  [STEP_KEYS_V3.VIDEOS]: runVideos,
  [STEP_KEYS_V3.COMPOSE]: runCompose,
};
