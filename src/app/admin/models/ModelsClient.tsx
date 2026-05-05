"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Pencil, Save, X, RefreshCw, AlertTriangle, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Eraser, ArrowUp, ArrowDown, GripVertical, Network,
} from "lucide-react";
import { Button, Card, Badge, Input, Label, Select, Textarea, Spinner, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ========================= Types ========================= */

type Provider = { id: string; name: string; logo?: string | null };

type ParamOption = { label: string; value: string; is_default: boolean };
type ParamType = "select" | "textarea" | "number" | "upload" | "switch";
type ParamDef = {
  name: string;
  label: string;
  type: ParamType;
  required: boolean;
  default: string | number | boolean;
  description: string;
  options?: ParamOption[];
};

type ModelRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  providerId: string;
  provider: Provider;
  description: string;
  contextLength: number | null;
  tags: string;
  enabled: boolean;
  inputPrice: number;
  outputPrice: number;
  unitPrice: number;
  unit: string | null;
  params: ParamDef[] | null;    // null = 使用默认模板
  usageCount: number;
  taskCount: number;
  mediaAssetCount: number;
  createdAt: string;
};

type ListResp = { models: ModelRow[]; providers: Provider[] };

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "chat",  label: "对话 Chat" },
  { value: "image", label: "图像 Image" },
  { value: "video", label: "视频 Video" },
  { value: "audio", label: "音频 Audio（含 TTS / Music）" },
  { value: "embedding", label: "向量 Embedding" },
];

const TYPE_BADGE: Record<string, "brand" | "violet" | "amber" | "slate" | "green"> = {
  chat: "brand", image: "violet", video: "amber", audio: "green", embedding: "slate",
};
function typeLabel(t: string) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label || t;
}

/* ========================= Page ========================= */

