"use client";
import { useEffect, useState } from "react";
import { Card, Badge, Button, Input, Spinner } from "@/components/ui";
import { KeyRound, Search, Lock, Eye, X } from "lucide-react";
import { formatMoney, relativeTime } from "@/lib/utils";

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopeMode: string;
  bindingCount: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
};

type Binding = {
  channelId: string;
  order: number;
  channel: {
    id: string;
    name: string;
    tier: string;
    enabled: boolean;
    sellInputPrice: number;
    sellOutputPrice: number;
    sellUnitPrice: number;
    model: { id: string; slug: string; name: string; type: string };
    upstream: { id: string; slug: string; name: string };
  };
};

export default function ApiKeysClient() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [viewing, setViewing] = useState<KeyRow | null>(null);
  const [bindings, setBindings] = useState<Binding[] | null>(null);
  const [bindingsLoading, setBindingsLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/apikeys?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setKeys(d.keys || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  async function openDetail(k: KeyRow) {
    setViewing(k);
    setBindings(null);
    setBindingsLoading(true);
    try {
      const r = await fetch(`/api/admin/apikeys/${k.id}`);
      const d = await r.json();
      setBindings(d.bindings || []);
    } finally { setBindingsLoading(false); }
  }

  const grouped = bindings
    ? Object.values(
        bindings.reduce((acc: Record<string, { model: Binding["channel"]["model"]; items: Binding[] }>, b) => {
          const key = b.channel.model.id;
          if (!acc[key]) acc[key] = { model: b.channel.model, items: [] };
          acc[key].items.push(b);
          return acc;
        }, {})
      )
    : [];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="w-6 h-6 text-brand-600" /> API Keys 管理
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          查看所有用户的 Key，检查渠道绑定情况，用于排障或合规审计。该页面为只读。
        </p>
      </div>

      <Card className="p-4 flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="按邮箱 / Key 名称 / 前缀搜索..."
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") reload(); }}
          />
        </div>
        <Button onClick={reload}>搜索</Button>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">用户</th>
                <th className="text-left">Key 名称</th>
                <th className="text-left">前缀</th>
                <th className="text-center">模式</th>
                <th className="text-center">绑定数</th>
                <th className="text-left">上次使用</th>
                <th className="text-left">创建</th>
                <th className="text-center">状态</th>
                <th className="text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400"><Spinner /> 加载中</td></tr>
              )}
              {!loading && keys.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">暂无数据</td></tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div>{k.user.name || k.user.email}</div>
                    <div className="text-xs text-slate-400">{k.user.email}</div>
                  </td>
                  <td>{k.name}</td>
                  <td className="font-mono text-xs">{k.keyPrefix}****</td>
                  <td className="text-center">
                    {k.scopeMode === "restricted" ? (
                      <Badge color="violet"><Lock className="w-3 h-3 mr-0.5" />限定</Badge>
                    ) : (
                      <Badge color="slate">全开</Badge>
                    )}
                  </td>
                  <td className="text-center">{k.bindingCount}</td>
                  <td className="text-xs text-slate-500">{k.lastUsedAt ? relativeTime(k.lastUsedAt) : "—"}</td>
                  <td className="text-xs text-slate-500">{relativeTime(k.createdAt)}</td>
                  <td className="text-center">
                    {k.revokedAt ? <Badge color="rose">已撤销</Badge> : <Badge color="green">有效</Badge>}
                  </td>
                  <td className="text-center">
                    <Button size="sm" variant="outline" onClick={() => openDetail(k)}>
                      <Eye className="w-3.5 h-3.5" /> 查看
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {viewing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b">
              <div>
                <div className="font-bold text-lg">{viewing.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {viewing.user.email} · <span className="font-mono">{viewing.keyPrefix}****</span>
                </div>
              </div>
              <button
                onClick={() => { setViewing(null); setBindings(null); }}
                className="p-2 rounded-lg hover:bg-slate-100"
              ><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">模式：</span>
                {viewing.scopeMode === "restricted" ? (
                  <Badge color="violet"><Lock className="w-3 h-3 mr-0.5" />restricted（仅允许下列渠道）</Badge>
                ) : (
                  <Badge color="slate">open（全部启用渠道）</Badge>
                )}
              </div>

              {bindingsLoading ? (
                <div className="text-center text-slate-400 py-10"><Spinner /></div>
              ) : grouped.length === 0 ? (
                <div className="text-sm text-slate-500 py-10 text-center">
                  {viewing.scopeMode === "open"
                    ? "此 Key 未绑定任何渠道 —— 当前以 open 模式可访问所有启用渠道。"
                    : "⚠️ 此 Key 为 restricted 模式但未绑定任何渠道，调用会全部失败。"}
                </div>
              ) : (
                grouped.map((g) => (
                  <div key={g.model.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="font-semibold">{g.model.name}</div>
                      <Badge color="slate">{g.model.type}</Badge>
                      <span className="text-xs text-slate-400">{g.items.length} 条渠道</span>
                    </div>
                    <div className="space-y-1">
                      {g.items.map((b, idx) => (
                        <div key={b.channelId} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                          <span className="w-6 text-center text-xs font-mono text-brand-600">{idx + 1}</span>
                          <div className="flex-1">
                            <div>{b.channel.name}</div>
                            <div className="text-xs text-slate-500">
                              {b.channel.upstream.name} · 售价 ¥{formatMoney(b.channel.sellUnitPrice || b.channel.sellInputPrice, 4)}
                              {!b.channel.enabled && <span className="ml-2 text-rose-500">[渠道已禁用]</span>}
                            </div>
                          </div>
                          <Badge color="slate">{b.channel.tier}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
