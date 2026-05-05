"use client";

/**
 * 视觉模型选择器
 *
 *   节点 01 / 03 运行前用此组件选择视觉模型，并发送到 run API
 *   首次加载从 /api/ecom-image/models 拉取列表，缓存在 localStorage
 */

import { useEffect, useState } from "react";
import { Brain, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";

export interface VisionModel {
  slug: string;
  name: string;
  provider: string;
  tags: string[];
  description: string | null;
  contextLength: number | null;
  sellInputPrice: number;
  sellOutputPrice: number;
}

const LS_KEY = "ecom-image:last-model-slug";

export function useLastModelSlug() {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v) setSlug(v);
    } catch {}
  }, []);
  const save = (s: string) => {
    setSlug(s);
    try {
      localStorage.setItem(LS_KEY, s);
    } catch {}
  };
  return [slug, save] as const;
}

export interface ModelPickerProps {
  /** 当前选中的 slug；无值时显示空 */
  value: string | null;
  onChange: (slug: string) => void;
  /** 默认折叠为单行；展开后显示完整网格 */
  compact?: boolean;
  disabled?: boolean;
}

export default function ModelPicker({ value, onChange, compact, disabled }: ModelPickerProps) {
  const [models, setModels] = useState<VisionModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    let mounted = true;
    fetch("/api/ecom-image/models", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j.error) {
          setError(j.error);
        } else {
          setModels(j.models ?? []);
        }
      })
      .catch((e) => mounted && setError(String(e)));
    return () => {
      mounted = false;
    };
  }, []);

  const selected = models?.find((m) => m.slug === value) ?? null;

  if (error) {
    return (
      <div className="text-xs text-rose-600 px-2 py-1.5 bg-rose-50 rounded">
        模型列表加载失败：{error}
      </div>
    );
  }

  if (!models) {
    return (
      <div className="text-xs text-slate-400 inline-flex items-center gap-1">
        <Spinner /> 加载可选模型…
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="text-xs text-rose-600 px-2 py-1.5 bg-rose-50 rounded">
        当前没有可用的多模态模型，请联系管理员
      </div>
    );
  }

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-amber-300 hover:bg-amber-50/30 transition-colors disabled:opacity-50"
      >
        <Brain className="w-3.5 h-3.5 text-amber-500" />
        {selected ? selected.name : "选择视觉模型"}
        <span className="text-slate-300">▾</span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 max-h-72 overflow-y-auto">
      <div className="text-xs text-slate-500 px-2 py-1 mb-1 flex items-center gap-1.5">
        <Brain className="w-3.5 h-3.5 text-amber-500" />
        选择视觉模型 · {models.length} 个可用
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
        {models.map((m) => {
          const isSel = m.slug === value;
          return (
            <button
              key={m.slug}
              onClick={() => {
                onChange(m.slug);
                if (compact) setExpanded(false);
              }}
              disabled={disabled}
              className={cn(
                "text-left p-2 rounded-md border transition-colors",
                isSel
                  ? "border-amber-300 bg-amber-50/60"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="font-medium text-sm text-slate-800 truncate">{m.name}</div>
                {isSel && <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500">
                <span className="px-1 py-0.5 rounded bg-slate-100">{m.provider}</span>
                {m.tags.slice(0, 3).map((t) => (
                  <span key={t} className="px-1 py-0.5 rounded bg-slate-50 border border-slate-200">
                    {t}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
