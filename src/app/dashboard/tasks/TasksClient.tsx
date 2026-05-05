"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Select, Textarea, Badge, Spinner, Label, EmptyState } from "@/components/ui";
import { SafeImage, SafeVideo } from "@/components/media/SafeMedia";
import { Rocket, RefreshCw, ListChecks, Download } from "lucide-react";
import { formatMoney, relativeTime } from "@/lib/utils";
import { GROUP_LABEL } from "@/lib/task-status";

type ChannelOpt = { id: string; name: string; tier: string; sellUnitPrice: number };
type Model = { id: string; slug: string; name: string; type: string; provider: string; logo: string; unitPrice: number; unit: string | null; channels: ChannelOpt[] };

type Task = {
  task_id: number;
  type: string;
  status: string;
  status_label: string;
  fenzu: string;
  group: "waiting" | "processing" | "completed" | "failed";
  is_final: boolean;
  progress: number;
  result: { urls: string[] } | null;
  error: string | null;
  cost: number;
  refunded: boolean;
  model_name?: string | null;
  provider_logo?: string | null;
  prompt?: string;
  created_at: string;
  updated_at: string;
};

const GROUP_COLORS: Record<string, "slate" | "brand" | "green" | "rose"> = {
  waiting: "slate", processing: "brand", completed: "green", failed: "rose",
};

