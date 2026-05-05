"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Period = "today" | "yesterday" | "week" | "month";

type Overview = {
  period: Period;
  summary: {
    totalIncome: number;
    monthIncome: number;
    todayIncome: number;
    withdrawable: number;
  };
  operating: { profitYuan: number; salesYuan: number; activeUsers: number };
  funnel: {
    registered: number;
    recharged: number;
    active: number;
    rechargeConversion: number;
    activeConversion: number;
  };
  topUsers: { id: string; name: string | null; email: string; amount: number }[];
  topModels: { name: string; amount: number }[];
};

const PERIOD_BTN: { key: Period; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨天" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
];

export default function AgentDashboardClient() {
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/agent/overview?period=${period}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "加载失败");
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const operatingChart =
    data &&
    [
      { name: "收益(元)", value: Math.round(data.operating.profitYuan * 100) / 100 },
      { name: "销售额(元)", value: Math.round(data.operating.salesYuan * 100) / 100 },
    ];

  const maxRank = (items: { amount: number }[]) =>
    items.length ? Math.max(...items.map((x) => x.amount), 1) : 1;

  return (
    <div className="space-y-6">
      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> 加载数据中…
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard
              title="累计收入"
              value={data.summary.totalIncome}
              className="bg-gradient-to-br from-orange-400 to-orange-600 text-white"
            />
            <SummaryCard
              title="本月收益"
              value={data.summary.monthIncome}
              className="bg-gradient-to-br from-cyan-400 to-teal-600 text-white"
            />
            <SummaryCard
              title="今日收益"
              value={data.summary.todayIncome}
              className="bg-gradient-to-br from-emerald-400 to-green-600 text-white"
            />
            <SummaryCard
              title="可提现金额"
              sub="与本月佣金同步（提现流水对接前）"
              value={data.summary.withdrawable}
              className="bg-gradient-to-br from-violet-500 to-indigo-700 text-white"
            />
          </div>

          <Card className="p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mb-4">
              <div>
                <div className="text-sm font-medium text-slate-800">数据时段</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  切换后下方所有图表数据将同步更新
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {PERIOD_BTN.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setPeriod(b.key)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      period === b.key
                        ? "bg-sky-600 text-white shadow"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">经营数据</h3>
                <p className="text-xs text-slate-500 mb-2">
                  当前时段 · 活跃下级{" "}
                  <span className="font-semibold text-slate-800">{data.operating.activeUsers}</span> 人
                </p>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={operatingChart || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`¥${formatMoney(v)}`, ""]} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {[0, 1].map((i) => (
                          <Cell key={i} fill={["#0ea5e9", "#f97316"][i]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">注册转化漏斗</h3>
                <Funnel
                  registered={data.funnel.registered}
                  recharged={data.funnel.recharged}
                  active={data.funnel.active}
                />
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                    充值转化率{" "}
                    <span className="font-semibold text-slate-900">{data.funnel.rechargeConversion}%</span>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                    活跃转化率{" "}
                    <span className="font-semibold text-slate-900">{data.funnel.activeConversion}%</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">消费 TOP10</h3>
                <span className="text-xs text-slate-400">下级用户 · 当前时段</span>
              </div>
              <div className="h-[280px]">
                {data.topUsers.length === 0 ? (
                  <p className="text-sm text-slate-400 py-10 text-center">暂无数据</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={data.topUsers.map((u) => ({
                        label: (u.name || u.email || u.id).slice(0, 12),
                        amount: u.amount,
                      }))}
                      margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={88} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`¥${formatMoney(v)}`, "消费"]} />
                      <Bar dataKey="amount" fill="#38bdf8" radius={[0, 4, 4, 0]}>
                        {data.topUsers.map((_, i) => (
                          <Cell key={i} fill={`hsl(${200 + i * 8}, 70%, ${55 - i * 2}%)`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">模型消费 TOP10</h3>
                <span className="text-xs text-slate-400">下级调用 · 当前时段</span>
              </div>
              <div className="h-[280px]">
                {data.topModels.length === 0 ? (
                  <p className="text-sm text-slate-400 py-10 text-center">暂无数据</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={data.topModels.map((m) => ({
                        label: m.name.length > 18 ? m.name.slice(0, 18) + "…" : m.name,
                        amount: m.amount,
                      }))}
                      margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`¥${formatMoney(v)}`, "消费"]} />
                      <Bar dataKey="amount" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6 min-h-[140px] flex items-center justify-center text-slate-400 text-sm border-dashed">
              活跃统计 · 即将接入更细粒度曲线
            </Card>
            <Card className="p-6 min-h-[140px] flex items-center justify-center text-slate-400 text-sm border-dashed">
              充值趋势统计 · 即将接入
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  sub,
  className,
}: {
  title: string;
  value: number;
  sub?: string;
  className: string;
}) {
  return (
    <div className={`rounded-2xl p-5 shadow-md ${className}`}>
      <div className="text-sm opacity-90">{title}</div>
      <div className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">¥ {formatMoney(value)}</div>
      {sub && <div className="mt-2 text-[11px] opacity-75 leading-snug">{sub}</div>}
    </div>
  );
}

function Funnel({
  registered,
  recharged,
  active,
}: {
  registered: number;
  recharged: number;
  active: number;
}) {
  const max = Math.max(registered, recharged, active, 1);
  const tiers = [
    { label: "注册用户", value: registered, color: "bg-sky-500" },
    { label: "充值用户", value: recharged, color: "bg-amber-500" },
    { label: "活跃用户", value: active, color: "bg-emerald-500" },
  ];
  return (
    <div className="space-y-3">
      {tiers.map((t) => (
        <div key={t.label} className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-slate-600">
            <span>{t.label}</span>
            <span className="font-semibold text-slate-900">{t.value} 人</span>
          </div>
          <div className="h-9 rounded-lg bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${t.color} rounded-lg transition-all`}
              style={{ width: `${Math.max(8, (t.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
