"use client";

/**
 * TTS 文本编辑器（带 <#x#> 停顿标记可视化 + 快捷插入）
 *
 * 视觉布局：
 *   [工具栏：插入 0.5s / 1s / 2s / 自定义停顿]
 *   [Textarea]
 *   [预览：把 <#1#> 渲染成胶囊]
 *   [校验提示：相邻标记 / 范围非法 / 字符超长]
 *
 * 对外保持 textarea 的 value/onChange 语义，内部不做去抖、不修改外部值。
 */

import { useMemo, useRef, useState } from "react";
import { Textarea, Button } from "@/components/ui";
import { Plus, AlertTriangle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

// 严格按 Vidu 文档：x 范围 [0.01, 99.99]，最多两位小数
const PAUSE_RE = /<#(\d{1,2}(?:\.\d{1,2})?)#>/g;

type Segment =
  | { kind: "text"; value: string }
  | { kind: "pause"; sec: number; raw: string };

function parseSegments(s: string): Segment[] {
  const out: Segment[] = [];
  let lastIdx = 0;
  PAUSE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAUSE_RE.exec(s)) !== null) {
    if (m.index > lastIdx) out.push({ kind: "text", value: s.slice(lastIdx, m.index) });
    out.push({ kind: "pause", sec: parseFloat(m[1]), raw: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) out.push({ kind: "text", value: s.slice(lastIdx) });
  return out;
}

/** 业务校验：两个停顿不能相邻；x 不能超出 [0.01, 99.99]；停顿不能在文本两端。 */
function validate(s: string): { ok: true } | { ok: false; reason: string } {
  const segs = parseSegments(s);
  // 范围（regex 已限制 1~2 位整数 + 2 位小数，但小数可能 0.00；用文档范围严格判断）
  for (const seg of segs) {
    if (seg.kind === "pause" && (seg.sec < 0.01 || seg.sec > 99.99)) {
      return { ok: false, reason: `停顿时长 ${seg.raw} 超出 [0.01, 99.99] 范围` };
    }
  }
  // 相邻：循环里只要遇到两个 pause 之间没有非空 text 就报错
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i];
    const b = segs[i + 1];
    if (a.kind === "pause" && b.kind === "pause") {
      return { ok: false, reason: "不能连续使用多个停顿标记，中间需要有可发音的文本" };
    }
    // pause 紧跟一段空白也算"中间没文本"
    if (a.kind === "pause" && b.kind === "text" && b.value.trim() === "") {
      const c = segs[i + 2];
      if (c && c.kind === "pause") {
        return { ok: false, reason: "停顿标记之间只有空白，请在中间填入文本" };
      }
    }
  }
  // 文档：标记需放在两个可发音文本之间 → 不能是字符串首/尾
  if (segs.length > 0) {
    const first = segs[0];
    const last = segs[segs.length - 1];
    if (first.kind === "pause") return { ok: false, reason: "停顿标记不能放在文本最前面" };
    if (last.kind === "pause") return { ok: false, reason: "停顿标记不能放在文本最后面" };
  }
  return { ok: true };
}

export function TtsTextEditor({
  value,
  onChange,
  maxLength = 10000,
  placeholder = "例：你好<#1#>我是vidu<#1#>很高兴见到你",
  minHeight = 200,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  minHeight?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [customPause, setCustomPause] = useState("1.5");
  const [showPreview, setShowPreview] = useState(true);

  const segs = useMemo(() => parseSegments(value), [value]);
  const validation = useMemo(() => validate(value), [value]);

  const charCount = [...value].length;
  const speakableCount = useMemo(() => {
    return segs.reduce((n, s) => n + (s.kind === "text" ? [...s.value].length : 0), 0);
  }, [segs]);
  const totalPauseSec = useMemo(() => {
    return segs.reduce((n, s) => n + (s.kind === "pause" ? s.sec : 0), 0);
  }, [segs]);

  /** 在光标处插入停顿标记；若当前 selection 跨过文本则替换。 */
  function insertPause(sec: number) {
    const ta = taRef.current;
    if (!ta) {
      onChange((value + `<#${formatSec(sec)}#>`).slice(0, maxLength));
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const tag = `<#${formatSec(sec)}#>`;
    const next = (value.slice(0, start) + tag + value.slice(end)).slice(0, maxLength);
    onChange(next);
    // 把光标移到插入的标记后面
    requestAnimationFrame(() => {
      const pos = Math.min(next.length, start + tag.length);
      ta.focus();
      try { ta.setSelectionRange(pos, pos); } catch { /* 老浏览器静默 */ }
    });
  }

  function tryInsertCustom() {
    const v = parseFloat(customPause);
    if (!Number.isFinite(v)) return;
    const clamped = Math.max(0.01, Math.min(99.99, v));
    insertPause(clamped);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center flex-wrap gap-2">
        <span className="text-[11px] text-slate-500 mr-1">快捷停顿：</span>
        {[0.5, 1, 2].map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => insertPause(s)}
            className="!h-7 !px-2.5 text-xs"
          >
            <Plus className="w-3 h-3" />
            {s}s
          </Button>
        ))}
        <div className="inline-flex items-center gap-1">
          <input
            type="number"
            min={0.01}
            max={99.99}
            step={0.1}
            value={customPause}
            onChange={(e) => setCustomPause(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryInsertCustom(); } }}
            className="w-16 h-7 px-2 rounded-md border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={tryInsertCustom}
            className="!h-7 !px-2 text-xs"
          >
            插入
          </Button>
        </div>
        <span className="text-[10px] text-slate-400 ml-1">范围 0.01–99.99 秒</span>

        <div className="ml-auto inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] px-2 h-7 rounded-md border transition",
              showPreview
                ? "border-violet-300 text-violet-700 bg-violet-50"
                : "border-slate-200 text-slate-500 hover:bg-slate-50",
            )}
            title="切换可视化预览"
          >
            <Eye className="w-3 h-3" />
            预览
          </button>
        </div>
      </div>

      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        className="text-sm leading-6 font-mono"
        style={{ minHeight }}
      />

      {showPreview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm leading-7 min-h-[2.25rem]">
          {segs.length === 0 || (segs.length === 1 && segs[0].kind === "text" && !segs[0].value) ? (
            <span className="text-slate-400 text-xs italic">预览：朗读效果中标记会渲染为停顿胶囊…</span>
          ) : (
            segs.map((seg, i) =>
              seg.kind === "text" ? (
                <span key={i} className="whitespace-pre-wrap">{seg.value}</span>
              ) : (
                <span
                  key={i}
                  title={`停顿 ${seg.sec} 秒（${seg.raw}）`}
                  className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-medium align-middle border border-violet-200 select-none"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  停顿 {seg.sec}s
                </span>
              ),
            )
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 text-[11px]">
        <div className="text-slate-400 inline-flex items-center gap-3">
          <span>字符 <b className="text-slate-600">{charCount}</b>/{maxLength}</span>
          <span>可发音 <b className="text-slate-600">{speakableCount}</b></span>
          {totalPauseSec > 0 && <span>停顿合计 <b className="text-slate-600">{totalPauseSec.toFixed(2)}s</b></span>}
        </div>
        {validation.ok ? null : (
          <div className="text-rose-600 inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{validation.reason}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSec(sec: number): string {
  // 0.5 → "0.5"，1 → "1"，1.5 → "1.5"，1.55 → "1.55"
  if (Number.isInteger(sec)) return String(sec);
  return String(Math.round(sec * 100) / 100);
}
