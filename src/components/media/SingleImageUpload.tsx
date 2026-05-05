"use client";

import { useRef, useState } from "react";
import { ImagePlus, Link2, Trash2, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // Vidu 上限 20MB

async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error || new Error("read file error"));
    fr.readAsDataURL(f);
  });
}

async function tryUpload(f: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error || `upload ${res.status}` };
    return { ok: true, url: data.absoluteUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 单图上传/粘贴 URL 组件，比 ReferenceImagesInput 更紧凑。
 * 用于资产卡片的"参考图"输入。
 */
export function SingleImageUpload({
  value,
  onChange,
  placeholder = "粘贴图片 URL",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function onPick(file: File | null) {
    if (!file) return;
    setErr("");
    if (!file.type.startsWith("image/")) {
      setErr("不是图片");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErr(`单图不超过 ${MAX_FILE_BYTES / 1024 / 1024}MB`);
      return;
    }
    setUploading(true);
    const up = await tryUpload(file);
    if (up.ok) {
      onChange(up.url);
    } else {
      try {
        onChange(await fileToDataUrl(file));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "读取失败");
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function tryAddUrl() {
    const t = urlInput.trim();
    if (!t) return;
    if (!/^https?:\/\//i.test(t) && !t.startsWith("data:")) {
      setErr("请粘贴 http(s):// 链接或 data:image/...;base64,...");
      return;
    }
    onChange(t);
    setUrlInput("");
    setErr("");
  }

  return (
    <div className="space-y-1.5">
      {value ? (
        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="ref" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
            title="移除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={cn("w-full", uploading && "opacity-60")}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {uploading ? "上传中" : "上传图片"}
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
              onBlur={tryAddUrl}
              placeholder={placeholder}
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0] || null)} />
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
    </div>
  );
}
