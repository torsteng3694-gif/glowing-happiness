"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label, Spinner, Badge } from "@/components/ui";
import { Cloud, KeyRound, Link2, Save, PlugZap, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

type Info = { configured: boolean; baseUrl: string; maskedKey: string; enabled: boolean };

export default function SettingsClient({ initial }: { initial: Info }) {
  const [info, setInfo] = useState<Info>(initial);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true); setErr(""); setTestResult(null);
    try {
      const body: any = { baseUrl, enabled };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = await fetch("/api/admin/settings/upstream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "保存失败"); return; }
      setInfo({
        configured: data.configured,
        baseUrl: data.baseUrl,
        maskedKey: data.maskedKey,
        enabled: data.enabled,
      });
      setApiKey("");
    } finally { setSaving(false); }
  }

  async function test() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/upstream", { method: "PUT" });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, msg: `连通 (HTTP ${data.status})  示例：${String(data.sample || "").slice(0, 120)}…` });
      } else {
        setTestResult({ ok: false, msg: data.error || `HTTP ${data.status}` });
      }
    } finally { setTesting(false); }
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">平台设置</h1>
        <p className="text-slate-500 text-sm mt-1">
          配置默认上游聚合渠道（如 <code className="px-1 bg-slate-100 rounded text-xs">ai6700.com</code>）。
          本页只用于维护 <code className="px-1 bg-slate-100 rounded text-xs">slug = default</code> 的上游兼容配置；
          新架构下请直接到「上游账号」和「定价策略」统一管理。
        </p>
      </div>

      <Card className="p-4 bg-brand-50/60 border-brand-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-brand-800">
          <div className="font-semibold mb-1">多渠道市场已上线</div>
          <div className="text-xs text-brand-700/80">
            每个模型可挂多个渠道（上游 + 成本 / 售价 / 档位），建议在对应入口管理：
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/upstreams">
            <Button variant="outline" size="sm">上游账号 <ArrowRight className="w-3.5 h-3.5" /></Button>
          </Link>
          <Link href="/admin/models">
            <Button variant="outline" size="sm">模型 &amp; 渠道 <ArrowRight className="w-3.5 h-3.5" /></Button>
          </Link>
          <Link href="/admin/pricing">
            <Button variant="outline" size="sm">定价策略 <ArrowRight className="w-3.5 h-3.5" /></Button>
          </Link>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">上游聚合渠道</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {info.configured
                ? <>已配置 · 当前 key: <span className="font-mono">{info.maskedKey}</span> ·
                    <Badge color={info.enabled ? "green" : "slate"} className="ml-2">
                      {info.enabled ? "已启用" : "已禁用"}
                    </Badge></>
                : "尚未配置"}
            </div>
          </div>
        </div>

        <div>
          <Label><Link2 className="w-3.5 h-3.5 inline mr-1" /> Base URL</Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.ai6700.com"
          />
          <div className="text-xs text-slate-400 mt-1">不要以 / 结尾。必须是兼容 OpenAI 格式的聚合网关。</div>
        </div>

        <div>
          <Label><KeyRound className="w-3.5 h-3.5 inline mr-1" /> API Key</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={info.configured ? `留空不修改（当前 ${info.maskedKey}）` : "sk-..."}
          />
          <div className="text-xs text-slate-400 mt-1">写入后服务器端保存，前端仅以掩码形式展示。</div>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            启用上游（取消勾选时回落至 mock / 本地 provider）
          </label>
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Save className="w-4 h-4" />} 保存
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || !info.configured}>
            {testing ? <Spinner /> : <PlugZap className="w-4 h-4" />} 测试连通
          </Button>
        </div>

        {err && <div className="text-sm text-rose-600">{err}</div>}

        {testResult && (
          <div className={`flex gap-2 items-start p-3 rounded-lg text-sm ${testResult.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
            {testResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <div className="break-all">{testResult.msg}</div>
          </div>
        )}
      </Card>

      <Card className="p-6 text-sm text-slate-600 space-y-2 leading-relaxed">
        <div className="font-semibold text-slate-800">工作原理</div>
        <div>1. 用户选择模型 + 渠道（档位）后，平台按 <b>渠道优先级</b> 调用对应的上游账号。若失败且渠道开启了 fallback，自动换到下一条渠道。</div>
        <div>2. 计费走「渠道售价」，内部同时记录「渠道成本价（realCost）」用于利润报表。</div>
        <div>3. 视频 / 异步媒体任务走 <code className="px-1 bg-slate-100 rounded text-xs">POST /v1/media/generate</code> + 内部 5s 轮询 <code className="px-1 bg-slate-100 rounded text-xs">/v1/skills/task-status</code> 直至 <code>is_final=true</code>。</div>
        <div>4. 本页的配置作为兼容字段保留；实际运行使用「上游账号」里 <code className="px-1 bg-slate-100 rounded text-xs">slug = default</code> 记录的 baseUrl / apiKey。</div>
        <div>5. 最低利润率（售价 vs 成本）在 <Link href="/admin/pricing" className="underline">定价策略</Link> 中设置；不达标的渠道会被阻止保存。</div>
      </Card>
    </div>
  );
}
