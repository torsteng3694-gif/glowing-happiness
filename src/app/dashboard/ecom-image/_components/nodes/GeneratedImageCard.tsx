"use client";

/**
 * 节点 07 · 单张候选图卡
 *
 *   5 种状态：
 *     virtual  虚拟占位（前端伪造，DB 还没行）→ 显示骨架 + "生成这张" 按钮
 *     queued   已写库待跑       → 灰色 + 旋转点
 *     running  正在生成         → 渐变骨架动画 + 进度
 *     done     生成完成         → 真图 + hover 操作
 *     failed   失败              → 红 + 重试
 *
 *   操作：✓ 挑中 / ↻ 重生（带反馈）/ 🗑 删除 / 📥 下载 / 🪄 生成这张
 */

import { Check, Download, Loader2, Play, RotateCw, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RegenerateDialog } from "..";
import type { GeneratedImageActions, GeneratedImageView } from "./types";

/** 虚拟占位：前端伪造，没有 DB 行 */
export interface VirtualGenerated {
  status: "virtual";
  candidateIdx: number;
  /** 父级 plan id */
  _planId: string;
  /** 用于 list key */
  _key: string;
}

export interface GeneratedImageCardProps {
  generated: GeneratedImageView | VirtualGenerated;
  planId: string;
  actions: GeneratedImageActions;
  disabled?: boolean;
}

function isVirtual(g: GeneratedImageCardProps["generated"]): g is VirtualGenerated {
  return g.status === "virtual";
}

export default function GeneratedImageCard({
  generated,
  planId,
  actions,
  disabled,
}: GeneratedImageCardProps) {
  const virtual = isVirtual(generated);
  const isDone = !virtual && generated.status === "done";
  const isRunning = !virtual && generated.status === "running";
  const isFailed = !virtual && generated.status === "failed";
  const isQueued = !virtual && generated.status === "queued";
  const picked = !virtual && generated.picked;

  return (
    <div
      className={cn(
        "shrink-0 w-32 rounded-lg border bg-white overflow-hidden relative group transition-all",
        picked ? "border-brand-400 ring-2 ring-brand-200/50" : "border-slate-200",
        virtual && "border-dashed",
      )}
    >
      {/* 图片区 */}
      <div className="aspect-square bg-slate-50 relative overflow-hidden">
        {/* === DONE：真图 === */}
        {isDone && !virtual && generated.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={generated.url}
            alt={`候选 ${generated.candidateIdx}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.2";
            }}
          />
        )}

        {/* === RUNNING：渐变骨架动画 + 进度 === */}
        {isRunning && !virtual && (
          <div className="absolute inset-0 bg-gradient-to-r from-amber-100 via-amber-200 to-amber-100 bg-[length:200%_100%] animate-[gradient-x_2s_ease_infinite]">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-700 gap-1.5">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-[10px] font-medium">生成中 {generated.progress}%</span>
            </div>
          </div>
        )}

        {/* === QUEUED：浅灰骨架 + 排队提示 === */}
        {isQueued && !virtual && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-1">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-[10px]">排队中</span>
            </div>
          </div>
        )}

        {/* === FAILED：红色 + 重试 === */}
        {isFailed && !virtual && (
          <div className="absolute inset-0 bg-rose-50 flex flex-col items-center justify-center text-rose-500 gap-1.5 p-2">
            <XCircle className="w-6 h-6" />
            <span className="text-[10px] text-center line-clamp-2">{generated.errorMessage ?? "生成失败"}</span>
          </div>
        )}

        {/* === VIRTUAL：骨架占位 + "生成这张" 按钮 === */}
        {virtual && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center text-slate-400">
                <Play className="w-5 h-5" />
              </div>
              <span className="text-[10px] text-slate-400">未生成</span>
            </div>
          </div>
        )}

        {/* picked 徽标 */}
        {picked && (
          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center shadow">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}

        {/* 序号 */}
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/40 text-white text-[10px]">
          #{generated.candidateIdx}
        </div>
      </div>

      {/* === VIRTUAL hover：显示"生成这张"按钮覆盖层 === */}
      {virtual && (
        <button
          onClick={() => actions.onGenerate(planId)}
          disabled={disabled}
          className="absolute inset-0 flex items-center justify-center bg-amber-500/0 hover:bg-amber-500/85 hover:backdrop-blur-sm transition-all text-white opacity-0 hover:opacity-100 disabled:cursor-not-allowed"
          title="生成这张"
        >
          <span className="inline-flex items-center gap-1 font-medium text-sm">
            <Play className="w-4 h-4" />
            生成这张
          </span>
        </button>
      )}

      {/* === FAILED：单独的重试覆盖层 === */}
      {isFailed && !virtual && (
        <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-rose-900/70 to-transparent flex items-center justify-center gap-1">
          <button
            onClick={() => actions.onGenerate(planId, generated.id)}
            disabled={disabled}
            className="px-2 h-6 rounded bg-white/90 text-rose-700 text-[10px] font-medium hover:bg-white inline-flex items-center gap-0.5"
          >
            <RotateCw className="w-3 h-3" />
            重试
          </button>
          <button
            onClick={() => actions.onDelete(generated.id)}
            disabled={disabled}
            className="w-6 h-6 rounded flex items-center justify-center text-white bg-rose-500/80 hover:bg-rose-500"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* === DONE hover：完整操作行 === */}
      {isDone && !virtual && (
        <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
          <button
            onClick={() => actions.onTogglePicked(generated.id, !picked)}
            disabled={disabled}
            className={cn(
              "w-6 h-6 rounded flex items-center justify-center text-white transition-colors",
              picked ? "bg-brand-500" : "bg-white/20 hover:bg-white/30",
            )}
            title={picked ? "取消挑选" : "挑选这张"}
          >
            <Check className="w-3 h-3" />
          </button>
          <RegenerateDialog
            title="重新生成这张"
            placeholder="例如：换个角度 / 颜色更深 / 突出材质…"
            onSubmit={() => actions.onGenerate(planId, generated.id)}
          >
            <button
              disabled={disabled}
              className="w-6 h-6 rounded flex items-center justify-center text-white bg-white/20 hover:bg-white/30"
              title="重新生成"
            >
              <RotateCw className="w-3 h-3" />
            </button>
          </RegenerateDialog>
          {generated.url && (
            <a
              href={generated.url}
              download
              className="w-6 h-6 rounded flex items-center justify-center text-white bg-white/20 hover:bg-white/30"
              title="下载"
            >
              <Download className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={() => actions.onDelete(generated.id)}
            disabled={disabled}
            className="w-6 h-6 rounded flex items-center justify-center text-white bg-rose-500/80 hover:bg-rose-500"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
