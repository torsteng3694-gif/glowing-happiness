"use client";

import { Card } from "@/components/ui";
import { Check, AlertTriangle, Loader2, ChevronRight, MinusCircle } from "lucide-react";
import { STEPS_V3 } from "@/lib/comic-v3/steps";
import type { StepRow, StepStatus } from "./types";

const GROUP_TITLES: Record<number, string> = {
  1: "剧本创作",
  2: "资产 & 分镜",
  3: "成片合成",
};

export default function StepTimeline({
  steps,
  activeKey,
  onPick,
}: {
  steps: StepRow[];
  activeKey: string | null;
  onPick: (key: string) => void;
}) {
  const stepMap = new Map(steps.map((s) => [s.stepKey, s]));

  // 按 group 分桶展示
  const groups: Record<number, typeof STEPS_V3> = { 1: [], 2: [], 3: [] };
  for (const s of STEPS_V3) groups[s.group].push(s);

  return (
    <Card className="p-3 space-y-1">
      {[1, 2, 3].map((g) => (
        <div key={g} className="space-y-0.5">
          <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-slate-400 uppercase tracking-wide">
            {GROUP_TITLES[g]}
          </div>
          {groups[g as 1 | 2 | 3].map((def) => {
            const row = stepMap.get(def.key);
            const status: StepStatus = row?.status ?? "pending";
            const active = activeKey === def.key;
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => onPick(def.key)}
                className={
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition " +
                  (active
                    ? "bg-violet-50 text-violet-900 ring-1 ring-violet-300"
                    : "hover:bg-slate-50 text-slate-700")
                }
              >
                <StatusDot status={status} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{def.title}</div>
                  <div className="text-[11px] text-slate-500 truncate">{def.subtitle}</div>
                </div>
                {active && <ChevronRight className="w-4 h-4 text-violet-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      ))}
    </Card>
  );
}

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "succeeded") {
    return (
      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center justify-center shrink-0">
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 inline-flex items-center justify-center shrink-0">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </span>
    );
  }
  if (status === "awaiting_user") {
    return (
      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 inline-flex items-center justify-center shrink-0">
        <AlertTriangle className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 inline-flex items-center justify-center shrink-0">
        <MinusCircle className="w-3.5 h-3.5" />
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 inline-flex items-center justify-center shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
    </span>
  );
}
