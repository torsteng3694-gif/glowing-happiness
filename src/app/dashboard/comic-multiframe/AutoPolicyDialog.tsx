"use client";

import type { AutoPolicyState } from "./types";
import { STEP_LABEL, STEP_SUBTITLE } from "./types";

const STEP_GROUPS = [
  {
    label: "剧本创作阶段",
    dot: "bg-cyan-400",
    keys: [
      "intent_analysis",
      "direction_pick",
      "direction_refine",
      "direction_extract",
      "outline",
      "novel_adapt",
      "script_breakdown",
    ],
  },
  {
    label: "资产与分镜阶段",
    dot: "bg-fuchsia-400",
    keys: ["subject_binding", "storyboard_script"],
  },
  {
    label: "视频制作阶段",
    dot: "bg-amber-400",
    keys: ["asset_match", "keyframes", "motion_prompt", "video_gen"],
  },
];

export default function AutoPolicyDialog({
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: AutoPolicyState;
  onChange: (v: AutoPolicyState) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const totalSelected = Object.values(value.steps).filter(Boolean).length;

  function setStep(k: string, v: boolean) {
    onChange({ ...value, steps: { ...value.steps, [k]: v } });
  }
  function setAllInGroup(keys: string[], v: boolean) {
    const next = { ...value.steps };
    for (const k of keys) next[k] = v;
    onChange({ ...value, steps: next });
  }
  function setRetry(field: keyof AutoPolicyState["retry"], delta: number) {
    const next = Math.max(1, Math.min(field === "video" ? 30 : 20, value.retry[field] + delta));
    onChange({ ...value, retry: { ...value.retry, [field]: next } });
  }
  function setTarget(delta: number) {
    onChange({
      ...value,
      videoTargetPerShot: Math.max(1, Math.min(5, value.videoTargetPerShot + delta)),
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 shadow-2xl">
        <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-xs flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          托管期间请勿切换页面或刷新浏览器，否则托管将自动停止。如需处理其他事务，请新开一个浏览器标签页操作。
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
          {STEP_GROUPS.map((g) => {
            const allOn = g.keys.every((k) => value.steps[k]);
            return (
              <div key={g.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${g.dot}`} />
                    <span className="text-sm font-medium text-slate-200">{g.label}</span>
                  </div>
                  <button
                    onClick={() => setAllInGroup(g.keys, !allOn)}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    {allOn ? "取消全选" : "全选"}
                  </button>
                </div>
                {g.keys.map((k) => {
                  const checked = !!value.steps[k];
                  return (
                    <label
                      key={k}
                      className={[
                        "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition",
                        checked
                          ? "border-cyan-500/40 bg-cyan-500/5"
                          : "border-slate-700 bg-slate-800/40 hover:border-slate-600",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition",
                          checked
                            ? "bg-cyan-500 border-cyan-400 text-white"
                            : "border-slate-500",
                        ].join(" ")}
                      >
                        {checked && (
                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current">
                            <path d="M6 11.2L2.8 8l-1 1L6 13.2 14.2 5l-1-1z" />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={(e) => setStep(k, e.target.checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{STEP_LABEL[k]}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{STEP_SUBTITLE[k]}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-6">
          <div className="text-xs text-slate-400 mb-2">↻ 失败自动重试上限</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Counter
              icon="💬"
              title="Chat 模型"
              hint="节点/提示词等，每项最多重试"
              value={value.retry.chat}
              suffix="次"
              onMinus={() => setRetry("chat", -1)}
              onPlus={() => setRetry("chat", 1)}
            />
            <Counter
              icon="🖼️"
              title="图片生成"
              hint="分镜图等，每张最多重试"
              value={value.retry.image}
              suffix="次/张"
              onMinus={() => setRetry("image", -1)}
              onPlus={() => setRetry("image", 1)}
            />
            <Counter
              icon="🎬"
              title="视频生成"
              hint="每个镜头最多重试"
              value={value.retry.video}
              suffix="次/镜"
              onMinus={() => setRetry("video", -1)}
              onPlus={() => setRetry("video", 1)}
            />
            <Counter
              icon="✅"
              title="每镜头目标数"
              hint="每个镜头生成几个成功视频"
              value={value.videoTargetPerShot}
              suffix="个/镜"
              onMinus={() => setTarget(-1)}
              onPlus={() => setTarget(1)}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            已选 <span className="text-cyan-400 font-semibold">{totalSelected}</span> 个步骤
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium shadow inline-flex items-center gap-1.5"
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current">
                <path d="M3 2l11 6L3 14z" />
              </svg>
              开始托管
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Counter({
  icon,
  title,
  hint,
  value,
  suffix,
  onMinus,
  onPlus,
}: {
  icon: string;
  title: string;
  hint: string;
  value: number;
  suffix: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-700/80 flex items-center justify-center text-base">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-slate-400 truncate">{hint}</div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onMinus}
          className="w-6 h-6 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
        >
          −
        </button>
        <span className="w-7 text-center text-sm font-mono">{value}</span>
        <button
          onClick={onPlus}
          className="w-6 h-6 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
        >
          +
        </button>
      </div>
      <span className="text-[11px] text-slate-400 ml-1">{suffix}</span>
    </div>
  );
}
