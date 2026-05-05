"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Search, ChevronDown, Check, Mic2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export type VoicePickerOption = {
  id: string;
  label: string;
  group: string;
  /** 试听音频 URL；没有则不显示播放按钮 */
  sample?: string;
  /** 是否标记为推荐（首位 ⭐） */
  recommended?: boolean;
  /** 是否是用户自己复刻的音色（特殊高亮） */
  cloned?: boolean;
  /** 复刻音色：是否已激活（仅 cloned=true 时有意义） */
  activated?: boolean;
};

type Props = {
  value: string;
  onChange: (id: string) => void;
  options: VoicePickerOption[];
  /** 是否允许清空（多用于 type=character 但不发声） */
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  /** 触发器尺寸：sm 用在资产卡内、md 用在 TTS 页主选 */
  size?: "sm" | "md";
};

export function VoicePicker({
  value, onChange, options,
  allowEmpty = false, emptyLabel = "（未选）",
  className, size = "md",
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 关闭弹层时停掉试听
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      setPlaying(null);
    }
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  // 卸载停掉
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const current = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(kw) ||
      o.id.toLowerCase().includes(kw) ||
      o.group.toLowerCase().includes(kw),
    );
  }, [q, options]);

  // 按 group 分桶，保持插入顺序
  const grouped = useMemo(() => {
    const m = new Map<string, VoicePickerOption[]>();
    for (const o of filtered) {
      if (!m.has(o.group)) m.set(o.group, []);
      m.get(o.group)!.push(o);
    }
    return m;
  }, [filtered]);

  function toggleSample(o: VoicePickerOption, e: React.MouseEvent) {
    e.stopPropagation();
    if (!o.sample) return;
    if (playing === o.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(o.sample);
    a.preload = "auto";
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
    audioRef.current = a;
    setPlaying(o.id);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full inline-flex items-center justify-between gap-2 rounded-lg border bg-white text-left",
          "transition-[border-color,box-shadow] duration-150",
          "focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400",
          open ? "border-brand-400 ring-2 ring-brand-400/40" : "border-slate-300 hover:border-slate-400",
          size === "sm" ? "h-9 px-2.5 text-sm" : "h-10 px-3 text-sm",
        )}
      >
        <span className="inline-flex items-center gap-2 min-w-0 flex-1">
          {current?.cloned ? (
            <Mic2 className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          ) : current?.recommended ? (
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : null}
          <span className="truncate">
            {current ? current.label : (allowEmpty ? emptyLabel : "选择音色…")}
          </span>
          {current && (
            <span className="text-[10px] text-slate-400 shrink-0">{current.group}</span>
          )}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索音色名 / id / 语言"
                className="h-8 text-xs pl-7"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left",
                  !value && "bg-brand-50/60",
                )}
              >
                <span className="flex-1 text-slate-500 italic">{emptyLabel}</span>
                {!value && <Check className="w-4 h-4 text-brand-600" />}
              </button>
            )}
            {grouped.size === 0 && (
              <div className="px-4 py-6 text-center text-xs text-slate-400">没有匹配的音色</div>
            )}
            {Array.from(grouped.entries()).map(([group, list]) => (
              <div key={group}>
                <div className="sticky top-0 z-[1] px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 bg-slate-50/95 backdrop-blur border-y border-slate-100">
                  {group} <span className="text-slate-400 font-normal normal-case ml-1">· {list.length}</span>
                </div>
                {list.map((o) => {
                  const selected = o.id === value;
                  const isPlaying = playing === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => { onChange(o.id); setOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 text-left group/item",
                        selected && "bg-brand-50/60",
                      )}
                      title={o.id}
                    >
                      {o.cloned ? (
                        <Mic2 className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                      ) : o.recommended ? (
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="truncate flex-1">
                        {o.label}
                        {o.cloned && !o.activated && (
                          <span className="ml-1.5 text-[10px] text-amber-600">待激活</span>
                        )}
                        {o.cloned && o.activated && (
                          <span className="ml-1.5 text-[10px] text-emerald-600">已激活</span>
                        )}
                      </span>
                      {o.sample && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => toggleSample(o, e)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSample(o, e as unknown as React.MouseEvent); } }}
                          className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition",
                            isPlaying
                              ? "bg-brand-600 text-white"
                              : "text-slate-400 hover:bg-slate-100 hover:text-brand-600 opacity-0 group-hover/item:opacity-100",
                          )}
                          title={isPlaying ? "暂停" : "试听"}
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </span>
                      )}
                      {selected && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100 bg-slate-50/50">
            点 ▶ 试听 · 共 {options.length} 个音色
          </div>
        </div>
      )}
    </div>
  );
}
