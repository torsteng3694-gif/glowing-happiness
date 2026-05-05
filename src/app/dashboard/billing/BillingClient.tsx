"use client";
import { Card, Badge } from "@/components/ui";
import { Wallet, TrendingUp, TrendingDown, Lock, MessageSquare } from "lucide-react";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type User = { balance: number; totalRecharge: number; totalSpent: number };
type Tx = { id: string; type: string; amount: number; balance: number; note: string | null; createdAt: string };
type ChartPt = { date: string; value: number };

export default function BillingClient({ user, transactions, chart }: { user: User; transactions: Tx[]; chart: ChartPt[] }) {
  function typeLabel(t: string) {
    const map: Record<string, { label: string; color: any }> = {
      recharge: { label: "充值", color: "green" },
      consume: { label: "消费", color: "rose" },
      commission: { label: "返佣", color: "violet" },
      refund: { label: "退款", color: "amber" },
    };
    return map[t] || { label: t, color: "slate" };
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">钱包</h1>
        <p className="text-slate-500 mt-1 text-sm">查看余额与消费流水。充值请联系管理员审核后调账。</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-6 bg-gradient-to-br from-brand-600 to-purple-600 text-white">
          <div className="flex items-center gap-2 text-sm opacity-90"><Wallet className="w-4 h-4" /> 账户余额</div>
          <div className="mt-2 text-3xl font-bold">¥ {formatMoney(user.balance)}</div>
          <div className="mt-3 text-xs opacity-75">可用于调用全部模型</div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-500"><TrendingUp className="w-4 h-4" /> 累计充值</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">¥ {formatMoney(user.totalRecharge)}</div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-500"><TrendingDown className="w-4 h-4" /> 累计消费</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">¥ {formatMoney(user.totalSpent)}</div>
        </Card>
      </div>

      <Card className="p-6 border-amber-200 bg-amber-50/40">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900">自助充值已关闭</div>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              为保障账户安全，目前<b>不支持用户自助充值</b>。如需为账户添加余额，请联系管理员审核后手动调账，并保留好转账凭证。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Link
                href="/dashboard/feedback"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition"
              >
                <MessageSquare className="w-4 h-4" /> 前往反馈中心联系管理员
              </Link>
              <span className="text-xs text-slate-500">留下邮箱 + 期望金额 + 付款凭证，管理员审核后会为你加余额。</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="font-semibold mb-3">近 30 日消费趋势</div>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="clr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef2ff" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} width={40} />
              <Tooltip formatter={(v: any) => `¥ ${Number(v).toFixed(4)}`} />
              <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#clr)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <div className="font-semibold mb-3">交易流水</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs">
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 font-normal">时间</th>
                <th className="text-left py-2 font-normal">类型</th>
                <th className="text-left py-2 font-normal">备注</th>
                <th className="text-right py-2 font-normal">金额</th>
                <th className="text-right py-2 font-normal">余额</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const info = typeLabel(t.type);
                return (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="py-2.5 text-slate-600">{formatDate(t.createdAt)}</td>
                    <td className="py-2.5"><Badge color={info.color}>{info.label}</Badge></td>
                    <td className="py-2.5 text-slate-600">{t.note || "-"}</td>
                    <td className={`py-2.5 text-right font-medium ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {t.amount >= 0 ? "+" : ""}¥ {formatMoney(t.amount, 4)}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">¥ {formatMoney(t.balance)}</td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">暂无流水</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
