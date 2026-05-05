"use client";

/**
 * 起始页客户端表单
 *
 *   - 商品图上传（最多 9 张），上传立即落 EcomSourceImage（项目还没建时先存 tmp 缓存）
 *   - textarea + 发送按钮 → 创建项目 → 把 tmp 图绑到项目
 *
 * 阶段 1 实现：先创建项目（只带 prompt）→ 再上传图（带 projectId）→ 跳转工作台
 * 这样上传 API 直接落库，避免 tmp 中转。
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ImagePlus, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ecomApi } from "@/lib/ecom-image/api-client";

interface PendingImage {
  file: File;
  previewUrl: string;
}

const MAX_IMAGES = 9;

export default function NewProjectForm({ autoDemo }: { autoDemo: boolean }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [demoTriggered, setDemoTriggered] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 自动触发 demo
  useEffect(() => {
    if (!autoDemo || demoTriggered) return;
    setDemoTriggered(true);
    handleDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

  function handlePickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next = [...images];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_IMAGES) break;
      if (!f.type.startsWith("image/")) continue;
      next.push({ file: f, previewUrl: URL.createObjectURL(f) });
    }
    setImages(next);
  }

  function removeImage(idx: number) {
    setImages((prev) => {
      const next = [...prev];
      const removed = next.splice(idx, 1)[0];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  async function uploadAll(projectId: string) {
    for (let i = 0; i < images.length; i++) {
      setUploadStage(`正在上传第 ${i + 1}/${images.length} 张图…`);
      const fd = new FormData();
      fd.append("file", images[i].file);
      fd.append("projectId", projectId);
      const res = await fetch("/api/ecom-image/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `第 ${i + 1} 张上传失败`);
      }
    }
  }

  async function handleSend() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1. 先创建项目
      setUploadStage("创建项目…");
      const proj = await ecomApi.createProject({ prompt: prompt.trim() });

      // 2. 串行上传图片（保证顺序）
      if (images.length > 0) {
        await uploadAll(proj.projectId);
      }

      // 3. 跳工作台（用户在工作台手动选模型 + 点开始分析）
      setUploadStage("跳转工作台…");
      router.push(`/dashboard/ecom-image/${proj.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
      setBusy(false);
      setUploadStage(null);
    }
  }

  async function handleDemo() {
    setBusy(true);
    setError(null);
    setUploadStage("生成 Demo…");
    try {
      const res = await ecomApi.createDemoProject();
      router.push(`/dashboard/ecom-image/${res.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo 创建失败");
      setBusy(false);
      setUploadStage(null);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <header className="px-4 md:px-8 py-4 flex items-center justify-between border-b border-slate-100">
        <Link
          href="/dashboard/ecom-image"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="w-4 h-4" />
          返回项目列表
        </Link>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
          onClick={handleDemo}
          loading={busy && demoTriggered}
          disabled={busy}
        >
          一键体验 Demo
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-2">
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              电商一键出图
            </span>
          </h1>
          <p className="text-sm text-slate-500">AI 智能体 · 多轮对话 · 每步可控</p>
        </div>

        {/* 4 步缩略卡 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl w-full mb-10">
          {[
            { idx: 1, title: "商品智能分析", desc: "上传图片 + 描述，AI 自动识别商品" },
            { idx: 2, title: "出图需求智能推荐", desc: "AI 胶囊式推荐：主图 / 详情页 / 营销图" },
            { idx: 3, title: "风格方案 · 逐张可控", desc: "选风格、定方案、每张图的画面和文案" },
            { idx: 4, title: "批量生成 · 审阅微调", desc: "补充垫图、质量自检、不满意一键重" },
          ].map((s) => (
            <Card key={s.idx} className="p-3">
              <div className="text-[10px] text-amber-600 font-mono mb-1">0{s.idx}</div>
              <div className="text-sm font-medium text-slate-800 mb-1">{s.title}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{s.desc}</div>
            </Card>
          ))}
        </div>

        {/* 输入区 */}
        <div className="w-full max-w-3xl">
          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {error}
            </div>
          )}
          {uploadStage && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {uploadStage}
            </div>
          )}

          {/* 已选图片预览 */}
          {images.length > 0 && (
            <div className="mb-3 flex items-center flex-wrap gap-2">
              {images.map((img, i) => (
                <div
                  key={i}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.previewUrl} alt={img.file.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    disabled={busy}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                    aria-label="移除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <span className="text-xs text-slate-500">
                {images.length} / {MAX_IMAGES} 张
              </span>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-2">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy || images.length >= MAX_IMAGES}
                className="shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 hover:border-amber-300 hover:bg-amber-50/30 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={`上传商品图（最多 ${MAX_IMAGES} 张）`}
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-[10px]">商品图</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  handlePickFiles(e.target.files);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={3}
                placeholder="输入商品名称和详细信息，例如：XXX 品牌玻尿酸精华液，30ml，主打三重保湿…"
                disabled={busy}
                className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none placeholder:text-slate-400 resize-none disabled:bg-slate-50 disabled:text-slate-400"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={busy || !prompt.trim()}
                className="shrink-0 w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="开始出图"
              >
                {busy && !demoTriggered ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            支持 PNG / JPG / WEBP，单张 ≤10MB · ⌘/Ctrl + Enter 发送
          </p>
        </div>
      </main>
    </div>
  );
}
