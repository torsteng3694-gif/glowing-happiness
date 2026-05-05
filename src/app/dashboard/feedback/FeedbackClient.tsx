"use client";
import { useState } from "react";
import { Button, Card, Input, Label, Select, Textarea, Badge, EmptyState } from "@/components/ui";
import { MessageCircleQuestion, Send, CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatDate, relativeTime } from "@/lib/utils";
import { FEEDBACK_TYPES, typeLabel, statusLabel, statusColor } from "@/lib/feedback";

type FB = {
  id: number; type: string; endpoint: string | null; question: string;
  status: string; resolution: string | null;
  createdAt: string; updatedAt: string;
};

const ENDPOINT_OPTIONS = [
  "", "/v1/chat/completions", "/v1/images/generations", "/v1/videos/generations",
  "/v1/models", "/v1/skills/feedback", "控制台（对话/图像/视频）", "其他",
];

export default function FeedbackClient({ initial }: { initial: FB[] }) {
  const [list, setList] = useState<FB[]>(initial);
  const [type, setType] = useState<string>("bug");
  const [endpoint, setEndpoint] = useState<string>("/v1/chat/completions");
  const [question, setQuestion] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState<number | null>(null);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || submitting) return;
    setSubmitting(true); setErr(""); setOk(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, endpoint: endpoint || null, question: question.trim(), contact: contact.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "提交失败"); return; }
      setOk(data.id);
      setQuestion(""); setContact("");
      await refresh();
    } finally { setSubmitting(false); }
  }

  async function refresh() {
    const res = await fetch("/api/feedback");
    if (res.ok) { const data = await res.json(); setList(data.items); }
  }

  const stats = {
    pending: list.filter((f) => f.status === "pending").length,
    resolved: list.filter((f) => f.status === "resolved").length,
    ignored: list.filter((f) => f.status === "ignored").length,
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">反馈中心</h1>
        <p className="text-slate-500 mt-1 text-sm">
          遇到问题或有建议？提交给我们，处理结果会在这里展示。也可通过 API <code className="px-1 bg-slate-100 rounded text-xs">GET /v1/skills/feedback?id=xxx</code> 查询。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Clock className="w-4 h-4" /> 未处理</div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{stats.pending}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><CheckCircle2 className="w-4 h-4" /> 已处理</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{stats.resolved}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><XCircle className="w-4 h-4" /> 已忽略</div>
          <div className="mt-2 text-2xl font-bold text-slate-500">{stats.ignored}</div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="font-semibold mb-4 flex items-center gap-2">
          <MessageCircleQuestion className="w-5 h-5 text-brand-600" /> 提交新反馈
        </div>
        <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>问题类型</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-full">
              {FEEDBACK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
          <div>
            <Label>涉及接口 / 模型</Label>
            <Select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="w-full">
              {ENDPOINT_OPTIONS.map((e) => <option key={e} value={e}>{e || "（不涉及）"}</option>)}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>问题描述 <span className="text-rose-500">*</span></Label>
            <Textarea
              value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder="请详细描述：触发步骤、期望结果、实际结果。如果是接口报错，建议贴上请求 body 与错误信息。"
              className="min-h-[140px]"
              maxLength={5000}
            />
            <div className="mt-1 text-xs text-slate-400 text-right">{question.length} / 5000</div>
          </div>
          <div className="md:col-span-2">
            <Label>联系方式（选填）</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="邮箱 / QQ / Telegram，方便我们追加沟通" />
          </div>
          {err && <div className="md:col-span-2 text-sm text-rose-600">{err}</div>}
          {ok !== null && (
            <div className="md:col-span-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              ✅ 提交成功！反馈 ID：<span className="font-mono font-bold">{ok}</span>。可通过下方列表查看进度。
            </div>
          )}
          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting || !question.trim()} size="lg">
              <Send className="w-4 h-4" /> {submitting ? "提交中..." : "提交反馈"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <div className="font-semibold mb-4">我的反馈记录</div>
        {list.length === 0 ? (
          <EmptyState icon={<MessageCircleQuestion className="w-6 h-6" />} title="还没有反馈记录" desc="遇到问题随时来提交" />
        ) : (
          <div className="space-y-3">
            {list.map((f) => (
              <div key={f.id} className="border border-slate-200 rounded-xl p-4 hover:border-brand-300 transition">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge color="brand">#{f.id}</Badge>
                    <Badge>{typeLabel(f.type)}</Badge>
                    {f.endpoint && <span className="text-xs font-mono text-slate-500">{f.endpoint}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge color={statusColor(f.status)}>{statusLabel(f.status)}</Badge>
                    <span className="text-slate-400">{relativeTime(f.createdAt)}</span>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{f.question}</div>
                {f.resolution && (
                  <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
                    <div className="text-xs text-emerald-700 font-semibold mb-1">平台处理说明</div>
                    <div className="text-emerald-900 whitespace-pre-wrap">{f.resolution}</div>
                    <div className="mt-2 text-xs text-emerald-600">更新于 {formatDate(f.updatedAt)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