export default function TasksClient({ models }: { models: Model[] }) {
  const [type, setType] = useState<"image" | "video">("image");
  const initialImageModel = models.find((m) => m.type === "image");
  const [modelId, setModelId] = useState(initialImageModel?.id || "");
  const [channelId, setChannelId] = useState<string>(initialImageModel?.channels?.[0]?.id || "");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [size, setSize] = useState("1024x1024");
  const [n, setN] = useState(1);
  const [aspect, setAspect] = useState("16:9");
  const [submitting, setSubmitting] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState("");

  const filtered = models.filter((m) => m.type === type);
  const currentModel = models.find((m) => m.id === modelId) || filtered[0];
  const currentChannel = currentModel?.channels.find((c) => c.id === channelId) || currentModel?.channels[0];
  const effectiveUnitPrice = currentChannel ? currentChannel.sellUnitPrice : currentModel?.unitPrice ?? 0;
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  function onModelChange(id: string) {
    setModelId(id);
    const m = models.find((x) => x.id === id);
    setChannelId(m?.channels?.[0]?.id || "");
  }

  async function refresh() {
    const res = await fetch("/api/go/v2/tasks?limit=60");
    if (res.ok) { const data = await res.json(); setTasks(data.items); }
  }

  useEffect(() => { refresh(); }, []);

  // 只有非终态任务 + 页面可见时才轮询；后台标签页彻底停掉
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const hasPending = tasks.some((t) => !t.is_final);
    if (!hasPending) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      refresh();
    };
    pollingRef.current = setInterval(tick, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [tasks.map((t) => t.is_final).join(",")]);

  // 当切换类型时重选默认模型
  useEffect(() => {
    const first = models.find((m) => m.type === type);
    if (first) {
      setModelId(first.id);
      setChannelId(first.channels[0]?.id || "");
    }
  }, [type, models]);

  const estimateCost = (() => {
    if (!currentModel) return 0;
    if (type === "image") return effectiveUnitPrice * n;
    return effectiveUnitPrice * duration;
  })();

  async function submit() {
    if (!prompt.trim() || !currentModel || submitting) return;
    setSubmitting(true); setErr("");
    try {
      const res = await fetch("/api/go/v2/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, model: currentModel.slug, channelId: channelId || undefined,
          prompt: prompt.trim(),
          size, n, duration, aspect_ratio: aspect,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "提交失败"); return; }
      setPrompt("");
      await refresh();
    } finally { setSubmitting(false); }
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">异步任务中心</h1>
        <p className="text-slate-500 mt-1 text-sm">
          提交图片 / 视频生成任务后可离开页面，任务继续运行；失败会自动退款。也可通过
          <code className="px-1 bg-slate-100 rounded text-xs mx-1">GET /v1/media/status?id=xxx</code>
          或 <code className="px-1 bg-slate-100 rounded text-xs">GET /v1/skills/task-status?id=xxx</code> 外部查询。
        </p>
      </div>

      <Card className="p-6">
        <div className="font-semibold mb-4 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-brand-600" /> 提交新任务
        </div>
        <div className="grid md:grid-cols-[1fr_280px] gap-6">
          <div className="space-y-4">
            <div className="flex gap-2">
              {[
                { k: "image", label: "图像" },
                { k: "video", label: "视频" },
              ].map((t) => (
                <button key={t.k} onClick={() => setType(t.k as any)}
                  className={`px-4 h-9 rounded-lg border text-sm ${type === t.k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 bg-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div>
              <Label>Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={type === "image"
                  ? "例：一只戴着墨镜的柴犬，冲浪板上，热带海滩，卡通风格"
                  : "例：太空中的宇航员向地球挥手，星云背景，电影质感"}
                className="min-h-[120px]"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label>模型</Label>
              <Select value={modelId} onChange={(e) => onModelChange(e.target.value)} className="w-full">
                {filtered.map((m) => <option key={m.id} value={m.id}>{m.logo} {m.name}</option>)}
              </Select>
              {currentModel && <div className="mt-1 text-xs text-slate-500">¥ {effectiveUnitPrice} / {currentModel.unit === "second" ? "秒" : "张"}</div>}
            </div>
            {currentModel && currentModel.channels.length > 0 && (
              <div>
                <Label>渠道档位</Label>
                <Select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full">
                  {currentModel.channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · ¥{c.sellUnitPrice}</option>
                  ))}
                </Select>
              </div>
            )}
            {type === "image" ? (
              <>
                <div>
                  <Label>尺寸</Label>
                  <Select value={size} onChange={(e) => setSize(e.target.value)} className="w-full">
                    {["1024x1024", "1024x1792", "1792x1024", "512x512"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>数量</Label>
                  <Select value={n} onChange={(e) => setN(parseInt(e.target.value))} className="w-full">
                    {[1, 2, 3, 4].map((i) => <option key={i} value={i}>{i} 张</option>)}
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>时长（秒）</Label>
                  <Select value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} className="w-full">
                    {[3, 5, 8, 10, 15].map((d) => <option key={d} value={d}>{d}s</option>)}
                  </Select>
                </div>
                <div>
                  <Label>画幅</Label>
                  <Select value={aspect} onChange={(e) => setAspect(e.target.value)} className="w-full">
                    <option value="16:9">横屏 16:9</option>
                    <option value="9:16">竖屏 9:16</option>
                    <option value="1:1">方形 1:1</option>
                  </Select>
                </div>
              </>
            )}
            <div className="text-sm text-slate-600">
              预计消费：<span className="font-semibold">¥ {formatMoney(estimateCost)}</span>
            </div>
            <Button onClick={submit} disabled={submitting || !prompt.trim()} className="w-full" size="lg">
              {submitting ? <Spinner /> : <Rocket className="w-4 h-4" />} 提交任务
            </Button>
            {err && <div className="text-sm text-rose-600">{err}</div>}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-brand-600" /> 我的任务
          </div>
          <Button size="sm" variant="outline" onClick={refresh}><RefreshCw className="w-4 h-4" /> 刷新</Button>
        </div>
        {tasks.length === 0 ? (
          <EmptyState icon={<Rocket className="w-6 h-6" />} title="还没有任务" desc="在上面提交一个试试" />
        ) : (
          <div className="space-y-3">
            {tasks.map((t) => (
              <TaskRow key={t.task_id} task={t} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const color = GROUP_COLORS[task.group];
  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Badge color="brand">#{task.task_id}</Badge>
          <Badge>{task.type}</Badge>
          {task.model_name && (
            <span className="text-xs text-slate-500">{task.provider_logo} {task.model_name}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge color={color}>
            {task.status_label}
            <span className="ml-1 opacity-70">· {task.status}</span>
          </Badge>
          {task.is_final && task.refunded && <Badge color="amber">已退款</Badge>}
          <span className="text-slate-400">{relativeTime(task.created_at)}</span>
        </div>
      </div>

      {task.prompt && (
        <div className="mt-2 text-xs text-slate-600 line-clamp-2">{task.prompt}</div>
      )}

      {!task.is_final && (
        <div className="mt-3">
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all duration-500"
              style={{ width: `${task.progress}%` }} />
          </div>
          <div className="mt-1 text-xs text-slate-400 flex justify-between">
            <span>{GROUP_LABEL[task.group]} · {task.progress}%</span>
            <span className="font-mono">{task.status}</span>
          </div>
        </div>
      )}

      {task.group === "failed" && task.error && (
        <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
          失败原因：{task.error}
        </div>
      )}

      {task.result && task.result.urls.length > 0 && (
        <div className="mt-3">
          {task.type === "image" ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {task.result.urls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-slate-100 relative group">
                  <SafeImage src={u} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center text-white transition">
                    <Download className="w-5 h-5" />
                  </div>
                </a>
              ))}
            </div>
          ) : task.type === "video" ? (
            <SafeVideo src={task.result.urls[0]} controls className="w-full max-w-2xl rounded-lg bg-black" />
          ) : (
            <audio src={task.result.urls[0]} controls className="w-full max-w-xl" />
          )}
        </div>
      )}

      <div className="mt-2 text-xs text-slate-400 flex justify-between">
        <span>消费 ¥ {formatMoney(task.cost, 4)}</span>
        <span>更新 {relativeTime(task.updated_at)}</span>
      </div>
    </div>
  );
}
