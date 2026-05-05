"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Badge, Select } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";
import { RefreshCw, RotateCcw, Undo2, XCircle } from "lucide-react";

type T = {
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
  created_at: string;
  updated_at: string;
  user_email: string;
  user_name: string | null;
  model_name: string | null;
  provider_logo: string | null;
  prompt: string;
};

const GROUP_COLORS: Record<string, "slate" | "brand" | "green" | "rose"> = {
  waiting: "slate", processing: "brand", completed: "green", failed: "rose",
};

export default function AdminTasksClient({ initial }: { initial: T[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks] = useState<T[]>(initial);
  const [group, setGroup] = useState<"all" | "waiting" | "processing" | "completed" | "failed">("all");
  const [type, setType] = useState<"all" | "image" | "video" | "audio" | "music">("all");
  const [q, setQ] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  function softRefresh() {
    startTransition(() => router.refresh());
  }

  useEffect(() => {
    const hasPending = tasks.some((t) => !t.is_final);
    if (pollRef.current) clearInterval(pollRef.current);
    if (!hasPending) return;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      startTransition(() => router.refresh());
    };
    pollRef.current = setInterval(tick, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tasks.map((t) => t.is_final).join(","), router]);

  const filtered = useMemo(() => tasks.filter((t) => {
    if (group !== "all" && t.group !== group) return false;
    if (type !== "all" && t.type !== type) return false;
    if (q) {
      const s = (t.prompt + " " + t.user_email + " " + t.model_name).toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [tasks, group, type, q]);

  const counts = useMemo(() => ({
    all: tasks.length,
    waiting: tasks.filter((t) => t.group === "waiting").length,
    processing: tasks.filter((t) => t.group === "processing").length,
    completed: tasks.filter((t) => t.group === "completed").length,
    failed: tasks.filter((t) => t.group === "failed").length,
  }), [tasks]);

  async function act(id: number, action: string, extra?: any) {
    const res = await fetch(`/api/admin/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "操作失败"); return; }
    softRefresh();
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">任务管理</h1>
          <p className="text-slate-500 mt-1 text-sm">所有用户的异步任务（图片 / 视频 / 音频 / 音乐）</p>
        </div>
        <Button variant="outline" onClick={softRefresh}>
          <RefreshCw className="w-4 h-4" /> 刷新
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {([
          { k: "all", label: "全部" },
          { k: "waiting", label: "等待中" },
          { k: "processing", label: "进行中" },
          { k: "completed", label: "已完成" },
          { k: "failed", label: "失败" },
        ] as const).map((t) => (
          <button key={t.k} onClick={() => setGroup(t.k as any)}
            className={`px-3 h-9 rounded-lg border text-sm ${group === t.k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 bg-white"}`}>
            {t.label} <span className="ml-1 text-xs text-slate-400">{(counts as any)[t.k]}</span>
          </button>
        ))}
        <Select value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="all">全部类型</option>
          <option value="image">图像</option>
          <option value="video">视频</option>
          <option value="audio">音频</option>
          <option value="music">音乐</option>
        </Select>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="按 prompt / 用户 / 模型 搜索"
          className="h-9 px-3 rounded-lg border border-slate-300 text-sm min-w-[220px]"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-slate-500">暂无符合条件的任务</Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-normal">#ID</th>
                  <th className="text-left px-4 py-3 font-normal">用户</th>
                  <th className="text-left px-4 py-3 font-normal">类型</th>
                  <th className="text-left px-4 py-3 font-normal">模型</th>
                  <th className="text-left px-4 py-3 font-normal">Prompt</th>
                  <th className="text-left px-4 py-3 font-normal">状态</th>
                  <th className="text-right px-4 py-3 font-normal">进度</th>
                  <th className="text-right px-4 py-3 font-normal">消费</th>
                  <th className="text-left px-4 py-3 font-normal">创建时间</th>
                  <th className="text-left px-4 py-3 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.task_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono">#{t.task_id}</td>
                    <td className="px-4 py-3">{t.user_name || t.user_email}</td>
                    <td className="px-4 py-3"><Badge>{t.type}</Badge></td>
                    <td className="px-4 py-3">{t.provider_logo} {t.model_name || "-"}</td>
                    <td className="px-4 py-3 max-w-xs text-slate-600 truncate" title={t.prompt}>{t.prompt}</td>
                    <td className="px-4 py-3">
                      <Badge color={GROUP_COLORS[t.group]}>{t.status_label}</Badge>
                      {t.refunded && <Badge color="amber" className="ml-1">已退款</Badge>}
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{t.status}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{t.progress}%</td>
                    <td className="px-4 py-3 text-right">¥ {formatMoney(t.cost, 4)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {t.is_final && (
                          <button onClick={() => act(t.task_id, "retry")} title="重新执行" className="p-1.5 rounded hover:bg-slate-100 text-slate-600">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        {t.group === "failed" && !t.refunded && (
                          <button onClick={() => act(t.task_id, "refund")} title="退款" className="p-1.5 rounded hover:bg-slate-100 text-amber-600">
                            <Undo2 className="w-4 h-4" />
                          </button>
                        )}
                        {!t.is_final && (
                          <button onClick={() => { if (confirm("取消该任务？")) act(t.task_id, "cancel"); }} title="取消" className="p-1.5 rounded hover:bg-slate-100 text-rose-600">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
