"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input, Label, Badge } from "@/components/ui";
import { Key, Plus, Copy, Trash2, Shuffle, Lock } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import BindingsModal from "./BindingsModal";

type K = {
  id: string; name: string; keyPrefix: string;
  lastUsedAt: string | null; revokedAt: string | null; createdAt: string;
};

export default function KeysClient({ initial }: { initial: K[] }) {
  const [keys, setKeys] = useState<K[]>(initial);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [bindingOf, setBindingOf] = useState<K | null>(null);

  // scopeMode + channelCount per key（用于列表展示）
  const [summary, setSummary] = useState<Record<string, { scopeMode: string; count: number }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: Record<string, { scopeMode: string; count: number }> = {};
      await Promise.all(
        keys.filter((k) => !k.revokedAt).map(async (k) => {
          try {
            const r = await fetch(`/api/go/v2/keys/${k.id}/bindings`);
            if (!r.ok) return;
            const d = await r.json();
            entries[k.id] = { scopeMode: d.scopeMode, count: (d.bindings || []).length };
          } catch { /* ignore */ }
        })
      );
      if (!cancelled) setSummary(entries);
    })();
    return () => { cancelled = true; };
  }, [keys]);

  async function create() {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/go/v2/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setKeys((ks) => [data.key, ...ks]);
        setJustCreated(data.fullKey);
        setName("");
      } else alert(data.error || "创建失败");
    } finally { setCreating(false); }
  }

  async function revoke(id: string) {
    if (!confirm("确定撤销这个 Key 吗？撤销后无法恢复。")) return;
    const res = await fetch(`/api/go/v2/keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((ks) => ks.map((k) => k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k));
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    alert("已复制到剪贴板");
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-slate-500 mt-1 text-sm">用于在你的代码中调用 AI Hub 的统一 API（OpenAI 兼容）</p>
      </div>

      {justCreated && (
        <Card className="p-5 bg-amber-50 border-amber-200">
          <div className="font-semibold text-amber-800">🔒 请立刻复制并妥善保存你的 Key，此后将无法再次查看：</div>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-white rounded-lg font-mono text-sm break-all">{justCreated}</code>
            <Button size="sm" onClick={() => copy(justCreated)}><Copy className="w-4 h-4" /></Button>
          </div>
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={() => setJustCreated(null)}>我已保存</Button>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="font-semibold mb-3">创建新 Key</div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label>用途备注</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：我的网站 / 生产环境 / 测试" />
          </div>
          <div className="flex items-end">
            <Button onClick={create} disabled={creating || !name.trim()}>
              <Plus className="w-4 h-4" /> 创建
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="font-semibold mb-3">我的 Keys</div>
        {keys.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">暂无 Key</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => (
              <div key={k.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><Key className="w-4 h-4 text-slate-500" /></div>
                  <div className="min-w-0">
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{k.keyPrefix}********</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      创建于 {relativeTime(k.createdAt)}
                      {k.lastUsedAt && ` · 上次使用 ${relativeTime(k.lastUsedAt)}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {k.revokedAt ? <Badge color="rose">已撤销</Badge> : <Badge color="green">有效</Badge>}
                  {!k.revokedAt && summary[k.id] && (
                    summary[k.id].scopeMode === "restricted" ? (
                      <Badge color="violet">
                        <Lock className="w-3 h-3 mr-0.5" />
                        限定 {summary[k.id].count}
                      </Badge>
                    ) : (
                      <Badge color="slate">全开</Badge>
                    )
                  )}
                  {!k.revokedAt && (
                    <Button size="sm" variant="outline" onClick={() => setBindingOf(k)}>
                      <Shuffle className="w-4 h-4" />
                      <span className="hidden md:inline ml-1">渠道绑定</span>
                    </Button>
                  )}
                  {!k.revokedAt && (
                    <Button size="sm" variant="outline" onClick={() => revoke(k.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {bindingOf && (
        <BindingsModal
          apiKeyId={bindingOf.id}
          apiKeyName={bindingOf.name}
          onClose={() => setBindingOf(null)}
          onSaved={() => {
            // 重新拉 summary
            fetch(`/api/go/v2/keys/${bindingOf.id}/bindings`).then((r) => r.json()).then((d) => {
              setSummary((s) => ({ ...s, [bindingOf.id]: { scopeMode: d.scopeMode, count: (d.bindings || []).length } }));
            });
          }}
        />
      )}

      <Card className="p-6">
        <div className="font-semibold mb-2">如何使用？</div>
        <p className="text-sm text-slate-600 mb-3">完全兼容 OpenAI SDK，只需替换 <code className="px-1 bg-slate-100 rounded text-xs">base_url</code> 和 <code className="px-1 bg-slate-100 rounded text-xs">api_key</code>：</p>
        <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 text-xs overflow-x-auto">
{`curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer sk-aihub-xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role":"user","content":"你好"}]
  }'`}
        </pre>
      </Card>
    </div>
  );
}
