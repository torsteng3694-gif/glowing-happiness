"use client";

import { useState } from "react";
import { Button, Card, Label, Select } from "@/components/ui";
import { Wand2, Save, AlertTriangle, CheckCircle2 } from "lucide-react";

type Option = { slug: string; label: string };
type Pipeline = { llmSlug: string; ttsSlug: string; imageSlug: string; videoSlug: string };
type Initial = {
  current: Pipeline;
  defaults: Pipeline;
  options: { llm: Option[]; tts: Option[]; image: Option[]; video: Option[] };
};

export default function ComicPipelineClient({ initial }: { initial: Initial }) {
  const [pipeline, setPipeline] = useState<Pipeline>(initial.current);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  function patch(p: Partial<Pipeline>) {
    setPipeline((s) => ({ ...s, ...p }));
    setOk(false);
    setErr("");
  }

  async function save() {
    setSaving(true);
    setErr("");
    setOk(false);
    try {
      const res = await fetch("/api/admin/comic-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pipeline),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function renderRow(
    title: string,
    desc: string,
    field: keyof Pipeline,
    options: Option[],
    defaultSlug: string,
  ) {
    const value = pipeline[field];
    const missing = !options.find((o) => o.slug === value);
    return (
      <div className="rounded-xl border border-slate-200 p-4 bg-white">
        <Label>{title}</Label>
        <div className="text-xs text-slate-500 mb-2">{desc}</div>
        <Select
          value={value}
          onChange={(e) => patch({ [field]: e.target.value } as Partial<Pipeline>)}
          className="w-full"
        >
          {missing && (
            <option value={value}>
              {value}（当前值未在已启用模型中找到）
            </option>
          )}
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.slug} — {o.label}
            </option>
          ))}
        </Select>
        <div className="text-[11px] text-slate-400 mt-1">
          默认：<code className="px-1 bg-slate-100 rounded">{defaultSlug}</code>
          {options.length === 0 && (
            <span className="text-amber-600 ml-2">⚠ 该类型尚无可用模型，请先到「模型市场」启用一个</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <Wand2 className="w-6 h-6 text-violet-500" />
          解说漫剧 · 模型管线
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          配置「解说漫剧导演台」每一步使用的上游模型。用户在 <code className="px-1 bg-slate-100 rounded">/dashboard/explain-comic</code> 提交任务时，按下面这套管线依次调用。
        </p>
      </div>

      <Card className="p-4 bg-violet-50/60 border-violet-200 text-sm text-violet-800">
        管线流程：<b>剧本</b> → <b>LLM 拆分</b> → <b>每镜首/尾帧（图像）</b> → <b>每镜台词（TTS）</b> → <b>每镜片段（首尾帧→视频）</b> → <b>导出 ZIP</b>
      </Card>

      <div className="space-y-3">
        {renderRow(
          "1. LLM（剧本拆分）",
          "把剧本拆分成分镜表，给出画面描述、台词、推荐时长、转场提示。",
          "llmSlug",
          initial.options.llm,
          initial.defaults.llmSlug,
        )}
        {renderRow(
          "2. Image（首帧 / 尾帧）",
          "为每个分镜生成首帧（必选）和尾帧（可选，用于过渡）。推荐高一致性的图像模型。",
          "imageSlug",
          initial.options.image,
          initial.defaults.imageSlug,
        )}
        {renderRow(
          "3. TTS（台词配音）",
          "把台词合成语音，拿到真实秒数后再决定视频片段时长档。",
          "ttsSlug",
          initial.options.tts,
          initial.defaults.ttsSlug,
        )}
        {renderRow(
          "4. Video（首尾帧 → 片段）",
          "用首帧（+ 尾帧）+ 时长生成视频片段。建议用支持首尾帧的视频模型，例如 vidu-img2video。",
          "videoSlug",
          initial.options.video,
          initial.defaults.videoSlug,
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving} loading={saving}>
          <Save className="w-4 h-4" />
          保存管线
        </Button>
        {ok && (
          <span className="text-sm text-emerald-700 inline-flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> 已保存
          </span>
        )}
        {err && (
          <span className="text-sm text-rose-600 inline-flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> {err}
          </span>
        )}
      </div>
    </div>
  );
}
