"use client";

import { useMemo, useState } from "react";
import { Button, Card, Label, Badge, Select } from "@/components/ui";
import { AudioLines, Download, AlertTriangle, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { PRESET_VOICES } from "../explain-comic/voices";
import { VoicePicker, type VoicePickerOption } from "@/components/media/VoicePicker";
import { TtsTextEditor } from "@/components/media/TtsTextEditor";

type ChannelOpt = { id: string; name: string; sellUnitPrice: number };
type Model = {
  id: string; slug: string; name: string; unitPrice: number; unit: string;
  channels: ChannelOpt[];
};
type VoiceClone = { voiceId: string; name: string; isActivated: boolean };

const EMOTIONS = [
  { id: "",          label: "自动（推荐）" },
  { id: "happy",     label: "高兴 happy" },
  { id: "sad",       label: "悲伤 sad" },
  { id: "angry",     label: "愤怒 angry" },
  { id: "fearful",   label: "害怕 fearful" },
  { id: "disgusted", label: "厌恶 disgusted" },
  { id: "surprised", label: "惊讶 surprised" },
  { id: "calm",      label: "中性 calm" },
] as const;

type ResultItem = {
  rid: string;
  text: string;
  voiceLabel: string;
  fileUrl?: string;
  credits?: number;
  cost?: number;
  voiceActivated?: boolean;
  error?: string;
};

export default function TtsClient({
  models, voiceClones,
}: { models: Model[]; voiceClones: VoiceClone[] }) {
  const model = models[0];
  const [channelId, setChannelId] = useState<string>(model?.channels?.[0]?.id || "");
  const [text, setText] = useState("你好，欢迎使用 vidu 开放平台。");
  const [voiceId, setVoiceId] = useState<string>("Chinese_Male_Protagonist");
  const [speed, setSpeed] = useState(1.0);
  const [volume, setVolume] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [emotion, setEmotion] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);

  const cnyPerCredit = model?.channels.find((c) => c.id === channelId)?.sellUnitPrice ?? model?.unitPrice ?? 0;
  // 估算：积分 ≈ 字符数（极保守，最终按 Vidu 真实 credits 结算）
  const estCredits = Math.max(1, [...text].length);
  const estCost = +(cnyPerCredit * estCredits).toFixed(2);

  const allVoices: VoicePickerOption[] = useMemo(() => {
    const clones: VoicePickerOption[] = voiceClones.map((v) => ({
      id: v.voiceId,
      label: v.name,
      group: "我的复刻音色",
      cloned: true,
      activated: v.isActivated,
    }));
    const presets: VoicePickerOption[] = PRESET_VOICES.map((v) => ({
      id: v.id,
      label: v.label,
      group: v.group || "其他",
      sample: v.sample,
      recommended: v.recommended,
    }));
    return [...clones, ...presets];
  }, [voiceClones]);

  function voiceLabel(id: string) {
    return allVoices.find((v) => v.id === id)?.label || id;
  }

  async function submit() {
    if (!model || !text.trim() || !voiceId) return;
    setSubmitting(true);
    const rid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const head: ResultItem = { rid, text: text.trim(), voiceLabel: voiceLabel(voiceId) };
    setResults((arr) => [head, ...arr]);
    try {
      const res = await fetch("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          channelId: channelId || undefined,
          text: text.trim(),
          voiceId,
          speed,
          volume,
          pitch,
          emotion: emotion || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResults((arr) => arr.map((x) => x.rid === rid ? {
        ...x,
        fileUrl: data.fileUrl,
        credits: data.credits,
        cost: data.cost,
        voiceActivated: data.voiceActivated,
      } : x));
    } catch (e) {
      setResults((arr) => arr.map((x) => x.rid === rid ? {
        ...x,
        error: e instanceof Error ? e.message : "请求失败",
      } : x));
    } finally {
      setSubmitting(false);
    }
  }

  if (!model) {
    return (
      <div className="p-8">
        <Card className="p-8 text-center">
          <div className="text-slate-700 font-semibold">还没有可用的语音合成模型</div>
          <div className="text-sm text-slate-500 mt-2">
            请联系管理员启用 <code className="px-1 bg-slate-100 rounded">vidu-audio-tts</code>。
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <AudioLines className="w-6 h-6 text-violet-500" />
          语音合成（TTS）
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          输入文本 + 音色，同步返回音频文件 · 支持复刻音色 · 用复刻音色首次合成会自动激活变永久
        </p>
      </div>

      <Card className="p-6">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-3">
            <div>
              <Label>文本（支持 &lt;#x#&gt; 停顿标记）</Label>
              <TtsTextEditor
                value={text}
                onChange={setText}
                maxLength={10000}
                minHeight={220}
              />
            </div>
          </div>

          <div className="space-y-3">
            {model.channels.length > 1 && (
              <div>
                <Label>渠道</Label>
                <Select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full">
                  {model.channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · ¥{c.sellUnitPrice}/积分</option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label>音色（共 {allVoices.length} 个，可搜索 / 试听）</Label>
              <VoicePicker
                value={voiceId}
                onChange={setVoiceId}
                options={allVoices}
              />
              {voiceClones.length > 0 && (
                <div className="text-[11px] text-slate-400 mt-1 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  用「我的复刻音色」首次合成将自动激活变永久
                </div>
              )}
            </div>
            <div>
              <Label>语速 {speed.toFixed(2)}x</Label>
              <input type="range" min={0.5} max={2} step={0.05} value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-violet-600" />
            </div>
            <div>
              <Label>音量 {volume}（0=正常, 10=最大）</Label>
              <input type="range" min={0} max={10} step={1} value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                className="w-full accent-violet-600" />
            </div>
            <div>
              <Label>语调 {pitch}（0=原音色）</Label>
              <input type="range" min={-12} max={12} step={1} value={pitch}
                onChange={(e) => setPitch(parseInt(e.target.value))}
                className="w-full accent-violet-600" />
            </div>
            <div>
              <Label>情绪</Label>
              <Select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="w-full">
                {EMOTIONS.map((em) => <option key={em.id} value={em.id}>{em.label}</option>)}
              </Select>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">估算字符</span>
                <b className="text-slate-800">{estCredits}</b>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-slate-500">最高消费</span>
                <b className="text-violet-700">¥ {formatMoney(estCost)}</b>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                按 Vidu 实际返回的 credits × ¥{cnyPerCredit}/积分 结算（通常远低于上面估算）
              </div>
            </div>
            <Button onClick={submit} disabled={!text.trim() || submitting} loading={submitting} className="w-full" size="lg">
              <AudioLines className="w-4 h-4" />
              开始合成
            </Button>
          </div>
        </div>
      </Card>

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r) => (
            <Card key={r.rid} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-500 inline-flex items-center gap-2">
                    <AudioLines className="w-3.5 h-3.5 text-violet-500" />
                    {r.voiceLabel}
                    {r.credits !== undefined && <span>· {r.credits} 积分</span>}
                    {r.cost !== undefined && <span>· ¥ {formatMoney(r.cost, 4)}</span>}
                    {r.voiceActivated && <Badge color="green">音色已激活 · 永久</Badge>}
                    {r.error && <Badge color="rose" className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 失败</Badge>}
                  </div>
                  <div className="mt-1 text-sm line-clamp-2 max-w-3xl">{r.text}</div>
                </div>
              </div>
              {r.error && (
                <div className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">{r.error}</div>
              )}
              {r.fileUrl && (
                <div className="mt-3 flex items-center gap-3">
                  <audio controls src={r.fileUrl} preload="none" className="flex-1 h-10" />
                  <a
                    href={r.fileUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 px-2 h-9 rounded-lg border border-violet-200 hover:bg-violet-50"
                  >
                    <Download className="w-4 h-4" /> 下载
                  </a>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