export default function ModelsClient() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch("/api/admin/models", { cache: "no-store" });
      const data = (await res.json()) as ListResp | { error: string };
      if (!res.ok) throw new Error((data as any).error || "加载失败");
      setRows((data as ListResp).models);
      setProviders((data as ListResp).providers);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "disabled") return rows.filter((r) => !r.enabled);
    return rows.filter((r) => r.type === filter);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, chat: 0, image: 0, video: 0, audio: 0, embedding: 0, disabled: 0 };
    for (const r of rows) {
      c[r.type] = (c[r.type] || 0) + 1;
      if (!r.enabled) c.disabled++;
    }
    return c;
  }, [rows]);

  const clearAll = async (mode: "soft" | "hard") => {
    const msg = mode === "hard"
      ? "【物理删除】所有模型将被彻底移除（只有没有账单记录时可用）。确定？"
      : "将禁用所有模型（软删除，数据保留），同时清空所有参数覆盖。确定？";
    if (!confirm(msg)) return;
    try {
      const res = await fetch("/api/admin/models/clear-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      showToast(mode === "hard" ? "已物理清空" : `已禁用 ${data.disabled} 个模型`);
      load();
    } catch (e) {
      alert((e instanceof Error ? e.message : "操作失败"));
    }
  };

  const removeOne = async (row: ModelRow, mode: "soft" | "hard") => {
    const desc = mode === "hard"
      ? `将【物理删除】模型「${row.name}」。该模型 usages=${row.usageCount}（必须 0 才可硬删除）。确定？`
      : `将【禁用】模型「${row.name}」（软删除，保留历史数据）。确定？`;
    if (!confirm(desc)) return;
    try {
      const res = await fetch(`/api/admin/models/${row.id}?mode=${mode}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      showToast("已删除");
      load();
    } catch (e) {
      alert((e instanceof Error ? e.message : "删除失败"));
    }
  };

  const toggleEnabled = async (row: ModelRow) => {
    try {
      const res = await fetch(`/api/admin/models/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "操作失败");
      showToast(!row.enabled ? "已启用" : "已禁用");
      load();
    } catch (e) {
      alert((e instanceof Error ? e.message : "操作失败"));
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">模型管理</h1>
          <p className="text-slate-500 mt-1 text-sm">
            在这里逐个添加 / 编辑模型并精确配置参数（name / label / type / required / default / options / description）。
            参数会直接影响 <code className="px-1 bg-slate-100 rounded text-xs">GET /v1/skills/models/&#123;name&#125;</code> 的返回
            和前端生成页面的表单。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> 刷新
          </Button>
          <Button variant="outline" onClick={() => clearAll("soft")}>
            <Eraser className="w-4 h-4" /> 禁用全部（软清空）
          </Button>
          <Button variant="danger" onClick={() => clearAll("hard")}>
            <Trash2 className="w-4 h-4" /> 物理清空
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> 新增模型
          </Button>
        </div>
      </div>

      {err && (
        <div className="p-3 text-sm bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { k: "all", label: "全部" },
            { k: "chat", label: "Chat" },
            { k: "image", label: "Image" },
            { k: "video", label: "Video" },
            { k: "audio", label: "Audio" },
            { k: "embedding", label: "Embedding" },
            { k: "disabled", label: "已禁用" },
          ].map((t) => {
            const active = filter === t.k;
            return (
              <button key={t.k} onClick={() => setFilter(t.k)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-sm font-medium transition",
                  active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}>
                {t.label}
                <span className={cn("text-xs", active ? "opacity-80" : "opacity-60")}>{counts[t.k] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10">
            <EmptyState
              title={loading ? "加载中..." : "当前没有模型"}
              desc={loading ? undefined : "点击右上角【新增模型】来添加第一个模型。"}
              icon={loading ? <Spinner /> : <Plus className="w-6 h-6" />}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 font-normal">模型</th>
                  <th className="text-left px-5 py-3 font-normal">类型 / 厂商</th>
                  <th className="text-left px-5 py-3 font-normal">Slug</th>
                  <th className="text-right px-5 py-3 font-normal">定价</th>
                  <th className="text-right px-5 py-3 font-normal">使用情况</th>
                  <th className="text-left px-5 py-3 font-normal">参数</th>
                  <th className="text-left px-5 py-3 font-normal">状态</th>
                  <th className="text-right px-5 py-3 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <Fragment key={m.id}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <div className="font-medium">{m.provider.logo} {m.name}</div>
                      {m.description && <div className="text-xs text-slate-500 line-clamp-1 max-w-md">{m.description}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={TYPE_BADGE[m.type] || "slate"}>{typeLabel(m.type)}</Badge>
                      <div className="text-xs text-slate-500 mt-1">{m.provider.name}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{m.slug}</td>
                    <td className="px-5 py-3 text-right text-xs">
                      {m.type === "chat"
                        ? <>¥ {m.inputPrice} / ¥ {m.outputPrice}<div className="text-slate-400">每 1K tokens</div></>
                        : <>¥ {m.unitPrice}<div className="text-slate-400">每 {m.unit === "second" ? "秒" : "张/次"}</div></>
                      }
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-500">
                      <div>调用 {m.usageCount}</div>
                      <div>异步任务 {m.taskCount}</div>
                      <div>作品 {m.mediaAssetCount}</div>
                    </td>
                    <td className="px-5 py-3">
                      {m.params === null ? (
                        <Badge>默认模板</Badge>
                      ) : m.params.length === 0 ? (
                        <Badge color="slate">无参数</Badge>
                      ) : (
                        <Badge color="brand">{m.params.length} 个自定义</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {m.enabled ? <Badge color="green">启用</Badge> : <Badge color="rose">禁用</Badge>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button title="渠道管理" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                          className={cn(
                            "w-8 h-8 rounded-lg inline-flex items-center justify-center",
                            expandedId === m.id ? "bg-brand-50 text-brand-700" : "hover:bg-slate-100 text-slate-600",
                          )}>
                          <Network className="w-4 h-4" />
                        </button>
                        <button title={m.enabled ? "禁用" : "启用"}
                          onClick={() => toggleEnabled(m)}
                          className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center">
                          {m.enabled ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button title="编辑" onClick={() => setEditing(m)}
                          className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button title="软删除（禁用）"
                          onClick={() => removeOne(m, "soft")}
                          className="w-8 h-8 rounded-lg hover:bg-amber-50 text-amber-600 inline-flex items-center justify-center">
                          <Eraser className="w-4 h-4" />
                        </button>
                        <button title="物理删除"
                          onClick={() => removeOne(m, "hard")}
                          className="w-8 h-8 rounded-lg hover:bg-rose-50 text-rose-600 inline-flex items-center justify-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === m.id && (
                    <tr className="border-t border-slate-100 bg-slate-50/70">
                      <td colSpan={8} className="p-5">
                        <ChannelsPanel model={m} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(creating || editing) && (
        <ModelEditor
          model={editing}
          providers={providers}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); showToast("已保存"); load(); }}
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

function ModelEditor({
  model, providers, onClose, onSaved,
}: {
  model: ModelRow | null;
  providers: Provider[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(model);

  const [form, setForm] = useState({
    slug: model?.slug || "",
    name: model?.name || "",
    type: model?.type || "image",
    providerId: model?.providerId || (providers[0]?.id || ""),
    description: model?.description || "",
    tags: model?.tags || "",
    contextLength: model?.contextLength ?? null as number | null,
    enabled: model?.enabled ?? true,
    inputPrice: model?.inputPrice ?? 0,
    outputPrice: model?.outputPrice ?? 0,
    unitPrice: model?.unitPrice ?? 0,
    unit: model?.unit || "",
  });

  // "自定义 provider" 模式
  const [newProvider, setNewProvider] = useState(false);
  const [customProvider, setCustomProvider] = useState({ name: "", logo: "🤖" });

  // 参数数组：null 表示"用默认模板"
  const [useCustomParams, setUseCustomParams] = useState<boolean>(() => model?.params !== null && model?.params !== undefined);
  const [paramsList, setParamsList] = useState<ParamDef[]>(() => model?.params ?? []);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const typeIsChat = form.type === "chat";

  const submit = async () => {
    setSaving(true); setErr("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim(),
        tags: form.tags.trim(),
        contextLength: form.contextLength,
        enabled: form.enabled,
        inputPrice: Number(form.inputPrice) || 0,
        outputPrice: Number(form.outputPrice) || 0,
        unitPrice: Number(form.unitPrice) || 0,
        unit: form.unit || null,
        params: typeIsChat ? [] : (useCustomParams ? paramsList : null),
      };
      if (newProvider) {
        payload.providerName = customProvider.name;
        payload.providerLogo = customProvider.logo;
      } else {
        payload.providerId = form.providerId;
      }

      if (isEdit) {
        const res = await fetch(`/api/admin/models/${model!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "保存失败");
      } else {
        payload.slug = form.slug.trim();
        const res = await fetch("/api/admin/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "创建失败");
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold">{isEdit ? `编辑：${model!.name}` : "新增模型"}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* ---------- 基本信息 ---------- */}
          <section>
            <SectionTitle>基本信息</SectionTitle>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Slug（调用时使用的标识）</Label>
                <Input
                  value={form.slug}
                  disabled={isEdit}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="如：gemini-3-pro-image-preview / grok-video-3"
                />
                {isEdit && <p className="text-xs text-slate-400 mt-1">slug 创建后不可修改</p>}
              </div>
              <div>
                <Label>中文/展示名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nano Banana Pro" />
              </div>
              <div>
                <Label>类型</Label>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full">
                  {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>
              <div>
                <Label>厂商</Label>
                {newProvider ? (
                  <div className="flex gap-2">
                    <Input placeholder="厂商名" value={customProvider.name}
                      onChange={(e) => setCustomProvider({ ...customProvider, name: e.target.value })} />
                    <Input placeholder="图标(emoji)" className="w-20" value={customProvider.logo}
                      onChange={(e) => setCustomProvider({ ...customProvider, logo: e.target.value })} />
                    <Button variant="ghost" size="sm" onClick={() => setNewProvider(false)} type="button">×</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })} className="flex-1">
                      {providers.map((p) => <option key={p.id} value={p.id}>{p.logo || "🤖"} {p.name}</option>)}
                    </Select>
                    <Button variant="outline" size="sm" type="button" onClick={() => setNewProvider(true)}>
                      <Plus className="w-3 h-3" /> 新厂商
                    </Button>
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <Label>描述</Label>
                <Textarea rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="一两句话说明模型特点" />
              </div>
              <div>
                <Label>标签（逗号分隔）</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="旗舰,推荐" />
              </div>
              <div>
                <Label>状态</Label>
                <div className="flex items-center gap-2 h-10">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                    对用户可见（启用）
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* ---------- 定价 ---------- */}
          <section>
            <SectionTitle>定价（人民币）</SectionTitle>
            {typeIsChat ? (
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>输入单价（每 1K tokens）</Label>
                  <Input type="number" step="0.0001" value={form.inputPrice}
                    onChange={(e) => setForm({ ...form, inputPrice: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>输出单价（每 1K tokens）</Label>
                  <Input type="number" step="0.0001" value={form.outputPrice}
                    onChange={(e) => setForm({ ...form, outputPrice: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>上下文长度（可选）</Label>
                  <Input type="number" value={form.contextLength ?? ""}
                    onChange={(e) => setForm({ ...form, contextLength: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>单价</Label>
                  <Input type="number" step="0.0001" value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>计价单位</Label>
                  <Select value={form.unit || ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full">
                    <option value="image">每次/每张（image）</option>
                    <option value="second">每秒（second）</option>
                    <option value="1K tokens">每 1K tokens</option>
                    <option value="">其他/不限</option>
                  </Select>
                </div>
                <div className="text-xs text-slate-500 p-3">
                  提示：视频常用 second；图片常用 image；参数选项（如 duration=10）会依据「参数编辑器」中的配置按倍率自动算价。
                </div>
              </div>
            )}
          </section>

          {/* ---------- 参数 ---------- */}
          {!typeIsChat && (
            <section>
              <SectionTitle>
                参数定义
                <span className="ml-2 inline-flex items-center gap-2 text-xs font-normal text-slate-500">
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={useCustomParams}
                      onChange={(e) => setUseCustomParams(e.target.checked)} />
                    自定义（否则使用默认模板）
                  </label>
                </span>
              </SectionTitle>
              {useCustomParams ? (
                <ParamsEditor paramsList={paramsList} setParamsList={setParamsList} />
              ) : (
                <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  未自定义 → 平台根据类型（image / video / audio）返回默认模板。
                  勾选「自定义」后可以逐项定义 params（会覆盖默认）。
                </div>
              )}
            </section>
          )}

          {err && (
            <div className="p-3 text-sm bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={submit} disabled={saving || !form.slug.trim() || !form.name.trim()}>
            {saving ? <Spinner /> : <Save className="w-4 h-4" />} 保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-semibold mb-3 flex items-center">{children}</h3>;
}

/* ========================= Params Editor ========================= */

function ParamsEditor({
  paramsList, setParamsList,
}: {
  paramsList: ParamDef[];
  setParamsList: (v: ParamDef[]) => void;
}) {
  const addParam = () => {
    setParamsList([
      ...paramsList,
      { name: "", label: "", type: "textarea", required: false, default: "", description: "", options: [] },
    ]);
  };
  const updateAt = (i: number, patch: Partial<ParamDef>) => {
    const next = paramsList.slice();
    next[i] = { ...next[i], ...patch };
    setParamsList(next);
  };
  const removeAt = (i: number) => {
    const next = paramsList.slice();
    next.splice(i, 1);
    setParamsList(next);
  };
  const moveAt = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= paramsList.length) return;
    const next = paramsList.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setParamsList(next);
  };

  return (
    <div className="space-y-3">
      {paramsList.length === 0 && (
        <div className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 text-center">
          当前模型没有参数。点击下面按钮添加第一个。
        </div>
      )}

      {paramsList.map((p, i) => (
        <ParamRow
          key={i}
          index={i}
          total={paramsList.length}
          def={p}
          onChange={(patch) => updateAt(i, patch)}
          onRemove={() => removeAt(i)}
          onMoveUp={() => moveAt(i, -1)}
          onMoveDown={() => moveAt(i, +1)}
        />
      ))}

      <div className="flex justify-center">
        <Button variant="outline" size="sm" onClick={addParam} type="button">
          <Plus className="w-4 h-4" /> 添加参数
        </Button>
      </div>
    </div>
  );
}

function ParamRow({
  index, total, def, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  index: number;
  total: number;
  def: ParamDef;
  onChange: (patch: Partial<ParamDef>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <GripVertical className="w-4 h-4 text-slate-400" />
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">#{index + 1}</span>
          <span className="font-medium">{def.label || def.name || "(未命名参数)"}</span>
          <Badge color="slate">{def.type}</Badge>
          {def.required && <Badge color="rose">必填</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="w-7 h-7 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30 inline-flex items-center justify-center">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="w-7 h-7 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30 inline-flex items-center justify-center">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setExpanded((v) => !v)}
            className="w-7 h-7 rounded hover:bg-slate-100 text-slate-500 inline-flex items-center justify-center">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={onRemove}
            className="w-7 h-7 rounded hover:bg-rose-50 text-rose-600 inline-flex items-center justify-center">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 grid md:grid-cols-2 gap-3">
          <div>
            <Label>name（英文 key）</Label>
            <Input value={def.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="aspectRatio" />
          </div>
          <div>
            <Label>label（中文显示）</Label>
            <Input value={def.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="图片比例" />
          </div>
          <div>
            <Label>type</Label>
            <Select value={def.type} onChange={(e) => onChange({ type: e.target.value as ParamType, options: e.target.value === "select" ? (def.options || []) : undefined })} className="w-full">
              <option value="textarea">textarea 文本输入</option>
              <option value="number">number 数字输入</option>
              <option value="select">select 下拉选择</option>
              <option value="upload">upload 文件 URL</option>
              <option value="switch">switch 开关</option>
            </Select>
          </div>
          <div>
            <Label>必填</Label>
            <div className="h-10 flex items-center">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={def.required} onChange={(e) => onChange({ required: e.target.checked })} />
                required
              </label>
            </div>
          </div>
          <div>
            <Label>default（默认值）</Label>
            {def.type === "switch" ? (
              <Select value={String(def.default)} onChange={(e) => onChange({ default: e.target.value === "true" })} className="w-full">
                <option value="false">false</option>
                <option value="true">true</option>
              </Select>
            ) : (
              <Input value={String(def.default ?? "")} onChange={(e) => onChange({ default: e.target.value })} placeholder="" />
            )}
          </div>
          <div className="md:col-span-2">
            <Label>description（提示说明）</Label>
            <Input value={def.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="说明这个参数做什么..." />
          </div>
          {def.type === "select" && (
            <div className="md:col-span-2">
              <OptionsEditor
                options={def.options || []}
                onChange={(opts) => {
                  // 同步 default 到当前的默认 option value
                  const defaultOpt = opts.find((o) => o.is_default);
                  onChange({ options: opts, default: defaultOpt ? defaultOpt.value : def.default });
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OptionsEditor({
  options, onChange,
}: {
  options: ParamOption[];
  onChange: (opts: ParamOption[]) => void;
}) {
  const addOpt = () => {
    onChange([...options, { label: "", value: "", is_default: options.length === 0 }]);
  };
  const updateOpt = (i: number, patch: Partial<ParamOption>) => {
    const next = options.slice();
    next[i] = { ...next[i], ...patch };
    // 只允许一个 is_default
    if (patch.is_default) {
      for (let k = 0; k < next.length; k++) if (k !== i) next[k] = { ...next[k], is_default: false };
    }
    onChange(next);
  };
  const removeOpt = (i: number) => {
    const next = options.slice();
    next.splice(i, 1);
    onChange(next);
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
      <div className="text-xs text-slate-500 mb-2 flex items-center justify-between">
        <span>options（每项：label / value / 是否默认）</span>
        <Button variant="outline" size="sm" type="button" onClick={addOpt}>
          <Plus className="w-3 h-3" /> 添加选项
        </Button>
      </div>
      {options.length === 0 ? (
        <div className="text-xs text-slate-400 py-3 text-center">至少添加一个选项</div>
      ) : (
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input placeholder="label（显示名）" value={o.label}
                onChange={(e) => updateOpt(i, { label: e.target.value })} className="flex-1" />
              <Input placeholder="value（传参值）" value={o.value}
                onChange={(e) => updateOpt(i, { value: e.target.value })} className="flex-1" />
              <label className="inline-flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                <input type="radio" name={`default-${i}-${options.length}`} checked={o.is_default}
                  onChange={(e) => updateOpt(i, { is_default: e.target.checked })} />
                默认
              </label>
              <button type="button" onClick={() => removeOpt(i)}
                className="w-8 h-8 rounded hover:bg-rose-50 text-rose-500 inline-flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================= Channels Panel ========================= */

type UpstreamOpt = { id: string; slug: string; name: string; enabled: boolean };

type OptionPriceRow = {
  id?: string;
  paramKey: string;
  optionValue: string;
  costUnitPrice: number;
  sellUnitPrice: number;
  enabled: boolean;
  note?: string | null;
};

type ChannelRow = {
  id: string;
  modelId: string;
  upstreamId: string;
  name: string;
  tier: string;
  upstreamModelSlug: string | null;
  hasApiKey: boolean;
  apiKeyMasked: string;
  costInputPrice: number;
  costOutputPrice: number;
  costUnitPrice: number;
  sellInputPrice: number;
  sellOutputPrice: number;
  sellUnitPrice: number;
  priority: number;
  enabled: boolean;
  enableFallback: boolean;
  notes: string | null;
  profitRate: number | null;
  optionPrices: OptionPriceRow[];
  upstream: { id: string; slug: string; name: string; enabled: boolean } | null;
};

// Nano Banana Pro（gemini-3-pro-image-preview）等图像模型的 imageSize 选项
const IMAGE_SIZE_OPTIONS = ["1K", "2K", "4K"] as const;

function ChannelsPanel({ model }: { model: ModelRow }) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [upstreams, setUpstreams] = useState<UpstreamOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const isChat = model.type === "chat";

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/admin/channels?modelId=${model.id}`, { cache: "no-store" }),
        fetch(`/api/admin/upstreams`, { cache: "no-store" }),
      ]);
      const ad = await a.json();
      const bd = await b.json();
      if (!a.ok) throw new Error(ad.error || "加载渠道失败");
      if (!b.ok) throw new Error(bd.error || "加载上游失败");
      setChannels(ad.channels);
      setUpstreams(bd.upstreams);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally { setLoading(false); }
  }, [model.id]);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    if (!confirm("删除此渠道？（历史 Usage 中的 channelId 会被清空，但记录保留）")) return;
    const res = await fetch(`/api/admin/channels/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "删除失败");
      return;
    }
    load();
  }

  async function toggleEnable(c: ChannelRow) {
    await fetch(`/api/admin/channels/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Network className="w-4 h-4 text-brand-600" /> 「{model.name}」的渠道 ({channels.length})
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> 刷新
          </Button>
          <Button size="sm" onClick={() => { setAdding(true); setEditingId(null); }} disabled={upstreams.length === 0}>
            <Plus className="w-3.5 h-3.5" /> 新建渠道
          </Button>
        </div>
      </div>

      {err && (
        <div className="p-2 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded">{err}</div>
      )}

      {upstreams.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded">
          尚未配置任何上游账号。请先到 <code>/admin/upstreams</code> 新建上游，然后回来为此模型挂渠道。
        </div>
      )}

      {adding && (
        <ChannelForm
          model={model}
          upstreams={upstreams}
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); load(); }}
        />
      )}

      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-normal">档位</th>
              <th className="px-3 py-2 text-left font-normal">上游</th>
              <th className="px-3 py-2 text-left font-normal">上游 model slug</th>
              <th className="px-3 py-2 text-right font-normal">成本</th>
              <th className="px-3 py-2 text-right font-normal">售价</th>
              <th className="px-3 py-2 text-right font-normal">利润率</th>
              <th className="px-3 py-2 text-right font-normal">优先级</th>
              <th className="px-3 py-2 text-left font-normal">状态</th>
              <th className="px-3 py-2 text-right font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && !adding && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400 text-xs">
                暂无渠道。点击「新建渠道」为此模型添加第一档。
              </td></tr>
            )}
            {channels.map((c) => (
              <Fragment key={c.id}>
              <tr className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium">{c.name}</div>
                  <Badge color={c.tier === "premium" ? "violet" : c.tier === "economy" ? "slate" : "brand"}>
                    {c.tier}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs">{c.upstream?.name || "(已删除)"}</div>
                  {c.upstream && !c.upstream.enabled && <Badge color="rose">上游停用</Badge>}
                  {c.hasApiKey ? (
                    <div className="text-[10px] text-brand-600 mt-0.5" title="使用渠道专用 API Key">
                      🔑 {c.apiKeyMasked || "专属 key"}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 mt-0.5">用上游默认 key</div>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {c.upstreamModelSlug || <span className="text-slate-300">（用 {model.slug}）</span>}
                </td>
                <td className="px-3 py-2 text-right text-xs font-mono">
                  {isChat
                    ? `¥${c.costInputPrice}/${c.costOutputPrice}`
                    : `¥${c.costUnitPrice}`}
                </td>
                <td className="px-3 py-2 text-right text-xs font-mono">
                  {isChat
                    ? `¥${c.sellInputPrice}/${c.sellOutputPrice}`
                    : `¥${c.sellUnitPrice}`}
                  {!isChat && c.optionPrices && c.optionPrices.length > 0 && (
                    <div className="text-[10px] text-violet-600 font-sans mt-0.5" title={c.optionPrices.map((o) => `${o.optionValue}:¥${o.sellUnitPrice}`).join(" · ")}>
                      含 {c.optionPrices.length} 档分辨率差价
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {c.profitRate === null ? (
                    <span className="text-slate-400">-</span>
                  ) : (
                    <Badge color={c.profitRate >= 0.2 ? "green" : c.profitRate >= 0 ? "amber" : "rose"}>
                      {(c.profitRate * 100).toFixed(1)}%
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">{c.priority}</td>
                <td className="px-3 py-2">
                  {c.enabled ? <Badge color="green">启用</Badge> : <Badge color="slate">停用</Badge>}
                  {c.enableFallback && <Badge color="amber" className="ml-1">可降级</Badge>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button title={c.enabled ? "停用" : "启用"} onClick={() => toggleEnable(c)}
                      className="w-7 h-7 rounded hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center">
                      {c.enabled ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button title="编辑" onClick={() => { setEditingId(c.id); setAdding(false); }}
                      className="w-7 h-7 rounded hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button title="删除" onClick={() => remove(c.id)}
                      className="w-7 h-7 rounded hover:bg-rose-50 text-rose-600 inline-flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
              {editingId === c.id && (
                <tr className="border-t border-slate-100 bg-slate-50/80">
                  <td colSpan={9} className="p-3">
                    <ChannelForm
                      model={model}
                      upstreams={upstreams}
                      editing={c}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => { setEditingId(null); load(); }}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {c_notesHint(channels)}
    </div>
  );
}

function c_notesHint(list: ChannelRow[]) {
  const n = list.filter((x) => x.notes && /待核对/.test(x.notes)).length;
  if (n === 0) return null;
  return (
    <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded">
      有 {n} 条渠道标记为「成本待核对」，请尽快确认实际上游成本，以免利润统计失真。
    </div>
  );
}

function ChannelForm({
  model, upstreams, editing, onCancel, onSaved,
}: {
  model: ModelRow;
  upstreams: UpstreamOpt[];
  editing?: ChannelRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isChat = model.type === "chat";
  const isImage = model.type === "image";
  const [form, setForm] = useState({
    upstreamId: editing?.upstreamId || upstreams[0]?.id || "",
    name: editing?.name || "标准版",
    tier: editing?.tier || "standard",
    upstreamModelSlug: editing?.upstreamModelSlug || "",
    apiKey: "",                                  // 空=不修改（编辑时）/ 用上游默认 key（新建时）
    clearApiKey: false,                          // 勾选=把现有专属 key 清掉，回退到上游默认 key
    costInputPrice: editing?.costInputPrice ?? 0,
    costOutputPrice: editing?.costOutputPrice ?? 0,
    costUnitPrice: editing?.costUnitPrice ?? 0,
    sellInputPrice: editing?.sellInputPrice ?? (isChat ? model.inputPrice : 0),
    sellOutputPrice: editing?.sellOutputPrice ?? (isChat ? model.outputPrice : 0),
    sellUnitPrice: editing?.sellUnitPrice ?? (!isChat ? model.unitPrice : 0),
    priority: editing?.priority ?? 100,
    enabled: editing?.enabled ?? true,
    enableFallback: editing?.enableFallback ?? true,
    notes: editing?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // 分辨率价格表（仅 image 模型可用）
  // 初始化：从 editing 取出现有覆盖；缺失的 size 默认关闭、价格用渠道基础价
  const [optionPrices, setOptionPrices] = useState<Record<string, { costUnitPrice: number; sellUnitPrice: number; enabled: boolean }>>(() => {
    const init: Record<string, { costUnitPrice: number; sellUnitPrice: number; enabled: boolean }> = {};
    for (const s of IMAGE_SIZE_OPTIONS) {
      const hit = editing?.optionPrices?.find((o) => o.paramKey === "imageSize" && o.optionValue === s);
      init[s] = hit
        ? { costUnitPrice: hit.costUnitPrice, sellUnitPrice: hit.sellUnitPrice, enabled: hit.enabled }
        : {
            costUnitPrice: editing?.costUnitPrice ?? 0,
            sellUnitPrice: editing?.sellUnitPrice ?? (!isChat ? model.unitPrice : 0),
            enabled: false,
          };
    }
    return init;
  });

  // 前端预估利润率
  const profit = (() => {
    if (isChat) {
      const cost = (+form.costInputPrice) + (+form.costOutputPrice);
      const sell = (+form.sellInputPrice) + (+form.sellOutputPrice);
      if (cost <= 0) return null;
      return (sell - cost) / cost;
    }
    if ((+form.costUnitPrice) <= 0) return null;
    return ((+form.sellUnitPrice) - (+form.costUnitPrice)) / (+form.costUnitPrice);
  })();

  async function save() {
    setSaving(true); setErr("");
    try {
      const url = editing ? `/api/admin/channels/${editing.id}` : `/api/admin/channels`;
      const method = editing ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        upstreamId: form.upstreamId,
        name: form.name,
        tier: form.tier,
        upstreamModelSlug: form.upstreamModelSlug || null,
        costInputPrice: +form.costInputPrice,
      };
      // apiKey 处理：
      //  - 新建时：input 有值就写入；空则不传（=NULL=用上游默认 key）
      //  - 编辑时：勾了"清空"优先级最高；否则只有 input 非空才 PATCH（避免误覆盖为空串）
      if (editing) {
        if (form.clearApiKey) body.apiKey = null;
        else if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();
      } else if (form.apiKey.trim()) {
        body.apiKey = form.apiKey.trim();
      }
      Object.assign(body, {
        costOutputPrice: +form.costOutputPrice,
        costUnitPrice: +form.costUnitPrice,
        sellInputPrice: +form.sellInputPrice,
        sellOutputPrice: +form.sellOutputPrice,
        sellUnitPrice: +form.sellUnitPrice,
        priority: +form.priority,
        enabled: form.enabled,
        enableFallback: form.enableFallback,
        notes: form.notes || null,
      });
      if (!editing) body.modelId = model.id;

      // 分辨率级定价：只提交 enabled 的条目
      if (isImage) {
        body.optionPrices = IMAGE_SIZE_OPTIONS
          .filter((s) => optionPrices[s]?.enabled)
          .map((s) => ({
            paramKey: "imageSize",
            optionValue: s,
            costUnitPrice: +optionPrices[s].costUnitPrice,
            sellUnitPrice: +optionPrices[s].sellUnitPrice,
            enabled: true,
          }));
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "保存失败"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Card className="p-4 space-y-3 border-brand-200 shadow-md">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">{editing ? "编辑渠道" : "新建渠道"}</div>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-4 h-4" /></Button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label>档位名</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="高级版 / 标准版 / 经济版" />
        </div>
        <div>
          <Label>档位类型</Label>
          <Select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
            <option value="premium">premium 高级</option>
            <option value="standard">standard 标准</option>
            <option value="economy">economy 经济</option>
            <option value="custom">custom 自定义</option>
          </Select>
        </div>
        <div>
          <Label>上游账号</Label>
          <Select value={form.upstreamId} onChange={(e) => setForm({ ...form, upstreamId: e.target.value })}>
            {upstreams.map((u) => (
              <option key={u.id} value={u.id}>{u.name}{!u.enabled ? "（停用）" : ""}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>上游 model slug（留空则用 {model.slug}）</Label>
          <Input value={form.upstreamModelSlug} onChange={(e) => setForm({ ...form, upstreamModelSlug: e.target.value })} placeholder={model.slug} />
        </div>
        <div className="md:col-span-3">
          <Label className="flex items-center gap-2">
            <span>渠道专用 API Key（可选）</span>
            {editing?.hasApiKey && (
              <span className="inline-flex items-center gap-1 text-[10px] text-brand-600 font-normal">
                🔑 当前已设置：{editing.apiKeyMasked || "******"}
              </span>
            )}
          </Label>
          <div className="flex gap-2 items-start">
            <Input
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value, clearApiKey: false })}
              placeholder={editing?.hasApiKey ? "留空 = 不修改现有 key" : "留空 = 使用上游默认 key"}
              className="flex-1"
            />
            {editing?.hasApiKey && (
              <label className="inline-flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap h-10">
                <input
                  type="checkbox"
                  checked={form.clearApiKey}
                  onChange={(e) => setForm({ ...form, clearApiKey: e.target.checked, apiKey: "" })}
                />
                清空（回退到上游默认 key）
              </label>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            用于「同一 baseUrl 但多把 key、每把价格不同」场景。保存后前端只会看到掩码，明文不会返回。
          </p>
        </div>
        <div>
          <Label>优先级（越小越优先）</Label>
          <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <Label>开关</Label>
          <div className="flex items-center gap-4 h-10">
            <label className="inline-flex items-center gap-1 text-sm">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> 启用
            </label>
            <label className="inline-flex items-center gap-1 text-sm">
              <input type="checkbox" checked={form.enableFallback} onChange={(e) => setForm({ ...form, enableFallback: e.target.checked })} /> 故障降级
            </label>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500">成本价（付给上游）</div>
          {isChat ? (
            <>
              <div>
                <Label>输入价（元 / 1K tokens）</Label>
                <Input type="number" step="0.0001" value={form.costInputPrice}
                  onChange={(e) => setForm({ ...form, costInputPrice: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>输出价（元 / 1K tokens）</Label>
                <Input type="number" step="0.0001" value={form.costOutputPrice}
                  onChange={(e) => setForm({ ...form, costOutputPrice: parseFloat(e.target.value) || 0 })} />
              </div>
            </>
          ) : (
            <div>
              <Label>单价（元 / 张或秒）</Label>
              <Input type="number" step="0.0001" value={form.costUnitPrice}
                onChange={(e) => setForm({ ...form, costUnitPrice: parseFloat(e.target.value) || 0 })} />
            </div>
          )}
        </div>
        <div className="space-y-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
          <div className="text-xs font-medium text-emerald-700">售价（用户扣费）</div>
          {isChat ? (
            <>
              <div>
                <Label>输入价（元 / 1K tokens）</Label>
                <Input type="number" step="0.0001" value={form.sellInputPrice}
                  onChange={(e) => setForm({ ...form, sellInputPrice: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>输出价（元 / 1K tokens）</Label>
                <Input type="number" step="0.0001" value={form.sellOutputPrice}
                  onChange={(e) => setForm({ ...form, sellOutputPrice: parseFloat(e.target.value) || 0 })} />
              </div>
            </>
          ) : (
            <div>
              <Label>单价（元 / 张或秒）</Label>
              <Input type="number" step="0.0001" value={form.sellUnitPrice}
                onChange={(e) => setForm({ ...form, sellUnitPrice: parseFloat(e.target.value) || 0 })} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div>
          当前预估利润率：
          {profit === null
            ? <span className="text-slate-400 ml-1">-</span>
            : <Badge color={profit >= 0.2 ? "green" : profit >= 0 ? "amber" : "rose"} className="ml-1">
                {(profit * 100).toFixed(1)}%
              </Badge>}
          <span className="ml-2 text-slate-400">保存时后端会按模态最低利润率严格校验</span>
        </div>
      </div>

      {isImage && (
        <div className="p-3 bg-violet-50/60 rounded-lg border border-violet-200 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-violet-700">分辨率差异化定价（可选）</div>
              <div className="text-[11px] text-violet-500">
                勾选某分辨率即对该渠道的该分辨率启用专属价；未勾选 → 用上表基础价。同一模型挂到不同渠道，各自的分辨率价可以不一样。
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 text-left font-normal">启用</th>
                  <th className="py-1 text-left font-normal">imageSize</th>
                  <th className="py-1 text-right font-normal">成本 ¥/张</th>
                  <th className="py-1 text-right font-normal">售价 ¥/张</th>
                  <th className="py-1 text-right font-normal">利润率</th>
                </tr>
              </thead>
              <tbody>
                {IMAGE_SIZE_OPTIONS.map((s) => {
                  const row = optionPrices[s];
                  const rate = row.costUnitPrice > 0
                    ? (row.sellUnitPrice - row.costUnitPrice) / row.costUnitPrice
                    : null;
                  return (
                    <tr key={s} className="border-t border-violet-100">
                      <td className="py-1.5">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) => setOptionPrices((p) => ({ ...p, [s]: { ...p[s], enabled: e.target.checked } }))}
                        />
                      </td>
                      <td className="py-1.5 font-medium">{s}</td>
                      <td className="py-1.5 text-right">
                        <Input type="number" step="0.0001" value={row.costUnitPrice}
                          disabled={!row.enabled}
                          onChange={(e) => setOptionPrices((p) => ({ ...p, [s]: { ...p[s], costUnitPrice: parseFloat(e.target.value) || 0 } }))}
                          className="h-7 text-xs text-right w-24 inline-block" />
                      </td>
                      <td className="py-1.5 text-right">
                        <Input type="number" step="0.0001" value={row.sellUnitPrice}
                          disabled={!row.enabled}
                          onChange={(e) => setOptionPrices((p) => ({ ...p, [s]: { ...p[s], sellUnitPrice: parseFloat(e.target.value) || 0 } }))}
                          className="h-7 text-xs text-right w-24 inline-block" />
                      </td>
                      <td className="py-1.5 text-right">
                        {!row.enabled
                          ? <span className="text-slate-300">用基础价</span>
                          : rate === null
                            ? <span className="text-slate-400">-</span>
                            : <Badge color={rate >= 0.2 ? "green" : rate >= 0 ? "amber" : "rose"}>{(rate * 100).toFixed(1)}%</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <Label>备注</Label>
        <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="例如：促销档，成本来自新账号..." />
      </div>

      {err && <div className="text-xs text-rose-600">{err}</div>}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>取消</Button>
        <Button size="sm" onClick={save} disabled={saving || !form.upstreamId || !form.name}>
          {saving ? <Spinner /> : <Save className="w-3.5 h-3.5" />} 保存
        </Button>
      </div>
    </Card>
  );
}
