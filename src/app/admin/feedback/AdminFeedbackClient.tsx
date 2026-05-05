"use client";
import { useState } from "react";
import { Button, Card, Badge, Textarea, Select } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { typeLabel, statusLabel, statusColor } from "@/lib/feedback";

type FB = {
  id: number; type: string; endpoint: string | null; question: string;
  contact: string | null;
  status: string; resolution: string | null;
  userEmail: string; userName: string | null;
  createdAt: string; updatedAt: string;
};

export default function AdminFeedbackClient({ initial }: { initial: FB[] }) {
  const [list, setList] = useState<FB[]>(initial);
  const [filter, setFilter] = useState<"all" | "pending" | "resolved" | "ignored">("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<"resolved" | "ignored">("resolved");
  const [draftResolution, setDraftResolution] = useState("");
  const [saving, setSaving] = useState(false);

  const visible = list.filter((f) => filter === "all" || f.status === filter);

  function startEdit(f: FB) {
    setEditing(f.id);
    setDraftStatus(f.status === "ignored" ? "ignored" : "resolved");
    setDraftResolution(f.resolution || "");
  }
  function cancel() { setEditing(null); setDraftResolution(""); }

  async function save(id: number) {
    if (draftStatus === "resolved" && !draftResolution.trim()) {
      alert("处理说明不能为空"); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: draftStatus, resolution: draftResolution.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "保存失败"); return; }
      setList((l) => l.map((f) => f.id === id ? {
        ...f,
        status: data.feedback.status,
        resolution: data.feedback.resolution,
        updatedAt: data.feedback.updatedAt,
      } : f));
      setEditing(null); setDraftResolution("");
    } finally { setSaving(false); }
  }

  async function reopen(id: number) {
    if (!confirm("重新打开这条反馈？")) return;
    const res = await fetch(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "失败"); return; }
    setList((l) => l.map((f) => f.id === id ? {
      ...f, status: "pending", resolution: null, updatedAt: data.feedback.updatedAt,
    } : f));
  }

  const counts = {
    all: list.length,
    pending: list.filter((f) => f.status === "pending").length,
    resolved: list.filter((f) => f.status === "resolved").length,
    ignored: list.filter((f) => f.status === "ignored").length,
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">反馈处理</h1>
        <p className="text-slate-500 mt-1 text-sm">处理用户提交的问题反馈，填写处理说明后用户可立即查看</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {([
          { k: "all", label: "全部", color: "slate" },
          { k: "pending", label: "未处理", color: "amber" },
          { k: "resolved", label: "已处理", color: "green" },
          { k: "ignored", label: "已忽略", color: "slate" },
        ] as const).map((t) => (
          <button key={t.k} onClick={() => setFilter(t.k as any)}
            className={`px-4 h-9 rounded-lg border text-sm transition ${
              filter === t.k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 bg-white hover:bg-slate-50"
            }`}>
            {t.label} <span className="ml-1 text-xs text-slate-400">{counts[t.k]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="p-10 text-center text-slate-500">没有匹配的反馈</Card>
      ) : (
        <div className="space-y-3">
          {visible.map((f) => (
            <Card key={f.id} className="p-5">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge color="brand">#{f.id}</Badge>
                  <Badge>{typeLabel(f.type)}</Badge>
                  {f.endpoint && <span className="text-xs font-mono text-slate-500">{f.endpoint}</span>}
                  <span className="text-xs text-slate-500">来自 {f.userName || f.userEmail}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge color={statusColor(f.status)}>{statusLabel(f.status)}</Badge>
                  <span className="text-slate-400">{formatDate(f.createdAt)}</span>
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{f.question}</div>
              {f.contact && (
                <div className="mt-2 text-xs text-slate-500">联系方式：<span className="font-mono">{f.contact}</span></div>
              )}

              {editing === f.id ? (
                <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                  <div>
                    <label className="text-xs text-slate-600">处理状态</label>
                    <Select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as any)} className="mt-1 w-full">
                      <option value="resolved">已处理</option>
                      <option value="ignored">已忽略</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">处理说明 {draftStatus === "resolved" && <span className="text-rose-500">*</span>}</label>
                    <Textarea
                      value={draftResolution}
                      onChange={(e) => setDraftResolution(e.target.value)}
                      placeholder="例：经排查非代码 Bug，图片已正确传递至模型。"
                      className="mt-1 min-h-[80px]"
                      maxLength={5000}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => save(f.id)} disabled={saving}>
                      {saving ? "保存中..." : "保存"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancel}>取消</Button>
                  </div>
                </div>
              ) : (
                <>
                  {f.resolution && (
                    <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
                      <div className="text-xs text-emerald-700 font-semibold mb-1">处理说明</div>
                      <div className="text-emerald-900 whitespace-pre-wrap">{f.resolution}</div>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    {f.status === "pending" ? (
                      <Button size="sm" onClick={() => startEdit(f)}>开始处理</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEdit(f)}>修改</Button>
                        <Button size="sm" variant="ghost" onClick={() => reopen(f.id)}>重新打开</Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
