"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Pencil, Save, X, RefreshCw, AlertTriangle, Key,
  Check, Search, KeyRound,
} from "lucide-react";
import { Button, Card, Badge, Input, Label, Select, Spinner, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ========================= Types ========================= */

type UpstreamOpt = {
  id: string; slug: string; name: string; baseUrl: string; enabled: boolean;
  hasDefaultKey: boolean; defaultKeyMasked: string;
};
/** 密钥池当前支持的模型：chat（¥/1K tokens）+ image + video（¥/张 or ¥/秒） */
type SupportedType = "chat" | "image" | "video";
type ModelOpt = {
  id: string; slug: string; name: string;
  type: SupportedType;
  unit: string | null; unitPrice: number;
  inputPrice?: number; outputPrice?: number;   // chat 专用
  contextLength?: number | null;
  enabled: boolean;
  provider: { name: string; logo: string | null };
  tags: string[];
};
type PkgChannelOptionPrice = {
  paramKey: string;
  optionValue: string;
  costUnitPrice: number;
  sellUnitPrice: number;
  enabled: boolean;
};
type PkgChannel = {
  id: string;
  modelId: string;
  model: {
    id: string; slug: string; name: string; type: string;
    unit: string | null; unitPrice: number;
    inputPrice?: number; outputPrice?: number;
    contextLength?: number | null;
  };
  name: string;
  tier: string;
  upstreamModelSlug: string | null;
  // image / video
  costUnitPrice: number;
  sellUnitPrice: number;
  // chat
  costInputPrice: number;
  costOutputPrice: number;
  sellInputPrice: number;
  sellOutputPrice: number;
  priority: number;
  enabled: boolean;
  enableFallback: boolean;
  notes: string | null;
  profitRate: number | null;
  optionPrices?: PkgChannelOptionPrice[];
};

const IMAGE_SIZE_OPTIONS = ["1K", "2K", "4K"] as const;
type Pkg = {
  pkgKey: string;
  upstream: { id: string; slug: string; name: string; enabled: boolean; baseUrl: string; hasDefaultKey: boolean };
  hasApiKey: boolean;
  apiKeyMasked: string;
  channels: PkgChannel[];
};
type ListResp = {
  packages: Pkg[];
  upstreams: UpstreamOpt[];
  models: ModelOpt[];
  minProfitRates: { chat: number; image: number; video: number };
  /** @deprecated 旧字段：图像利润率 */
  minProfitRate?: number;
};

function typeLabel(t: string): { label: string; color: "brand" | "violet" | "amber"; icon: string } {
  if (t === "chat") return { label: "对话", color: "brand", icon: "💬" };
  if (t === "video") return { label: "视频", color: "amber", icon: "🎬" };
  return { label: "图像", color: "violet", icon: "🖼️" };
}

/* ========================= Page ========================= */

export default function UpstreamKeysClient() {
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/admin/upstream-keys", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "加载失败");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removePkg = async (pkg: Pkg) => {
    if (!confirm(
      `将删除密钥包（上游=${pkg.upstream.name} · ${pkg.hasApiKey ? "专属key=" + pkg.apiKeyMasked : "使用上游默认key"}）下的 ${pkg.channels.length} 条渠道。确定？`
    )) return;
    try {
      const res = await fetch("/api/admin/upstream-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: pkg.channels.map((c) => c.id) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "删除失败");
      showToast(`已删除 ${d.deleted} 条渠道`);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6 text-brand-600" /> 上游密钥池
          </h1>
          <p className="text-slate-500 mt-1 text-sm max-w-3xl">
            以「密钥包」为单位批量管理渠道：<b>一把 key + N 个模型</b>，每个模型独立定价与档位。
            适合"从同一上游买了多把 key，每把价格不一样、只对应特定模型"的采购场景。
            <span className="block mt-1">
              覆盖模型类型：<Badge color="brand">对话</Badge> <Badge color="violet">图像</Badge> <Badge color="amber">视频</Badge>
              <span className="ml-2 text-[11px]">（对话按 ¥/1K tokens、分输入输出双价；图像支持 1K/2K/4K 差异化定价；视频用基础价）</span>
            </span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> 刷新
          </Button>
          <Button onClick={() => setCreating(true)} disabled={!data || data.upstreams.length === 0 || data.models.length === 0}>
            <Plus className="w-4 h-4" /> 新建密钥包
          </Button>
        </div>
      </div>

      {err && (
        <div className="p-3 text-sm bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      {data && data.upstreams.length === 0 && (
        <Card className="p-6 text-sm text-amber-700 bg-amber-50 border-amber-200">
          尚未配置任何上游账号。请先到 <a className="underline" href="/admin/upstreams">/admin/upstreams</a> 添加一个上游（设 baseUrl 和默认 apiKey），然后回来创建密钥包。
        </Card>
      )}

      {data && data.models.length === 0 && (
        <Card className="p-6 text-sm text-amber-700 bg-amber-50 border-amber-200">
          当前没有对话 / 图像 / 视频类型的模型。请先到 <a className="underline" href="/admin/models">/admin/models</a> 新建一个，再来配置密钥包。
        </Card>
      )}

      {data && data.packages.length === 0 && !loading && data.upstreams.length > 0 && data.models.length > 0 && (
        <Card className="p-10">
          <EmptyState
            title="还没有任何密钥包"
            desc="点击右上角「新建密钥包」，挑一个上游、可选填一把专属 key、勾选这把 key 要服务的对话/图像/视频模型并分别定价。"
            icon={<KeyRound className="w-6 h-6" />}
          />
        </Card>
      )}

      <div className="space-y-4">
        {data?.packages.map((pkg) => (
          <Card key={pkg.pkgKey} className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center gap-2 font-semibold text-slate-800">
                  <KeyRound className="w-4 h-4 text-brand-600" />
                  {pkg.hasApiKey ? <span>🔑 {pkg.apiKeyMasked}</span> : <span className="text-slate-500">（使用上游默认 key）</span>}
                </div>
                <Badge color="slate">上游：{pkg.upstream.name}</Badge>
                {!pkg.upstream.enabled && <Badge color="rose">上游停用</Badge>}
                <Badge color="brand">{pkg.channels.length} 个模型</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(pkg)}>
                  <Pencil className="w-3.5 h-3.5" /> 编辑
                </Button>
                <Button size="sm" variant="danger" onClick={() => removePkg(pkg)}>
                  <Trash2 className="w-3.5 h-3.5" /> 删除整包
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 bg-white">
                  <tr>
                    <th className="px-5 py-2 text-left font-normal">模型</th>
                    <th className="px-5 py-2 text-left font-normal">档位</th>
                    <th className="px-5 py-2 text-right font-normal">成本价<span className="text-[10px] text-slate-400 ml-1">¥/张·秒 or 1K tok</span></th>
                    <th className="px-5 py-2 text-right font-normal">售价<span className="text-[10px] text-slate-400 ml-1">¥/张·秒 or 1K tok</span></th>
                    <th className="px-5 py-2 text-right font-normal">利润率</th>
                    <th className="px-5 py-2 text-right font-normal">优先级</th>
                    <th className="px-5 py-2 text-left font-normal">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.channels.map((c) => {
                    const t = typeLabel(c.model.type);
                    const isChat = c.model.type === "chat";
                    return (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-5 py-2">
                        <div className="font-medium flex items-center gap-2">
                          {c.model.name}
                          <Badge color={t.color}>{t.label}</Badge>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">{c.model.slug}</div>
                      </td>
                      <td className="px-5 py-2">
                        <div>{c.name}</div>
                        <Badge color={c.tier === "premium" ? "violet" : c.tier === "economy" ? "slate" : "brand"}>{c.tier}</Badge>
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs">
                        {isChat ? (
                          <div className="leading-tight">
                            <div>入¥{c.costInputPrice}</div>
                            <div>出¥{c.costOutputPrice}</div>
                          </div>
                        ) : (
                          <>¥{c.costUnitPrice}</>
                        )}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs">
                        {isChat ? (
                          <div className="leading-tight">
                            <div>入¥{c.sellInputPrice}</div>
                            <div>出¥{c.sellOutputPrice}</div>
                          </div>
                        ) : (
                          <>¥{c.sellUnitPrice}</>
                        )}
                        {!isChat && c.optionPrices && c.optionPrices.length > 0 && (
                          <div className="text-[10px] text-violet-600 font-sans mt-0.5"
                            title={c.optionPrices.map((o) => `${o.optionValue}: 成本¥${o.costUnitPrice} 售¥${o.sellUnitPrice}`).join(" · ")}>
                            {c.optionPrices.map((o) => `${o.optionValue}¥${o.sellUnitPrice}`).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-2 text-right text-xs">
                        {c.profitRate === null
                          ? <span className="text-slate-400">-</span>
                          : <Badge color={c.profitRate >= 0.2 ? "green" : c.profitRate >= 0 ? "amber" : "rose"}>
                              {(c.profitRate * 100).toFixed(1)}%
                            </Badge>}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs">{c.priority}</td>
                      <td className="px-5 py-2">
                        {c.enabled ? <Badge color="green">启用</Badge> : <Badge color="slate">停用</Badge>}
                        {c.enableFallback && <Badge color="amber" className="ml-1">可降级</Badge>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      {(creating || editing) && data && (
        <PackageEditor
          pkg={editing}
          upstreams={data.upstreams}
          models={data.models}
          minProfitRates={data.minProfitRates}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={(msg) => { setCreating(false); setEditing(null); showToast(msg || "已保存"); load(); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ========================= Editor Modal ========================= */

type OptionRow = { costUnitPrice: number; sellUnitPrice: number; enabled: boolean };
type DraftRow = {
  existingId?: string;   // 编辑现有 channel 时的 id
  modelId: string;
  model: ModelOpt;
  name: string;
  tier: "premium" | "standard" | "economy" | "custom";
  upstreamModelSlug: string;
  // image / video：单价
  costUnitPrice: number;
  sellUnitPrice: number;
  // chat：输入 / 输出双价（¥/1K tokens）
  costInputPrice: number;
  costOutputPrice: number;
  sellInputPrice: number;
  sellOutputPrice: number;
  priority: number;
  enabled: boolean;
  enableFallback: boolean;
  notes: string;
  optionPrices: Record<string, OptionRow>;   // 仅 image 模型用；key = 1K/2K/4K
};

function PackageEditor({
  pkg, upstreams, models, minProfitRates, onClose, onSaved,
}: {
  pkg: Pkg | null;
  upstreams: UpstreamOpt[];
  models: ModelOpt[];
  minProfitRates: { chat: number; image: number; video: number };
  onClose: () => void;
  onSaved: (msg?: string) => void;
}) {
  const isEdit = Boolean(pkg);

  const [upstreamId, setUpstreamId] = useState<string>(pkg?.upstream.id || upstreams[0]?.id || "");
  // 新建时 apiKey 可自由输入；编辑时留空 = 不修改；填了或勾选"清空"即覆盖
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);

  // 初始化 rows：编辑模式取 pkg.channels，新建模式为空
  const [rows, setRows] = useState<DraftRow[]>(() => {
    if (!pkg) return [];
    return pkg.channels.map((c) => {
      const m = models.find((x) => x.id === c.modelId);
      if (!m) return null;
      const opMap: Record<string, OptionRow> = {};
      for (const s of IMAGE_SIZE_OPTIONS) {
        const hit = c.optionPrices?.find((o) => o.paramKey === "imageSize" && o.optionValue === s);
        opMap[s] = hit
          ? { costUnitPrice: hit.costUnitPrice, sellUnitPrice: hit.sellUnitPrice, enabled: hit.enabled }
          : { costUnitPrice: c.costUnitPrice, sellUnitPrice: c.sellUnitPrice, enabled: false };
      }
      return {
        existingId: c.id,
        modelId: c.modelId,
        model: m,
        name: c.name,
        tier: (["premium", "standard", "economy", "custom"].includes(c.tier) ? c.tier : "standard") as DraftRow["tier"],
        upstreamModelSlug: c.upstreamModelSlug || "",
        costUnitPrice: c.costUnitPrice,
        sellUnitPrice: c.sellUnitPrice,
        costInputPrice: c.costInputPrice,
        costOutputPrice: c.costOutputPrice,
        sellInputPrice: c.sellInputPrice,
        sellOutputPrice: c.sellOutputPrice,
        priority: c.priority,
        enabled: c.enabled,
        enableFallback: c.enableFallback,
        notes: c.notes || "",
        optionPrices: opMap,
      } as DraftRow;
    }).filter(Boolean) as DraftRow[];
  });

  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "chat" | "image" | "video">("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const chosenUpstream = upstreams.find((u) => u.id === upstreamId);

  const selectedModelIds = useMemo(() => new Set(rows.map((r) => r.modelId)), [rows]);

  const minRateFor = useCallback(
    (t: SupportedType) => minProfitRates[t] ?? 0.2,
    [minProfitRates],
  );

  // 可供添加的模型列表（排除已在 rows 的）
  const filteredAvailable = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return models
      .filter((m) => !selectedModelIds.has(m.id))
      .filter((m) => (typeFilter ? m.type === typeFilter : true))
      .filter((m) => {
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q)
          || m.slug.toLowerCase().includes(q)
          || (m.provider.name || "").toLowerCase().includes(q)
        );
      });
  }, [models, selectedModelIds, filter, typeFilter]);

  function addModel(m: ModelOpt) {
    const minRate = minRateFor(m.type);
    const opMap: Record<string, OptionRow> = {};
    const unitDefaultSell = m.unitPrice || 0.2;
    const unitDefaultCost = +(unitDefaultSell / (1 + minRate + 0.05)).toFixed(4);
    for (const s of IMAGE_SIZE_OPTIONS) {
      opMap[s] = { costUnitPrice: unitDefaultCost, sellUnitPrice: unitDefaultSell, enabled: false };
    }

    const isChat = m.type === "chat";
    const chatSellIn = isChat ? (m.inputPrice ?? 0.01) : 0;
    const chatSellOut = isChat ? (m.outputPrice ?? 0.03) : 0;
    const chatCostIn = isChat ? +(chatSellIn / (1 + minRate + 0.05)).toFixed(6) : 0;
    const chatCostOut = isChat ? +(chatSellOut / (1 + minRate + 0.05)).toFixed(6) : 0;

    setRows((rs) => [
      ...rs,
      {
        modelId: m.id,
        model: m,
        name: chosenUpstream ? chosenUpstream.name : "标准版",
        tier: "standard",
        upstreamModelSlug: "",
        costUnitPrice: isChat ? 0 : unitDefaultCost,
        sellUnitPrice: isChat ? 0 : unitDefaultSell,
        costInputPrice: chatCostIn,
        costOutputPrice: chatCostOut,
        sellInputPrice: chatSellIn,
        sellOutputPrice: chatSellOut,
        priority: 100 + rs.length * 10,
        enabled: true,
        enableFallback: true,
        notes: "",
        optionPrices: opMap,
      },
    ]);
  }

  function removeRow(idx: number) {
    setRows((rs) => rs.filter((_, i) => i !== idx));
  }

  function patchRow(idx: number, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function save() {
    setErr("");
    if (!upstreamId) { setErr("请选择上游"); return; }
    if (rows.length === 0) { setErr("请至少添加一个模型"); return; }

    // 前端粗验价格
    for (const r of rows) {
      const minRate = minRateFor(r.model.type);
      if (r.model.type === "chat") {
        const vals: [string, number, number][] = [
          ["输入成本", r.costInputPrice, r.sellInputPrice],
          ["输出成本", r.costOutputPrice, r.sellOutputPrice],
        ];
        for (const [label, cost, sell] of vals) {
          if (!Number.isFinite(cost) || cost < 0) { setErr(`${r.model.name}：${label}非法`); return; }
          if (!Number.isFinite(sell) || sell < 0) { setErr(`${r.model.name}：${label.replace("成本", "售价")}非法`); return; }
        }
        const totalCost = r.costInputPrice + r.costOutputPrice;
        const totalSell = r.sellInputPrice + r.sellOutputPrice;
        if (totalCost > 0) {
          const rate = (totalSell - totalCost) / totalCost;
          if (rate + 1e-9 < minRate) {
            setErr(`${r.model.name}：综合利润率 ${(rate * 100).toFixed(1)}% < 要求的 ${(minRate * 100).toFixed(0)}%`);
            return;
          }
        }
      } else {
        if (!Number.isFinite(r.costUnitPrice) || r.costUnitPrice < 0) { setErr(`${r.model.name}：成本价非法`); return; }
        if (!Number.isFinite(r.sellUnitPrice) || r.sellUnitPrice < 0) { setErr(`${r.model.name}：售价非法`); return; }
        if (r.costUnitPrice > 0) {
          const rate = (r.sellUnitPrice - r.costUnitPrice) / r.costUnitPrice;
          if (rate + 1e-9 < minRate) {
            setErr(`${r.model.name}：利润率 ${(rate * 100).toFixed(1)}% < 要求的 ${(minRate * 100).toFixed(0)}%`);
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        upstreamId,
        existingChannelIds: pkg?.channels.map((c) => c.id) || [],
        channels: rows.map((r) => {
          const isChat = r.model.type === "chat";
          return {
            id: r.existingId,
            modelId: r.modelId,
            name: r.name,
            tier: r.tier,
            upstreamModelSlug: r.upstreamModelSlug || null,
            ...(isChat
              ? {
                  costInputPrice: r.costInputPrice,
                  costOutputPrice: r.costOutputPrice,
                  sellInputPrice: r.sellInputPrice,
                  sellOutputPrice: r.sellOutputPrice,
                }
              : {
                  costUnitPrice: r.costUnitPrice,
                  sellUnitPrice: r.sellUnitPrice,
                }),
            priority: r.priority,
            enabled: r.enabled,
            enableFallback: r.enableFallback,
            notes: r.notes || null,
            optionPrices: r.model.type === "image"
              ? IMAGE_SIZE_OPTIONS
                  .filter((s) => r.optionPrices[s]?.enabled)
                  .map((s) => ({
                    paramKey: "imageSize",
                    optionValue: s,
                    costUnitPrice: r.optionPrices[s].costUnitPrice,
                    sellUnitPrice: r.optionPrices[s].sellUnitPrice,
                    enabled: true,
                  }))
              : [],
          };
        }),
      };

      // apiKey 策略
      //   新建：input 非空 → 设置专属 key；否则 null（用上游默认）
      //   编辑：
      //     勾了「清空」     → null
      //     input 有值      → 覆盖为新 key
      //     input 空且原来有 → "__KEEP__"（后端自动读原值填回）
      //     input 空且原来无 → null
      if (isEdit) {
        if (clearApiKey) body.apiKey = null;
        else if (apiKey.trim()) body.apiKey = apiKey.trim();
        else body.apiKey = pkg!.hasApiKey ? "__KEEP__" : null;
      } else {
        body.apiKey = apiKey.trim() || null;
      }

      const res = await fetch("/api/admin/upstream-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "保存失败"); return; }
      const msg = `已保存（新增 ${data.created || 0} · 更新 ${data.updated || 0} · 删除 ${data.deleted || 0}）`;
      onSaved(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-brand-600" />
            {isEdit ? "编辑密钥包" : "新建密钥包"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* 顶栏 ：上游 + apiKey */}
          <section className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>上游账号</Label>
              <Select value={upstreamId} onChange={(e) => setUpstreamId(e.target.value)} className="w-full" disabled={isEdit}>
                {upstreams.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}{!u.enabled ? "（停用）" : ""} · {u.baseUrl}
                  </option>
                ))}
              </Select>
              {chosenUpstream && (
                <div className="mt-1 text-[11px] text-slate-500">
                  默认 key：
                  {chosenUpstream.hasDefaultKey
                    ? <span className="text-slate-700 font-mono">{chosenUpstream.defaultKeyMasked}</span>
                    : <span className="text-rose-500">未配置</span>}
                  {isEdit && <span className="ml-2 text-amber-600">（编辑时不支持修改上游）</span>}
                </div>
              )}
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <span>密钥包专用 API Key（可选）</span>
                {isEdit && pkg?.hasApiKey && (
                  <span className="text-[10px] text-brand-600 font-normal">🔑 当前已设置：{pkg.apiKeyMasked}</span>
                )}
              </Label>
              <div className="flex gap-2 items-start">
                <Input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setClearApiKey(false); }}
                  placeholder={isEdit && pkg?.hasApiKey ? "留空 = 不修改现有 key" : "留空 = 使用上游默认 key"}
                  className="flex-1"
                />
                {isEdit && pkg?.hasApiKey && (
                  <label className="inline-flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap h-10">
                    <input type="checkbox" checked={clearApiKey} onChange={(e) => { setClearApiKey(e.target.checked); if (e.target.checked) setApiKey(""); }} />
                    清空
                  </label>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                保存后前端只会看到掩码。所有已勾选模型的渠道都会共享这把 key。
              </p>
            </div>
          </section>

          {/* 已选模型行 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">已绑定的模型（{rows.length}）</h3>
              <div className="text-xs text-slate-400">
                对话最低 {(minProfitRates.chat * 100).toFixed(0)}% · 图像最低 {(minProfitRates.image * 100).toFixed(0)}% · 视频最低 {(minProfitRates.video * 100).toFixed(0)}%
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-6 text-center">
                从下方「可添加的模型」里点一下，就会追加到这里
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((r, idx) => {
                  const isChat = r.model.type === "chat";
                  const isImage = r.model.type === "image";
                  const isVideo = r.model.type === "video";
                  const rowMin = minRateFor(r.model.type);
                  const rate = isChat
                    ? (r.costInputPrice + r.costOutputPrice > 0
                        ? ((r.sellInputPrice + r.sellOutputPrice) - (r.costInputPrice + r.costOutputPrice)) / (r.costInputPrice + r.costOutputPrice)
                        : null)
                    : (r.costUnitPrice > 0
                        ? (r.sellUnitPrice - r.costUnitPrice) / r.costUnitPrice
                        : null);
                  const unitLabel = isVideo ? "¥/秒" : isImage ? "¥/张" : "¥/1K tok";
                  const t = typeLabel(r.model.type);
                  return (
                    <div key={r.modelId} className="border border-slate-200 rounded-xl p-3 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium flex items-center gap-2">
                          {r.model.provider.logo || t.icon} {r.model.name}
                          <Badge color={t.color}>{t.label}</Badge>
                          <span className="text-xs font-mono text-slate-400">{r.model.slug}</span>
                          {r.existingId && <Badge color="slate">已存在</Badge>}
                        </div>
                        <button onClick={() => removeRow(idx)} className="w-7 h-7 rounded hover:bg-rose-50 text-rose-500 inline-flex items-center justify-center" title="移出密钥包">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {isChat ? (
                        <>
                          {/* chat：第 1 行 基本 4 col，第 2 行 价格 4 col */}
                          <div className="grid md:grid-cols-4 gap-2">
                            <div className="md:col-span-2">
                              <Label className="text-[11px]">档位名</Label>
                              <Input value={r.name} onChange={(e) => patchRow(idx, { name: e.target.value })} placeholder="高级版 / 经济版" />
                            </div>
                            <div>
                              <Label className="text-[11px]">档位类型</Label>
                              <Select value={r.tier} onChange={(e) => patchRow(idx, { tier: e.target.value as DraftRow["tier"] })}>
                                <option value="premium">premium</option>
                                <option value="standard">standard</option>
                                <option value="economy">economy</option>
                                <option value="custom">custom</option>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[11px]">优先级</Label>
                              <Input type="number" value={r.priority}
                                onChange={(e) => patchRow(idx, { priority: parseInt(e.target.value) || 0 })} />
                            </div>
                          </div>
                          <div className="grid md:grid-cols-4 gap-2 mt-2">
                            <div>
                              <Label className="text-[11px]">成本·输入 <span className="text-slate-400">¥/1K tok</span></Label>
                              <Input type="number" step="0.000001" value={r.costInputPrice}
                                onChange={(e) => patchRow(idx, { costInputPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <Label className="text-[11px]">成本·输出 <span className="text-slate-400">¥/1K tok</span></Label>
                              <Input type="number" step="0.000001" value={r.costOutputPrice}
                                onChange={(e) => patchRow(idx, { costOutputPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <Label className="text-[11px]">售价·输入 <span className="text-slate-400">¥/1K tok</span></Label>
                              <Input type="number" step="0.000001" value={r.sellInputPrice}
                                onChange={(e) => patchRow(idx, { sellInputPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <Label className="text-[11px]">售价·输出 <span className="text-slate-400">¥/1K tok</span></Label>
                              <Input type="number" step="0.000001" value={r.sellOutputPrice}
                                onChange={(e) => patchRow(idx, { sellOutputPrice: parseFloat(e.target.value) || 0 })} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="grid md:grid-cols-6 gap-2">
                          <div className="md:col-span-2">
                            <Label className="text-[11px]">档位名</Label>
                            <Input value={r.name} onChange={(e) => patchRow(idx, { name: e.target.value })} placeholder="高级版 / 经济版" />
                          </div>
                          <div>
                            <Label className="text-[11px]">档位类型</Label>
                            <Select value={r.tier} onChange={(e) => patchRow(idx, { tier: e.target.value as DraftRow["tier"] })}>
                              <option value="premium">premium</option>
                              <option value="standard">standard</option>
                              <option value="economy">economy</option>
                              <option value="custom">custom</option>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[11px]">成本 {unitLabel}</Label>
                            <Input type="number" step="0.0001" value={r.costUnitPrice}
                              onChange={(e) => patchRow(idx, { costUnitPrice: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div>
                            <Label className="text-[11px]">售价 {unitLabel}</Label>
                            <Input type="number" step="0.0001" value={r.sellUnitPrice}
                              onChange={(e) => patchRow(idx, { sellUnitPrice: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div>
                            <Label className="text-[11px]">优先级</Label>
                            <Input type="number" value={r.priority}
                              onChange={(e) => patchRow(idx, { priority: parseInt(e.target.value) || 0 })} />
                          </div>
                        </div>
                      )}
                      <div className="grid md:grid-cols-6 gap-2 mt-2">
                        <div className="md:col-span-2">
                          <Label className="text-[11px]">上游 model slug（留空用 {r.model.slug}）</Label>
                          <Input value={r.upstreamModelSlug} onChange={(e) => patchRow(idx, { upstreamModelSlug: e.target.value })} placeholder={r.model.slug} />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-[11px]">备注</Label>
                          <Input value={r.notes} onChange={(e) => patchRow(idx, { notes: e.target.value })} placeholder="促销 / 成本待核对 / ..." />
                        </div>
                        <div className="flex items-end gap-3 text-xs">
                          <label className="inline-flex items-center gap-1">
                            <input type="checkbox" checked={r.enabled} onChange={(e) => patchRow(idx, { enabled: e.target.checked })} /> 启用
                          </label>
                          <label className="inline-flex items-center gap-1">
                            <input type="checkbox" checked={r.enableFallback} onChange={(e) => patchRow(idx, { enableFallback: e.target.checked })} /> 可降级
                          </label>
                        </div>
                      </div>
                      <div className="mt-2 text-xs flex items-center justify-between">
                        <div>
                          {isChat ? "综合利润率" : "利润率"}：
                          {rate === null
                            ? <span className="text-slate-400 ml-1">-</span>
                            : <Badge color={rate >= rowMin ? (rate >= 0.3 ? "green" : "amber") : "rose"} className="ml-1">
                                {(rate * 100).toFixed(1)}%
                              </Badge>}
                          <span className="text-[11px] text-slate-400 ml-2">（{t.label} 最低 {(rowMin * 100).toFixed(0)}%）</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {isImage
                            ? "勾选下方分辨率 → 该档位走差异价"
                            : isVideo
                            ? "视频按 秒 计费，无分辨率差异化定价"
                            : "对话按 1K tokens 计费，输入 / 输出分别定价"}
                        </div>
                      </div>

                      {/* 分辨率差异化定价（仅图像） */}
                      {isImage && (
                        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2">
                          <table className="w-full text-[11px]">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="py-1 text-left font-normal w-10">启用</th>
                                <th className="py-1 text-left font-normal">imageSize</th>
                                <th className="py-1 text-right font-normal">成本 ¥</th>
                                <th className="py-1 text-right font-normal">售价 ¥</th>
                                <th className="py-1 text-right font-normal">利润率</th>
                              </tr>
                            </thead>
                            <tbody>
                              {IMAGE_SIZE_OPTIONS.map((s) => {
                                const op = r.optionPrices[s];
                                const orate = op.costUnitPrice > 0
                                  ? (op.sellUnitPrice - op.costUnitPrice) / op.costUnitPrice
                                  : null;
                                return (
                                  <tr key={s} className="border-t border-violet-100">
                                    <td className="py-1">
                                      <input type="checkbox" checked={op.enabled}
                                        onChange={(e) =>
                                          patchRow(idx, {
                                            optionPrices: { ...r.optionPrices, [s]: { ...op, enabled: e.target.checked } },
                                          })
                                        } />
                                    </td>
                                    <td className="py-1 font-medium">{s}</td>
                                    <td className="py-1 text-right">
                                      <Input type="number" step="0.0001" value={op.costUnitPrice} disabled={!op.enabled}
                                        onChange={(e) =>
                                          patchRow(idx, {
                                            optionPrices: {
                                              ...r.optionPrices,
                                              [s]: { ...op, costUnitPrice: parseFloat(e.target.value) || 0 },
                                            },
                                          })
                                        }
                                        className="h-6 text-[11px] text-right w-20 inline-block" />
                                    </td>
                                    <td className="py-1 text-right">
                                      <Input type="number" step="0.0001" value={op.sellUnitPrice} disabled={!op.enabled}
                                        onChange={(e) =>
                                          patchRow(idx, {
                                            optionPrices: {
                                              ...r.optionPrices,
                                              [s]: { ...op, sellUnitPrice: parseFloat(e.target.value) || 0 },
                                            },
                                          })
                                        }
                                        className="h-6 text-[11px] text-right w-20 inline-block" />
                                    </td>
                                    <td className="py-1 text-right">
                                      {!op.enabled
                                        ? <span className="text-slate-300">用基础价</span>
                                        : orate === null
                                          ? <span className="text-slate-400">-</span>
                                          : <span className={orate >= rowMin ? (orate >= 0.3 ? "text-emerald-600" : "text-amber-600") : "text-rose-600"}>
                                              {(orate * 100).toFixed(1)}%
                                            </span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 可添加的模型 */}
          <section>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-slate-700">可添加的模型（对话 / 图像 / 视频）</h3>
              <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
                <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "" | "chat" | "image" | "video")} className="h-8">
                  <option value="">全部类型</option>
                  <option value="chat">仅对话</option>
                  <option value="image">仅图像</option>
                  <option value="video">仅视频</option>
                </Select>
                <Search className="w-4 h-4" />
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜名称/slug/厂商" className="h-8 w-48" />
              </div>
            </div>
            {filteredAvailable.length === 0 ? (
              <div className="text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-4 text-center">
                {selectedModelIds.size === models.length ? "已经把所有对话 / 图像 / 视频模型都加进来了" : "没匹配到符合条件的模型"}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                {filteredAvailable.map((m) => {
                  const t = typeLabel(m.type);
                  const isChat = m.type === "chat";
                  const isVideo = m.type === "video";
                  const refPrice = isChat
                    ? `参考 入¥${m.inputPrice ?? 0}/出¥${m.outputPrice ?? 0} per 1K tok`
                    : `参考单价 ¥${m.unitPrice}/${isVideo ? "秒" : "张"}`;
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => addModel(m)}
                      className="text-left border border-slate-200 rounded-lg p-3 hover:border-brand-400 hover:bg-brand-50/40 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {m.provider.logo || t.icon} {m.name}
                          <Badge color={t.color}>{t.label}</Badge>
                        </div>
                        {!m.enabled && <Badge color="rose">停用</Badge>}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">{m.slug}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {refPrice} · {m.provider.name}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-600">
                        <Plus className="w-3 h-3" /> 加入密钥包
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {err && (
            <div className="p-3 text-sm bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={save} disabled={saving || rows.length === 0}>
            {saving ? <Spinner /> : <Save className="w-4 h-4" />} 保存密钥包（{rows.length} 模型）
          </Button>
        </div>
      </div>
    </div>
  );
}
