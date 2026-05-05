"use client";

import { Card } from "@/components/ui";
import { Activity, CircleDollarSign, Film } from "lucide-react";
import type { ProjectSnapshot } from "./types";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "草稿", cls: "bg-slate-100 text-slate-600" },
  running: { text: "运行中", cls: "bg-violet-100 text-violet-700" },
  awaiting_user: { text: "等待你的决定", cls: "bg-amber-100 text-amber-700" },
  paused: { text: "已暂停", cls: "bg-slate-100 text-slate-600" },
  failed: { text: "失败", cls: "bg-rose-100 text-rose-700" },
  completed: { text: "已完成", cls: "bg-emerald-100 text-emerald-700" },
};

export default function ProjectHeader({
  title,
  snapshot,
}: {
  title: string;
  snapshot: ProjectSnapshot | null;
}) {
  const status = snapshot?.status || "draft";
  const label = STATUS_LABEL[status] || STATUS_LABEL.draft;
  const progress = snapshot?.progress ?? 0;
  const totalCost = snapshot?.totalCost ?? 0;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0">
          <Film className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${label.cls}`}>
              {label.text}
            </span>
            {snapshot?.isRunning && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 inline-flex items-center gap-1">
                <Activity className="w-3 h-3 animate-pulse" /> 后台运行
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            进度 {progress}% · 累计 ¥{totalCost.toFixed(2)}
          </div>
        </div>
        {snapshot?.finalVideoUrl && (
          <a
            href={snapshot.finalVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-violet-600 hover:text-violet-800 font-medium"
          >
            查看成片 →
          </a>
        )}
      </div>
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </Card>
  );
}
