"use client";
import { useState } from "react";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui";
import { BadgeDollarSign, Save, Percent, AlertTriangle, TrendingUp } from "lucide-react";

type Props = {
  initial: {
    minProfitRateChat: number;
    minProfitRateImage: number;
    minProfitRateVideo: number;
    channelCount: number;
    pendingReviewCount: number;
  };
};

export default function PricingClient({ initial }: Props) {
  const [chat, setChat] = useState(initial.minProfitRateChat);
  const [image, setImage] = useState(initial.minProfitRateImage);
  const [video, setVideo] = useState(initial.minProfitRateVideo);
  const [savingRates, setSavingRates] = useState(false);
  const [rateMsg, setRateMsg] = useState("");

  const [markup, setMarkup] = useState(0.3);
  const [scope, setScope] = useState<"all" | "chat" | "image" | "video">("all");
  const [batching, setBatching] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");

  async function saveRates() {
    setSavingRates(true); setRateMsg("");
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minProfitRateChat: chat,
          minProfitRateImage: image,
          minProfitRateVideo: video,
        }),
      });
      const data = await res.json();
      if (!res.ok) setRateMsg(data.error || "保存失败");
      else setRateMsg("已保存");
    } finally { setSavingRates(false); }
  }

  async function batchAdjust() {
    const confirmMsg = `将按成本 × ${(1 + markup).toFixed(2)} 覆盖 "${scope === "all" ? "全部" : scope}" 范围内所有渠道的售价。该操作不可撤销。确定？`;
    if (!confirm(confirmMsg)) return;
    setBatching(true); setBatchMsg("");
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markup, scope }),
      });
      const data = await res.json();
      if (!res.ok) setBatchMsg(data.error || "批量调价失败");
      else setBatchMsg(`已更新 ${data.updated} 条渠道`);
    } finally { setBatching(false); }
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BadgeDollarSign className="w-6 h-6 text-brand-600" /> 定价策略
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          设置各模态的最低利润率（保存渠道时会强制校验），以及批量调价工具。
        </p>
      </div>

      {initial.pendingReviewCount > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50 text-amber-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            有 <strong>{initial.pendingReviewCount}</strong> 条渠道标记为"成本待核对"（迁移生成时默认取售价 × 0.5 作为成本占位）。
            请尽快到 <a href="/admin/models" className="underline">模型 &amp; 渠道</a> 页核对实际上游成本，否则利润报表会失真。
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <div className="font-semibold flex items-center gap-2">
          <Percent className="w-5 h-5 text-brand-600" /> 最低利润率
        </div>
        <div className="text-xs text-slate-500 -mt-2">
          约束：<code>售价 &ge; 成本 × (1 + 利润率)</code>。管理员在模型 &amp; 渠道页保存/修改渠道时，后端会按此标准校验；不达标的渠道会被拒绝保存。
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>对话 Chat</Label>
            <div className="flex items-center gap-1">
              <Input type="number" step="0.01" value={chat} onChange={(e) => setChat(parseFloat(e.target.value) || 0)} />
              <span className="text-slate-500 text-sm">× 100%</span>
            </div>
          </div>
          <div>
            <Label>图像 Image</Label>
            <div className="flex items-center gap-1">
              <Input type="number" step="0.01" value={image} onChange={(e) => setImage(parseFloat(e.target.value) || 0)} />
              <span className="text-slate-500 text-sm">× 100%</span>
            </div>
          </div>
          <div>
            <Label>视频 Video</Label>
            <div className="flex items-center gap-1">
              <Input type="number" step="0.01" value={video} onChange={(e) => setVideo(parseFloat(e.target.value) || 0)} />
              <span className="text-slate-500 text-sm">× 100%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={saveRates} disabled={savingRates}>
            {savingRates ? <Spinner /> : <Save className="w-4 h-4" />} 保存
          </Button>
          {rateMsg && <span className="text-sm text-emerald-600">{rateMsg}</span>}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-600" /> 批量调价（按成本倍率）
        </div>
        <div className="text-xs text-slate-500 -mt-2">
          按 <code>售价 = 成本 × (1 + 倍率)</code> 一次性覆盖所选范围内全部渠道售价。⚠️ 不可撤销，建议只在换算上游成本后使用。
          当前数据库共 <strong>{initial.channelCount}</strong> 条渠道。
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>倍率（如 0.3 = 加价 30%）</Label>
            <Input type="number" step="0.01" min="0" value={markup} onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)} />
            <div className="text-[11px] text-slate-400 mt-1">预览：售价 = 成本 × {(1 + markup).toFixed(2)}</div>
          </div>
          <div>
            <Label>作用范围</Label>
            <Select value={scope} onChange={(e) => setScope(e.target.value as any)}>
              <option value="all">全部</option>
              <option value="chat">仅 chat</option>
              <option value="image">仅 image</option>
              <option value="video">仅 video</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={batchAdjust} disabled={batching} variant="danger" className="w-full">
              {batching ? <Spinner /> : <TrendingUp className="w-4 h-4" />} 应用到所有选定渠道
            </Button>
          </div>
        </div>
        {batchMsg && <div className="text-sm text-emerald-600">{batchMsg}</div>}
      </Card>
    </div>
  );
}
