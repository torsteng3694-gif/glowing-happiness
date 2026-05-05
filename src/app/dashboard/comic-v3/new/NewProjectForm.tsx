"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Textarea, Select } from "@/components/ui";
import { Sparkles, Wand2, Image as ImageIcon } from "lucide-react";
import { IMAGE_PRESETS, type ImagePresetSlug } from "@/lib/comic-v3/image-presets";

const PRESET_PROMPTS = [
  "一个程序员意外穿越成中世纪魔法师，靠 Stack Overflow 拯救王国",
  "侦探调查一桩看似简单的失踪案，却发现整座小镇都参与了隐瞒",
  "末世幸存者发现自己其实是 AI 模拟出的一段记忆",
];

export default function NewProjectForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"auto" | "step">("auto");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720P");
  const [imagePreset, setImagePreset] = useState<ImagePresetSlug>("default");
  const [extBgm, setExtBgm] = useState(false);
  const [extSubtitles, setExtSubtitles] = useState(true);
  const [extMultiVoice, setExtMultiVoice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (prompt.trim().length < 6) {
      setErr("故事描述至少 6 个字");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/comic-v3/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          title: title.trim() || undefined,
          mode,
          aspectRatio,
          resolution,
          imagePreset,
          extensions: { bgm: extBgm, subtitles: extSubtitles, multiVoice: extMultiVoice },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "创建失败");
        return;
      }
      router.replace(`/dashboard/comic-v3/${data.projectId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card className="p-6">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="w-4 h-4 text-violet-600" /> 故事描述
        </Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="一句话或一段文字描述你的故事点子。越具体效果越好。"
          className="mt-1"
        />
        <div className="mt-1 text-right text-xs text-slate-400">{prompt.length}/2000</div>
        <div className="mt-3">
          <div className="text-xs text-slate-500 mb-2">需要灵感？试试：</div>
          <div className="flex flex-wrap gap-2">
            {PRESET_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrompt(p)}
                className="text-left text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50/50"
              >
                <Wand2 className="w-3 h-3 inline mr-1 text-violet-500" />
                {p}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <Label>项目标题（可选）</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="留空则用故事描述自动生成"
            maxLength={30}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>运行模式</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as "auto" | "step")} className="mt-1 w-full">
              <option value="auto">自动 — 关键步暂停</option>
              <option value="step">逐步 — 每步都暂停</option>
            </Select>
          </div>
          <div>
            <Label>画面比例</Label>
            <Select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="mt-1 w-full">
              <option value="16:9">16:9（横屏）</option>
              <option value="9:16">9:16（竖屏）</option>
              <option value="1:1">1:1（方形）</option>
            </Select>
          </div>
          <div>
            <Label>分辨率</Label>
            <Select value={resolution} onChange={(e) => setResolution(e.target.value)} className="mt-1 w-full">
              <option value="480P">480P（最快）</option>
              <option value="720P">720P（推荐）</option>
              <option value="1080P">1080P（最佳）</option>
            </Select>
          </div>
        </div>

        <div>
          <Label className="flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-violet-600" /> 图像模型套餐
          </Label>
          <p className="text-[11px] text-slate-400 mt-0.5 mb-2">
            决定角色立绘 / 关键帧用哪个图像模型。可在工作台单独「重生成」时不影响整体。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {IMAGE_PRESETS.map((p) => {
              const active = imagePreset === p.slug;
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => setImagePreset(p.slug)}
                  className={
                    "text-left rounded-xl border p-3 transition " +
                    (active
                      ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/40"
                      : "border-slate-200 hover:border-violet-300 hover:bg-slate-50/60")
                  }
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-900">{p.label}</span>
                    <span
                      className={
                        "text-[10px] px-1.5 py-0.5 rounded font-medium border " + p.accentClass
                      }
                    >
                      {p.imageSlug || "auto"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 leading-snug">{p.description}</div>
                  <div className="text-[11px] text-slate-400 mt-1">推荐：{p.bestFor}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>扩展能力</Label>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <ExtToggle label="字幕" checked={extSubtitles} onChange={setExtSubtitles} />
            <ExtToggle label="BGM 配乐" checked={extBgm} onChange={setExtBgm} />
            <ExtToggle label="多角色音色" checked={extMultiVoice} onChange={setExtMultiVoice} />
          </div>
        </div>
      </Card>

      {err && (
        <div className="rounded-lg bg-rose-50 border border-rose-100 px-4 py-2 text-sm text-rose-700">{err}</div>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="glow" loading={submitting} size="lg">
          创建项目并开始
        </Button>
      </div>
    </form>
  );
}

function ExtToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={
        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition " +
        (checked
          ? "border-violet-300 bg-violet-50/60 text-violet-800"
          : "border-slate-200 hover:border-slate-300")
      }
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-violet-600"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
