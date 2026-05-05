"use client";

import { useRef, useState } from "react";
import { Button, Card, Input, Label, Textarea, Badge, Spinner, EmptyState } from "@/components/ui";
import { Mic2, Trash2, AlertTriangle, Copy, Check, Link2, Upload, FileAudio2, Square, Disc3 } from "lucide-react";
import { formatMoney, relativeTime } from "@/lib/utils";

type ChannelOpt = { id: string; name: string; sellUnitPrice: number };
type Model = {
  id: string; slug: string; name: string; unitPrice: number; unit: string;
  channels: ChannelOpt[];
};
type Voice = {
  id: string;
  voiceId: string;
  name: string;
  audioSampleUrl: string | null;
  demoAudio: string | null;
  isActivated: boolean;
  cloneCost: number;
  expiresAt: string | null;
  createdAt: string;
};

export default function VoicesClient({
  models, voices: initialVoices,
}: { models: Model[]; voices: Voice[] }) {
  const model = models[0];
  const [channelId, setChannelId] = useState<string>(model?.channels?.[0]?.id || "");
  const [name, setName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [text, setText] = useState("你好，欢迎使用 vidu 开放平台。");
  const [promptAudioUrl, setPromptAudioUrl] = useState("");
  const [promptText, setPromptText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [voices, setVoices] = useState<Voice[]>(initialVoices);
  const [copied, setCopied] = useState<string | null>(null);
  // 上传本地音频相关状态
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 浏览器内录音相关状态
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<{
    mr: MediaRecorder;
    chunks: Blob[];
    stream: MediaStream;
    timer: ReturnType<typeof setInterval>;
  } | null>(null);

  const unitPrice = model?.channels.find((c) => c.id === channelId)?.sellUnitPrice ?? model?.unitPrice ?? 0;

  async function uploadAndFill(file: File) {
    setErr("");
    setUploadInfo("");
    if (!file) return;
    if (file.size === 0) {
      setErr("文件为空");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setErr("文件过大（>30MB），请压缩或裁剪后再试");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.absoluteUrl) {
        throw new Error(data?.error || `上传失败 (HTTP ${res.status})`);
      }
      if (data.isLocalhost) {
        setErr(
          "上传成功，但当前 URL 是本机地址，Vidu 拉不到。请先配置 COS 或 PUBLIC_BASE_URL，再重新上传。",
        );
        return;
      }
      setAudioUrl(data.absoluteUrl);
      const sizeMb = (file.size / 1024 / 1024).toFixed(2);
      setUploadInfo(`已上传：${file.name || "录音"} · ${sizeMb}MB · ${data.storage || "ok"}`);
      if (!name.trim()) {
        // 自动取文件名前缀作为展示名（去后缀 + 截断）
        const base = (file.name || "我的音色").replace(/\.[^.]+$/, "");
        setName(base.slice(0, 30));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    setErr("");
    setUploadInfo("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("此浏览器不支持麦克风录音，请改用上传文件");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: mime || "audio/webm" });
          const ext = (mime || "audio/webm").includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], `recording_${Date.now()}.${ext}`, { type: blob.type });
          await uploadAndFill(file);
        } finally {
          stream.getTracks().forEach((t) => t.stop());
        }
      };
      mr.start();
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const sec = Math.floor((Date.now() - startedAt) / 1000);
        setRecSeconds(sec);
        // 上限 5 分钟，自动停止
        if (sec >= 300) stopRecording();
      }, 250);
      recorderRef.current = { mr, chunks, stream, timer };
      setRecording(true);
      setRecSeconds(0);
    } catch (e) {
      setErr(`无法访问麦克风：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function stopRecording() {
    const cur = recorderRef.current;
    if (!cur) return;
    clearInterval(cur.timer);
    try { cur.mr.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
    setRecording(false);
  }

  async function submit() {
    if (!model) return;
    setErr("");
    if (!name.trim()) return setErr("请输入展示名");
    if (!audioUrl.trim()) return setErr("请输入原音频 URL");
    if (!/^https?:\/\//i.test(audioUrl)) return setErr("audio_url 必须是公网 http(s):// URL");

    setSubmitting(true);
    try {
      const res = await fetch("/api/voice-clones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          channelId: channelId || undefined,
          name: name.trim(),
          audioUrl: audioUrl.trim(),
          text: text.trim() || undefined,
          promptAudioUrl: promptAudioUrl.trim() || undefined,
          promptText: promptText.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `复刻失败 (HTTP ${res.status})`);
      const v: Voice = {
        id: data.id,
        voiceId: data.voiceId,
        name: data.name,
        audioSampleUrl: audioUrl.trim(),
        demoAudio: data.demoAudio || null,
        isActivated: false,
        cloneCost: data.cost || 0,
        expiresAt: data.expiresAt || null,
        createdAt: new Date().toISOString(),
      };
      setVoices((arr) => [v, ...arr]);
      setName("");
      setAudioUrl("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "复刻失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("删除该音色？删除后将无法在生成视频里再使用它。")) return;
    const res = await fetch(`/api/voice-clones/${id}`, { method: "DELETE" });
    if (res.ok) setVoices((arr) => arr.filter((v) => v.id !== id));
  }

  function copyVoiceId(voiceId: string) {
    navigator.clipboard?.writeText(voiceId).then(() => {
      setCopied(voiceId);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <Mic2 className="w-6 h-6 text-violet-500" />
          我的音色（声音复刻）
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          上传 10s~5min 的真人音频，同步返回自定义 voice_id，可在「解说剧成片」中作为角色音色使用 ·
          7 天内首次合成激活后永久保留。
        </p>
      </div>

      {!model ? (
        <Card className="p-8 text-center">
          <div className="text-slate-700 font-semibold">还没有可用的音色复刻模型</div>
          <div className="text-sm text-slate-500 mt-2">
            请联系管理员启用 <code className="px-1 bg-slate-100 rounded">vidu-audio-clone</code>。
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <Label>展示名（≤ 30 字）</Label>
                <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder="如：我的男声 / 张老师" />
              </div>
              <div>
                <Label>原音频（mp3 / m4a / wav，10s~5min，≤ 30MB）</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAndFill(f);
                      // 允许同名文件再次选中
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    loading={uploading}
                    disabled={uploading || recording}
                  >
                    <Upload className="w-3.5 h-3.5" /> 上传音频文件
                  </Button>
                  {!recording ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startRecording}
                      disabled={uploading}
                    >
                      <Disc3 className="w-3.5 h-3.5" /> 录音
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={stopRecording}
                    >
                      <Square className="w-3.5 h-3.5" /> 停止 · {recSeconds}s
                    </Button>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-2">
                  也可以直接粘贴公网音频 URL：
                </div>
                <div className="relative mt-1">
                  <Link2 className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                    placeholder="https://..."
                    className="pl-7"
                  />
                </div>
                {audioUrl && /^https?:\/\//i.test(audioUrl) && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <FileAudio2 className="w-3.5 h-3.5 shrink-0" />
                    <audio src={audioUrl} controls className="h-8 w-full" preload="none" />
                  </div>
                )}
                {uploadInfo && (
                  <div className="mt-1 text-[11px] text-emerald-700 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" /> {uploadInfo}
                  </div>
                )}
                <div className="text-[11px] text-slate-400 mt-1">
                  上传文件会自动放到对象存储并填好 URL；Vidu 会拉取该音频做音色复刻，请避免版权内容。
                </div>
              </div>
              <div>
                <Label>试听文本（≤ 1000 字，可选）</Label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 1000))}
                  className="min-h-[80px]"
                  placeholder="留空则不返回试听音频"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label>示例音频 URL（可选 · &lt; 8s · 提升相似度）</Label>
                <Input value={promptAudioUrl} onChange={(e) => setPromptAudioUrl(e.target.value)} placeholder="https://... .mp3" />
              </div>
              <div>
                <Label>示例音频对应文本（可选 · 与音频内容一致）</Label>
                <Input value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="句末请加标点" />
              </div>
              {model.channels.length > 1 && (
                <div>
                  <Label>渠道</Label>
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    className="h-10 px-3 pr-8 rounded-lg border border-slate-300 bg-white text-sm w-full"
                  >
                    {model.channels.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} · ¥{c.sellUnitPrice}/次</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">本次复刻消费</span>
                  <b className="text-violet-700">¥ {formatMoney(unitPrice)}</b>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  同步接口 · 失败不扣费 · 7 天内未在合成中激活将自动销毁
                </div>
              </div>
              <Button onClick={submit} disabled={submitting} loading={submitting} className="w-full" size="lg">
                <Mic2 className="w-4 h-4" />
                开始复刻
              </Button>
              {err && (
                <div className="text-xs text-rose-600 inline-flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> <span>{err}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">已有音色（{voices.length}）</h2>
        {voices.length === 0 ? (
          <Card className="p-2">
            <EmptyState
              icon={<Mic2 className="w-5 h-5" />}
              title="还没有复刻过音色"
              desc="完成第一次复刻后，这里会列出所有 voice_id，可在解说剧成片里作为角色音色使用。"
            />
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {voices.map((v) => (
              <Card key={v.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800 truncate">{v.name}</div>
                    <button
                      onClick={() => copyVoiceId(v.voiceId)}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-violet-700 group max-w-full"
                      title="点击复制 voice_id"
                    >
                      <code className="px-1.5 py-0.5 rounded bg-slate-100 group-hover:bg-violet-50 truncate max-w-[260px]">
                        {v.voiceId}
                      </code>
                      {copied === v.voiceId
                        ? <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                        : <Copy className="w-3 h-3 shrink-0" />}
                    </button>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {v.isActivated
                        ? <Badge color="green">已激活 · 永久</Badge>
                        : <Badge color="amber">7 天保留 · 待激活</Badge>}
                      <span className="text-[11px] text-slate-400">
                        {relativeTime(v.createdAt)} · ¥ {formatMoney(v.cloneCost)}
                      </span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(v.id)} className="!h-8 !px-2 text-slate-400 hover:text-rose-600">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {v.demoAudio && (
                  <div className="mt-3">
                    <audio src={v.demoAudio} controls className="w-full h-9" preload="none" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
