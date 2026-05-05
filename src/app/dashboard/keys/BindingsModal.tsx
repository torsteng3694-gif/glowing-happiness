"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Input, Badge, Spinner } from "@/components/ui";
import {
  X, Search, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, Zap,
} from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";

type ChannelNode = {
  id: string;
  name: string;
  tier: string;
  priority: number;
  sellInputPrice: number;
  sellOutputPrice: number;
  sellUnitPrice: number;
  upstream: { id: string; slug: string; name: string };
};

type ModelNode = {
  id: string;
  slug: string;
  name: string;
  type: "chat" | "image" | "video" | "audio";
  provider: { slug: string; name: string; logo: string | null };
  channels: ChannelNode[];
};

type Binding = {
  channelId: string;
  order: number;
  channel: ChannelNode & { model: { id: string; slug: string; name: string; type: string } };
};

type HealthMap = Record<string, { totalCalls: number; successRate: number; avgLatencyMs: number | null; online: boolean }>;

type Props = {
  apiKeyId: string;
  apiKeyName: string;
  onClose: () => void;
  onSaved?: () => void;
};

const TYPE_TABS: { value: ModelNode["type"] | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "chat", label: "聊天" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
];

const TIER_COLOR: Record<string, "brand" | "green" | "amber" | "violet" | "slate"> = {
  premium: "violet", standard: "brand", economy: "green", custom: "amber",
};

