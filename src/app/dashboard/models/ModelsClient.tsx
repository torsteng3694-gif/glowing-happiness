"use client";
import { useMemo, useState } from "react";
import { Card, Badge, Input, Select } from "@/components/ui";
import { Search, Layers } from "lucide-react";

export type ChannelOption = {
  id: string;
  name: string;
  tier: string;
  priority: number;
  inputPrice: number;
  outputPrice: number;
  unitPrice: number;
};

export type M = {
  id: string; slug: string; name: string;
  type: "chat" | "image" | "video";
  description: string; provider: string; providerSlug: string; logo: string;
  contextLength: number | null;
  inputPrice: number; outputPrice: number; unitPrice: number; unit: string | null;
  tags: string[];
  channels: ChannelOption[];
  isChat: boolean;
};

const TIER_COLORS: Record<string, "brand" | "violet" | "amber" | "green" | "slate"> = {
  premium: "violet",
  standard: "brand",
  economy: "slate",
  custom: "amber",
};

export default function ModelsClient({ models }: { models: M[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "chat" | "image" | "video">("all");
  const [providerSlug, setProviderSlug] = useState<string>("all");

  const providers = useMemo(() => {
    const s = new Map<string, string>();
    models.forEach((m) => s.set(m.providerSlug, m.provider));
    return Array.from(s.entries());
  }, [models]);

  const filtered = models.filter((m) => {
    if (type !== "all" && m.type !== type) return false;
    if (providerSlug !== "all" && m.providerSlug !== providerSlug) return false;
    if (q && !(m.name.toLowerCase().includes(q.toLowerCase()) || m.description.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">模型市场</h1>
        <p className="text-slate-500 mt-1 text-sm">
          当前已聚合 {models.length} 款模型，每款模型提供多档位渠道，调用时可在生成页选择具体档位
        </p>
      </div>

      <Card className="p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索模型名称或描述" className="pl-9" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="all">全部类型</option>
          <option value="chat">对话</option>
          <option value="image">图像</option>
          <option value="video">视频</option>
        </Select>
        <Select value={providerSlug} onChange={(e) => setProviderSlug(e.target.value)}>
          <option value="all">全部厂商</option>
          {providers.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </Select>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <Card key={m.id} className="p-5 hover:shadow-md transition flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-xl">{m.logo}</div>
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-xs text-slate-500">{m.provider}</div>
                </div>
              </div>
              <Badge color={m.type === "chat" ? "brand" : m.type === "image" ? "violet" : "amber"}>
                {m.type === "chat" ? "对话" : m.type === "image" ? "图像" : "视频"}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-slate-600 min-h-[40px] line-clamp-2">{m.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {m.tags.map((t) => <Badge key={t} color="green">{t}</Badge>)}
              {m.contextLength && <Badge>上下文 {Math.round(m.contextLength / 1000)}K</Badge>}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex-1">
              {m.channels.length === 0 ? (
                <div className="text-xs text-slate-400">
                  暂无可用渠道，使用默认价 ¥ {m.isChat ? `${m.inputPrice}/${m.outputPrice}` : m.unitPrice}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                    <Layers className="w-3 h-3" /> {m.channels.length} 档价格
                  </div>
                  {m.channels.slice(0, 4).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <Badge color={TIER_COLORS[c.tier] || "slate"}>{c.name}</Badge>
                      </div>
                      <div className="font-mono text-slate-700">
                        {m.isChat
                          ? <>¥ {c.inputPrice}/{c.outputPrice} <span className="text-slate-400">/ 1K tok</span></>
                          : <>¥ {c.unitPrice} <span className="text-slate-400">/ {m.unit === "second" ? "秒" : "张"}</span></>}
                      </div>
                    </div>
                  ))}
                  {m.channels.length > 4 && (
                    <div className="text-xs text-slate-400 text-center">+{m.channels.length - 4} 档</div>
                  )}
                </div>
              )}
              <div className="mt-3 text-xs text-slate-400 font-mono">{m.slug}</div>
            </div>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="p-10 text-center text-slate-500">没有找到匹配的模型</Card>
      )}
    </div>
  );
}
