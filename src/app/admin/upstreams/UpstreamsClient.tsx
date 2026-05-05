"use client";
import { Fragment, useState } from "react";
import { Button, Card, Input, Label, Select, Spinner, Badge } from "@/components/ui";
import { Cloud, Plus, PlugZap, Save, Trash2, X, KeyRound, Link2 } from "lucide-react";

export type UpstreamRow = {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  maskedKey: string;
  hasKey: boolean;
  enabled: boolean;
  priority: number;
  channelCount: number;
};

export default function UpstreamsClient({ initial }: { initial: UpstreamRow[] }) {
  const [list, setList] = useState<UpstreamRow[]>(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string>("");
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  async function reload() {
    const res = await fetch("/api/admin/upstreams", { cache: "no-store" });
    const data = await res.json();
    setList(data.upstreams);
  }

  async function test(id: string) {
    setTestResult((m) => ({ ...m, [id]: { ok: false, msg: "测试中…" } }));
    const res = await fetch(`/api/admin/upstreams/${id}`, { method: "POST" });
    const data = await res.json();
    setTestResult((m) => ({
      ...m,
      [id]: data.ok
        ? { ok: true, msg: `HTTP ${data.status} · ${String(data.sample || "").slice(0, 80)}…` }
        : { ok: false, msg: data.error || `HTTP ${data.status}` },
    }));
  }

  async function remove(id: string) {
    if (!confirm("确认删除此上游？")) return;
    const res = await fetch(`/api/admin/upstreams/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "删除失败");
      return;
    }
    reload();
  }

  async function createJmpbPreset() {
    setErr("");
    const exists = list.some((u) => u.slug === "jmpb-szb");
    if (exists) {
      setErr("已存在 slug=jmpb-szb 的上游，请直接编辑 API Key 后测试连通性");
      return;
    }
    const res = await fetch("/api/admin/upstreams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "jmpb-szb",
        name: "中转站 · jmpb-szb",
        baseUrl: "https://jmpb-szb.com",
        enabled: true,
        priority: 120,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "创建中转站上游失败");
      return;
    }
    await reload();
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cloud className="w-6 h-6 text-brand-600" />
            上游账号
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            上游 = 可调用的聚合账号或官方直连 Key。每条渠道会绑定到一个上游。
          </p>
        </div>
        <Button onClick={() => { setCreating(true); setEditingId(null); }}>
          <Plus className="w-4 h-4" /> 新建上游
        </Button>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <Card className="p-5 space-y-3">
        <div className="font-semibold text-slate-800">中转站基本介绍（独立分类）</div>
        <div className="text-sm text-slate-600">
          可新增 <code className="px-1 bg-slate-100 rounded">jmpb-szb</code> 作为独立上游分类使用；注册福利：新用户赠送 $0.2，最低充值 $1。
        </div>
        <div className="text-sm text-slate-600">
          Base URL 可按客户端兼容性依次尝试：
          <code className="ml-1 px-1 bg-slate-100 rounded">https://jmpb-szb.com</code> /
          <code className="ml-1 px-1 bg-slate-100 rounded">https://jmpb-szb.com/v1</code> /
          <code className="ml-1 px-1 bg-slate-100 rounded">https://jmpb-szb.com/v1/chat/completions</code>
        </div>
        <div className="text-sm text-slate-600">
          配置流程：获取令牌（后台令牌页添加 token）→ 填写 Base URL + API Key → 在本页点“测试”做 ping → 去模型渠道页绑定。
        </div>
        <div>
          <Button variant="outline" onClick={createJmpbPreset}>
            <Plus className="w-4 h-4" /> 一键新增 jmpb-szb 上游
          </Button>
        </div>
      </Card>

      {creating && (
        <UpstreamForm
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload(); }}
          setErr={setErr}
        />
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Slug / 名称</th>
              <th className="px-4 py-3 font-medium">Base URL</th>
              <th className="px-4 py-3 font-medium">API Key</th>
              <th className="px-4 py-3 font-medium">优先级</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">渠道数</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">尚未配置上游</td></tr>
            )}
            {list.map((u) => (
              <Fragment key={u.id}>
                <tr className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-500">{u.slug}</div>
                    <div className="font-medium">{u.name}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.baseUrl}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {u.hasKey
                      ? <span className="text-slate-600">{u.maskedKey}</span>
                      : <span className="text-rose-500">未配置</span>}
                  </td>
                  <td className="px-4 py-3">{u.priority}</td>
                  <td className="px-4 py-3">
                    <Badge color={u.enabled ? "green" : "slate"}>
                      {u.enabled ? "启用" : "停用"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.channelCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => test(u.id)} disabled={!u.hasKey}>
                        <PlugZap className="w-3.5 h-3.5" /> 测试
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(u.id); setCreating(false); }}>
                        编辑
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(u.id)} disabled={u.channelCount > 0 || u.slug === "default"}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
                {testResult[u.id] && (
                  <tr>
                    <td colSpan={7} className="px-4 pb-2">
                      <div className={`text-xs px-3 py-2 rounded border ${testResult[u.id].ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                        {testResult[u.id].msg}
                      </div>
                    </td>
                  </tr>
                )}
                {editingId === u.id && (
                  <tr>
                    <td colSpan={7} className="p-4 bg-slate-50/70">
                      <UpstreamForm
                        editing={u}
                        onCancel={() => setEditingId(null)}
                        onSaved={() => { setEditingId(null); reload(); }}
                        setErr={setErr}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5 text-sm text-slate-600 space-y-1">
        <div className="font-semibold text-slate-800">提示</div>
        <div>· slug=<code className="px-1 bg-slate-100 rounded">default</code> 为系统默认上游，不可删除（可停用）。</div>
        <div>· 新建上游后，在 <code className="px-1 bg-slate-100 rounded">模型 &amp; 渠道</code> 页为模型挂上新渠道并绑定此上游。</div>
      </Card>
    </div>
  );
}

function UpstreamForm({
  editing,
  onCancel,
  onSaved,
  setErr,
}: {
  editing?: UpstreamRow;
  onCancel: () => void;
  onSaved: () => void;
  setErr: (s: string) => void;
}) {
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? "https://api.ai6700.com");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);
  const [priority, setPriority] = useState(editing?.priority ?? 100);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setErr("");
    try {
      const url = editing ? `/api/admin/upstreams/${editing.id}` : `/api/admin/upstreams`;
      const method = editing ? "PATCH" : "POST";
      const body: Record<string, unknown> = { name, baseUrl, enabled, priority };
      if (!editing) body.slug = slug;
      if (apiKey.trim()) body.apiKey = apiKey.trim();
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
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{editing ? "编辑上游" : "新建上游"}</div>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Slug</Label>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="ai6700-main"
            disabled={!!editing}
          />
        </div>
        <div>
          <Label>显示名</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ai6700 主账号" />
        </div>
        <div className="md:col-span-2">
          <Label><Link2 className="inline w-3.5 h-3.5 mr-1" /> Base URL</Label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.ai6700.com" />
        </div>
        <div className="md:col-span-2">
          <Label><KeyRound className="inline w-3.5 h-3.5 mr-1" /> API Key {editing ? "（留空不修改）" : ""}</Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={editing ? `当前 ${editing.maskedKey || "未配置"}` : "sk-..."} />
        </div>
        <div>
          <Label>优先级（数字越小越优先）</Label>
          <Input type="number" value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <Label>状态</Label>
          <Select value={enabled ? "1" : "0"} onChange={(e) => setEnabled(e.target.value === "1")}>
            <option value="1">启用</option>
            <option value="0">停用</option>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !name || !baseUrl || (!editing && !slug)}>
          {saving ? <Spinner /> : <Save className="w-4 h-4" />} 保存
        </Button>
        <Button variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </Card>
  );
}
