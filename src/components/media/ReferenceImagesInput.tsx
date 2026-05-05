"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Link2, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * 参考图输入组件（图生图 / 图生视频通用）。
 *
 * 对外值形态：`string[]`，每个元素是能被上游拉到的 URL（或 data URL）：
 *   - 绝对 URL   https://…            ← 推荐（上游可直接 GET）
 *   - 相对路径   /uploads/xxx.png      ← 本地上传落盘，但上游不一定能访问（看部署）
 *   - data:…base64                     ← 兜底：上传失败后用 base64
 *
 * 调用策略：
 *   1) 优先 POST /api/uploads，把返回的 absoluteUrl 放进 value
 *   2) 上传失败 / 禁用上传时，回退到 data URL base64
 *   3) 用户手工粘贴的 URL 原样存入
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB（和后端保持一致）

async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error || new Error("read file error"));
    fr.readAsDataURL(f);
  });
}

async function tryUpload(f: File): Promise<{ ok: true; absoluteUrl: string; isLocalhost: boolean } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data?.error || `upload ${res.status}` };
    }
    return { ok: true, absoluteUrl: data.absoluteUrl, isLocalhost: Boolean(data.isLocalhost) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function shortLabel(v: string, idx: number): string {
  if (v.startsWith("data:")) return `本地图 #${idx + 1}（base64）`;
  try {
    const u = new URL(v, "http://x");
    const host = u.host === "x" ? "" : u.host + " · ";
    const name = u.pathname.split("/").filter(Boolean).pop() || "";
    return host + (name.length > 20 ? name.slice(0, 18) + "…" : name);
  } catch {
    return v.slice(0, 24) + (v.length > 24 ? "…" : "");
  }
}

export function ReferenceImagesInput({
  value,
  onChange,
  max = 4,
  label = "参考图（可选）",
  hint,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [uploading, setUploading] = useState(false);

  const add = useCallback(
    (v: string) => {
      if (value.length >= max) {
        setErr(`最多 ${max} 张参考图`);
        return;
      }
      onChange([...value, v]);
    },
    [value, max, onChange],
  );

  const remove = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange],
  );

  async function onPick(files: FileList | null) {
    if (!files || !files.length) return;
    setErr("");
    setInfo("");
    const arr = Array.from(files).slice(0, max - value.length);
    if (arr.length === 0) return;

    setUploading(true);
    const next: string[] = [];
    let fellBack = false;
    let anyLocalhost = false;
    for (const f of arr) {
      if (!f.type.startsWith("image/")) {
        setErr((s) => (s ? s + "；" : "") + `${f.name}：不是图片`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setErr((s) => (s ? s + "；" : "") + `${f.name}：单张不能超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB`);
        continue;
      }
      // 1) 先试服务端上传
      const up = await tryUpload(f);
      if (up.ok) {
        next.push(up.absoluteUrl);
        if (up.isLocalhost) anyLocalhost = true;
        continue;
      }
      // 2) 失败降级 base64
      try {
        next.push(await fileToDataUrl(f));
        fellBack = true;
      } catch (e) {
        setErr((s) => (s ? s + "；" : "") + `${f.name}：${e instanceof Error ? e.message : "读取失败"}`);
      }
    }
    setUploading(false);
    if (next.length) onChange([...value, ...next]);
    if (inputRef.current) inputRef.current.value = "";

    if (anyLocalhost) {
      setInfo(
        "当前域名是 localhost/内网，上游拉不到。部分模型（如 gpt-image-2）只收公网 URL，" +
          "请粘贴公网图片 URL，或在 .env 中设置 PUBLIC_BASE_URL=你的 ngrok/cloudflared 隧道地址。",
      );
    } else if (fellBack) {
      setInfo("上传接口不可用，已回退为 base64。部分上游不接受 base64 图片，若报错请粘贴公网 URL。");
    }
  }

  function tryAddUrl() {
    const t = urlInput.trim();
    if (!t) return;
    if (!/^https?:\/\//i.test(t) && !t.startsWith("data:")) {
      setErr("请粘贴 http(s):// 开头的完整图片 URL，或 data:image/... base64");
      return;
    }
    add(t);
    setUrlInput("");
    setErr("");
    setInfo("");
  }

  const canAdd = value.length < max;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-600 font-medium">{label}</span>
        <span className="text-[11px] text-slate-400">
          {value.length}/{max}
        </span>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {value.map((v, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group"
              title={v.length > 120 ? v.slice(0, 120) + "…" : v}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v} alt={`ref ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                title="移除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[10px] text-white truncate">
                {shortLabel(v, i)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canAdd || uploading}
          onClick={() => inputRef.current?.click()}
          className={cn((!canAdd || uploading) && "opacity-50")}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          {uploading ? "上传中" : "上传"}
        </Button>
        <div className="relative">
          <Link2 className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                tryAddUrl();
              }
            }}
            placeholder="或粘贴公网图片 URL"
            disabled={!canAdd}
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Button type="button" size="sm" variant="outline" disabled={!canAdd || !urlInput.trim()} onClick={tryAddUrl}>
          添加
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        hidden
        onChange={(e) => onPick(e.target.files)}
      />

      {hint && <div className="text-[11px] text-slate-400 leading-4">{hint}</div>}
      {info && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 leading-4">
          {info}
        </div>
      )}
      {err && (
        <div className="text-[11px] text-rose-600 inline-flex items-start gap-1 leading-4">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> <span>{err}</span>
        </div>
      )}
    </div>
  );
}
