"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText, ImageIcon, AudioLines, Film, Check, RotateCcw, Search, ChevronDown, AlertTriangle, Loader2,
} from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export type ModelOpt = { slug: string; name: string; provider: string; logo: string };

export type PipelineState = {
  effective: { llmSlug: string; ttsSlug: string; imageSlug: string; videoSlug: string };
  global:    { llmSlug: string; ttsSlug: string; imageSlug: string; videoSlug: string };
  userOverrides: Partial<{ llmSlug: string; ttsSlug: string; imageSlug: string; videoSlug: string }>;
};

export type PipelineOptions = {
  llm: ModelOpt[];
  tts: ModelOpt[];
  image: ModelOpt[];
  video: ModelOpt[];
};

type Field = "llmSlug" | "ttsSlug" | "imageSlug" | "videoSlug";

const FIELD_META: Record<Field, { label: string; type: keyof PipelineOptions; icon: typeof FileText }> = {
  llmSlug:   { label: "LLM",   type: "llm",   icon: FileText },
  imageSlug: { label: "图像",  type: "image", icon: ImageIcon },
  ttsSlug:   { label: "TTS",   type: "tts",   icon: AudioLines },
  videoSlug: { label: "视频",  type: "video", icon: Film },
};

const ORDER: Field[] = ["llmSlug", "imageSlug", "ttsSlug", "videoSlug"];

export function PipelineSelector({
  pipeline, options, onChange,
}: {
  pipeline: PipelineState;
  options: PipelineOptions;
  onChange: (next: PipelineState) => void;
}) {
  const [openField, setOpenField] = useState<Field | null>(null);
  const [saving, setSaving] = useState<Field | null>(null);
  const [err, setErr] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!openField) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenField(null);
      }
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [openField]);

  async function commit(field: Field, slug: string) {
    setSaving(field);
    setErr("");
    try {
      // slug = "" 表示恢复全局默认
      const res = await fetch("/api/me/comic-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onChange({
        effective: data.effective,
        global: data.global,
        userOverrides: data.userOverrides || {},
      });
      setOpenField(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        {ORDER.map((f) => (
          <PipelineChip
            key={f}
            field={f}
            pipeline={pipeline}
            options={options[FIELD_META[f].type]}
            isOpen={openField === f}
            isSaving={saving === f}
            onToggle={() => setOpenField((cur) => (cur === f ? null : f))}
          />
        ))}
      </div>

      {openField && (
        <ChooserPanel
          field={openField}
          options={options[FIELD_META[openField].type]}
          currentSlug={pipeline.effective[openField]}
          globalSlug={pipeline.global[openField]}
          isUserOverride={openField in pipeline.userOverrides}
          onPick={(slug) => commit(openField, slug)}
          onResetToGlobal={() => commit(openField, "")}
          onClose={() => setOpenField(null)}
        />
      )}

      {err && (
        <div className="mt-2 text-xs text-rose-600 inline-flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> <span>{err}</span>
        </div>
      )}
    </div>
  );
}

/* =================== Chip =================== */
function PipelineChip({
  field, pipeline, options, isOpen, isSaving, onToggle,
}: {
  field: Field;
  pipeline: PipelineState;
  options: ModelOpt[];
  isOpen: boolean;
  isSaving: boolean;
  onToggle: () => void;
}) {
  const meta = FIELD_META[field];
  const Icon = meta.icon;
  const slug = pipeline.effective[field];
  const opt = options.find((o) => o.slug === slug);
  const isUser = field in pipeline.userOverrides;
  const available = !!opt;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isSaving}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border text-xs transition select-none",
        "focus:outline-none focus:ring-2 focus:ring-violet-400/40",
        available
          ? isUser
            ? "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
        isOpen && "ring-2 ring-violet-400/40 border-violet-400",
      )}
      title={available ? `${opt!.provider} · ${slug}${isUser ? "（你的私有覆盖）" : "（平台默认）"}` : `未配置：${slug}`}
    >
      <Icon className="w-3 h-3 text-slate-400" />
      <span className="text-slate-400">{meta.label}</span>
      {isSaving ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <>
          <span className="font-medium max-w-[120px] truncate">
            {available ? opt!.name : slug}
          </span>
          {isUser && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" title="你的私有覆盖" />}
        </>
      )}
      <ChevronDown className={cn("w-3 h-3 text-slate-400 transition-transform", isOpen && "rotate-180")} />
    </button>
  );
}

/* =================== ChooserPanel =================== */
function ChooserPanel({
  field, options, currentSlug, globalSlug, isUserOverride, onPick, onResetToGlobal, onClose,
}: {
  field: Field;
  options: ModelOpt[];
  currentSlug: string;
  globalSlug: string;
  isUserOverride: boolean;
  onPick: (slug: string) => void;
  onResetToGlobal: () => void;
  onClose: () => void;
}) {
  const meta = FIELD_META[field];
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? options.filter((o) =>
        o.slug.toLowerCase().includes(q.toLowerCase()) ||
        o.name.toLowerCase().includes(q.toLowerCase()) ||
        o.provider.toLowerCase().includes(q.toLowerCase()),
      )
    : options;

  return (
    <div className="absolute z-30 left-0 mt-2 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <div className="text-sm font-semibold inline-flex items-center gap-2">
          <meta.icon className="w-4 h-4 text-violet-500" />
          选择 {meta.label} 模型
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-700 px-1.5 h-6 rounded"
        >
          关闭
        </button>
      </div>
      <div className="p-2 border-b border-slate-100">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索 slug / 名字 / 厂商"
            className="h-8 text-xs pl-7"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-400">
            没有匹配的模型。
            {options.length === 0 && (
              <div className="mt-1">该类型还没启用任何模型，请联系管理员。</div>
            )}
          </div>
        ) : (
          filtered.map((o) => {
            const selected = o.slug === currentSlug;
            const isGlobalDefault = o.slug === globalSlug;
            return (
              <button
                key={o.slug}
                type="button"
                onClick={() => onPick(o.slug)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left",
                  selected && "bg-violet-50/60",
                )}
              >
                <span className="w-6 text-base shrink-0">{o.logo}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{o.name}</span>
                    {isGlobalDefault && (
                      <span className="text-[10px] px-1.5 h-4 rounded-full bg-slate-100 text-slate-500 inline-flex items-center">
                        平台默认
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    <code>{o.slug}</code> · {o.provider}
                  </div>
                </div>
                {selected && <Check className="w-4 h-4 text-violet-600 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-500">
          {isUserOverride
            ? <>你已私有覆盖 · 平台默认是 <code className="text-slate-700">{globalSlug}</code></>
            : <>当前用平台默认 <code className="text-slate-700">{globalSlug}</code></>}
        </span>
        {isUserOverride && (
          <button
            onClick={onResetToGlobal}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-violet-700 px-2 h-6 rounded-md hover:bg-white"
          >
            <RotateCcw className="w-3 h-3" /> 恢复默认
          </button>
        )}
      </div>
    </div>
  );
}