export default function BindingsModal({ apiKeyId, apiKeyName, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [scopeMode, setScopeMode] = useState<"open" | "restricted">("open");
  const [models, setModels] = useState<ModelNode[]>([]);
  const [health, setHealth] = useState<HealthMap>({});

  // selection: Map<channelId, order>（order 按加入顺序递增；保存时重算）
  const [selected, setSelected] = useState<string[]>([]); // 保持插入顺序

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ModelNode["type"] | "all">("all");
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  // 初次加载数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr("");
      try {
        const [treeRes, healthRes, bindingsRes] = await Promise.all([
          fetch("/api/dashboard/channels/tree").then((r) => r.json()),
          fetch("/api/dashboard/channels/health").then((r) => r.json()),
          fetch(`/api/go/v2/keys/${apiKeyId}/bindings`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const ms: ModelNode[] = treeRes.models || [];
        setModels(ms);
        setHealth(healthRes.health || {});
        setScopeMode(bindingsRes.scopeMode || "open");
        const existing: Binding[] = bindingsRes.bindings || [];
        setSelected(existing.map((b) => b.channelId));
        setActiveModelId(ms[0]?.id ?? null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally { setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [apiKeyId]);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q);
    });
  }, [models, search, typeFilter]);

  const activeModel = useMemo(
    () => models.find((m) => m.id === activeModelId) ?? null,
    [models, activeModelId],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // right panel: group selected channels by model (preserve user order within model)
  const selectedByModel = useMemo(() => {
    const channelIndex = new Map<string, ChannelNode & { modelId: string; modelName: string; modelType: string }>();
    for (const m of models) {
      for (const c of m.channels) {
        channelIndex.set(c.id, { ...c, modelId: m.id, modelName: m.name, modelType: m.type });
      }
    }
    const groups = new Map<string, { modelId: string; modelName: string; modelType: string; channels: (ChannelNode & { modelId: string })[] }>();
    selected.forEach((id) => {
      const ch = channelIndex.get(id);
      if (!ch) return; // 找不到（channel 已删除）
      let g = groups.get(ch.modelId);
      if (!g) {
        g = { modelId: ch.modelId, modelName: ch.modelName, modelType: ch.modelType, channels: [] };
        groups.set(ch.modelId, g);
      }
      g.channels.push(ch);
    });
    return Array.from(groups.values());
  }, [selected, models]);

  const totalModels = selectedByModel.length;
  const totalChannels = selected.length;

  function toggleChannel(channelId: string) {
    setSelected((prev) => prev.includes(channelId) ? prev.filter((x) => x !== channelId) : [...prev, channelId]);
  }

  function removeChannel(channelId: string) {
    setSelected((prev) => prev.filter((x) => x !== channelId));
  }

  function moveChannel(modelId: string, channelId: string, dir: -1 | 1) {
    setSelected((prev) => {
      const list = [...prev];
      // 只在同模型内交换
      const modelChannels = models.find((m) => m.id === modelId)?.channels.map((c) => c.id) ?? [];
      const withinModel = list.filter((id) => modelChannels.includes(id));
      const idx = withinModel.indexOf(channelId);
      const target = idx + dir;
      if (target < 0 || target >= withinModel.length) return prev;
      // swap in withinModel, then merge back preserving other models' relative order
      [withinModel[idx], withinModel[target]] = [withinModel[target], withinModel[idx]];
      // rebuild list: keep non-model-channels in place, replace model-channels sequentially
      const out: string[] = [];
      let i = 0;
      for (const id of list) {
        if (modelChannels.includes(id)) {
          out.push(withinModel[i++]);
        } else {
          out.push(id);
        }
      }
      return out;
    });
  }

  function clearCurrentModel() {
    if (!activeModel) return;
    const ids = new Set(activeModel.channels.map((c) => c.id));
    setSelected((prev) => prev.filter((x) => !ids.has(x)));
  }

  function selectAllHealthy() {
    if (!activeModel) return;
    const toAdd = activeModel.channels
      .filter((c) => health[c.id]?.online !== false && (health[c.id]?.successRate ?? 1) >= 0.5)
      .map((c) => c.id);
    setSelected((prev) => {
      const set = new Set(prev);
      const added = toAdd.filter((id) => !set.has(id));
      return [...prev, ...added];
    });
  }

  async function save() {
    setSaving(true); setErr("");
    try {
      const nextMode: "open" | "restricted" = selected.length > 0 ? "restricted" : "open";
      const res = await fetch(`/api/go/v2/keys/${apiKeyId}/bindings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeMode: nextMode,
          bindings: selected.map((channelId, i) => ({ channelId, order: i })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "保存失败"); return; }
      onSaved?.();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-[1100px] h-[86vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 顶部 */}
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-lg">自定义渠道分组 · {apiKeyName}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  为该 API Key 勾选允许使用的渠道；同模型勾多个时，按右侧列表从上往下顺序 fallback
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <Spinner /> <span className="ml-2 text-sm">加载中...</span>
          </div>
        ) : (
          <>
            {/* 说明条 */}
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <b>仅勾选了的模型才能被此 Key 调用。</b> 同一模型勾多个分组时，调用会按<b>右侧列表从上往下</b>顺序 fallback；
                若只勾 1 个分组且它临时下线，本次调用会直接 403 失败 —— 建议每个模型多勾几个分组，并把<b>最稳</b>的排最前。
                <br />
                不勾任何渠道 ⇒ 该 Key 为 <Badge color="green">open 全开</Badge> 模式，可访问所有启用渠道（和老用法一样）。
              </div>
            </div>

            {/* 主体 3 列 */}
            <div className="flex-1 grid grid-cols-[220px_1fr_320px] overflow-hidden">
              {/* 左列：模型列表 */}
              <div className="border-r flex flex-col overflow-hidden bg-slate-50/50">
                <div className="p-3 space-y-2 border-b bg-white">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      className="pl-8 h-9"
                      placeholder="搜索模型..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {TYPE_TABS.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setTypeFilter(t.value)}
                        className={cn(
                          "px-2 py-1 text-xs rounded-md",
                          typeFilter === t.value
                            ? "bg-brand-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                        )}
                      >{t.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-auto py-2">
                  {filteredModels.length === 0 && (
                    <div className="text-center text-sm text-slate-400 py-8">无匹配模型</div>
                  )}
                  {filteredModels.map((m) => {
                    const selCount = m.channels.filter((c) => selectedSet.has(c.id)).length;
                    const active = m.id === activeModelId;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setActiveModelId(m.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 border-l-2 flex items-center gap-2",
                          active ? "bg-brand-50 border-brand-500" : "border-transparent hover:bg-slate-100",
                        )}
                      >
                        <span className="text-base">{m.provider.logo || "●"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{m.name}</div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500">
                            <Badge color="slate" className="text-[10px] py-0">{m.type}</Badge>
                            {selCount > 0 && (
                              <Badge color="brand" className="text-[10px] py-0">已选 {selCount}</Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 中列：当前模型的渠道 */}
              <div className="flex flex-col overflow-hidden">
                {!activeModel ? (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                    从左侧选择一个模型
                  </div>
                ) : (
                  <>
                    <div className="p-4 border-b flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-semibold">{activeModel.name}</div>
                        <div className="text-xs text-slate-500">
                          {activeModel.slug} · 共 {activeModel.channels.length} 个可选分组
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={clearCurrentModel}>清空当前模型</Button>
                        <Button size="sm" variant="outline" onClick={selectAllHealthy}>全选健康分组</Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {activeModel.channels.map((c) => {
                        const h = health[c.id];
                        const selected = selectedSet.has(c.id);
                        const priceText =
                          activeModel.type === "chat"
                            ? `¥${formatMoney(c.sellInputPrice, 4)}/¥${formatMoney(c.sellOutputPrice, 4)} 每1K`
                            : `¥${formatMoney(c.sellUnitPrice, 4)} / ${activeModel.type === "video" ? "秒" : "次"}`;
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              "flex gap-3 p-3 rounded-xl border cursor-pointer select-none",
                              selected ? "border-brand-500 bg-brand-50/40" : "border-slate-200 hover:border-slate-300",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 w-4 h-4"
                              checked={selected}
                              onChange={() => toggleChannel(c.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{c.name}</span>
                                <Badge color={TIER_COLOR[c.tier] || "slate"} className="text-[10px]">{c.tier}</Badge>
                                {h?.online ? (
                                  <Badge color="green" className="text-[10px]">在线</Badge>
                                ) : (
                                  <Badge color="rose" className="text-[10px]">离线</Badge>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                起 {priceText}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 flex gap-3">
                                <span>24h 成功率 {h ? (h.successRate * 100).toFixed(0) : "100"}%</span>
                                <span>响应 {h?.avgLatencyMs ? (h.avgLatencyMs / 1000).toFixed(2) + "s" : "—"}</span>
                                <span>{c.upstream.name}</span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* 右列：已选清单 */}
              <div className="border-l flex flex-col overflow-hidden bg-slate-50/50">
                <div className="p-4 border-b bg-white flex items-center justify-between">
                  <div className="font-semibold">已选清单</div>
                  <Badge color="brand">{totalChannels} 分组 · {totalModels} 模型</Badge>
                </div>
                <div className="flex-1 overflow-auto p-3 space-y-4">
                  {selectedByModel.length === 0 && (
                    <div className="text-center text-sm text-slate-400 py-8">
                      未选任何渠道 = <b>open 模式</b><br />Key 可访问全部启用渠道
                    </div>
                  )}
                  {selectedByModel.map((g) => (
                    <div key={g.modelId}>
                      <div className="text-xs font-semibold text-slate-600 px-1 mb-1">{g.modelName}</div>
                      <div className="space-y-1">
                        {g.channels.map((c, idx) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 bg-white rounded-lg border px-2 py-1.5"
                          >
                            <span className="w-5 text-center text-xs font-mono text-brand-600">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{c.name}</div>
                              <div className="text-[10px] text-slate-500">
                                {health[c.id]?.online ? "在线" : "离线"} · ¥{formatMoney(c.sellUnitPrice || c.sellInputPrice, 4)}
                              </div>
                            </div>
                            <button
                              onClick={() => moveChannel(g.modelId, c.id, -1)}
                              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                              disabled={idx === 0}
                              title="上移"
                            ><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button
                              onClick={() => moveChannel(g.modelId, c.id, 1)}
                              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                              disabled={idx === g.channels.length - 1}
                              title="下移"
                            ><ArrowDown className="w-3.5 h-3.5" /></button>
                            <button
                              onClick={() => removeChannel(c.id)}
                              className="p-1 rounded hover:bg-rose-50 text-rose-500"
                              title="移除"
                            ><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 底部 */}
            <div className="border-t p-4 flex items-center justify-between gap-3 bg-white">
              <div className="text-xs text-slate-500">
                {totalChannels > 0 ? (
                  <>
                    共选 {totalChannels} 个分组（覆盖 {totalModels} 个模型）·{" "}
                    保存后该 Key 将进入 <Badge color="brand">restricted</Badge> 模式
                  </>
                ) : (
                  <>
                    未选任何分组 · 保存后该 Key 为 <Badge color="green">open</Badge> 全开模式
                  </>
                )}
              </div>
              {err && <div className="text-sm text-rose-600">{err}</div>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? <Spinner /> : <CheckCircle2 className="w-4 h-4" />}
                  确认（{totalChannels}）
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
