/** 与 SSE 推送数据保持一致 */
export type StepStatus =
  | "pending"
  | "running"
  | "awaiting_user"
  | "succeeded"
  | "failed"
  | "skipped";

export type Candidate = {
  id: string;
  kind: string;
  data: unknown;
  mdSummary?: string;
  artifacts?: Array<{ url: string; type: "image" | "video" | "audio" }>;
};

export type StepRow = {
  stepKey: string;
  stepIndex: number;
  status: StepStatus;
  progress: number;
  cost: number;
  errorMessage?: string | null;
  candidates: Candidate[] | null;
  pickedCandidateId: string | null;
  userEdits: Record<string, unknown> | null;
  output: unknown;
  outputMd: string | null;
  artifacts: unknown;
  runCount: number;
};

export type AssetRow = {
  id: string;
  type: "character" | "scene" | "prop";
  name: string;
  description?: string | null;
  candidates: Array<{ url: string; prompt?: string }> | null;
  pickedUrl: string | null;
  visualAnchor: string | null;
  imagePrompt: string | null;
  negativePrompt: string | null;
  imageModelOverride: string | null;
  genStatus: string;
  genError: string | null;
};

export type ShotRow = {
  id: string;
  shotIndex: number;
  sceneIndex: number;
  shotType: "wide" | "medium" | "close" | "extreme_close" | "over_shoulder";
  cameraMove: "static" | "pan" | "zoom_in" | "zoom_out" | "dolly" | "tracking";
  durationSec: number;
  imagePrompt: string;
  motionHint: string;
  dialogue: string;
  assetIds: string[];
  keyframeUrl: string | null;
  negativePrompt: string | null;
  imageModelOverride: string | null;
  genStatus: "pending" | "generating" | "ready" | "failed" | string;
  genError: string | null;
};

export type ProjectSnapshot = {
  id: string;
  status: string;
  progress: number;
  currentStep: string | null;
  totalCost: number;
  isRunning: boolean;
  steps: StepRow[];
  assets: AssetRow[];
  shots: ShotRow[];
  finalVideoUrl: string | null;
  coverUrl: string | null;
};
