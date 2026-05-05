import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { formatMoney, relativeTime } from "@/lib/utils";
import { Users, Coins, Zap, TrendingUp, BadgeDollarSign, PiggyBank, AlertTriangle, Percent, Building2 } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const now = Date.now();
  const since7 = new Date(now - 7 * 86400 * 1000);
  const since30 = new Date(now - 30 * 86400 * 1000);

  const [
    userCount,
    modelCount,
    txSum,
    usage7d,
    usage30d,
    recentUsers,
    recentUsages,
    topChannels30d,
    lowProfitChannels,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.model.count({ where: { enabled: true } }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "recharge" },
    }),
    prisma.usage.findMany({
      where: { createdAt: { gte: since7 } },
      select: { cost: true, realCost: true },
    }),
    prisma.usage.findMany({
      where: { createdAt: { gte: since30 }, channelId: { not: null } },
      select: { channelId: true, cost: true, realCost: true },
    }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.usage.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { email: true } },
        model: { select: { name: true, provider: true } },
      },
    }),
    prisma.usage.groupBy({
      by: ["channelId"],
      where: { createdAt: { gte: since30 }, channelId: { not: null } },
      _sum: { cost: true, realCost: true },
      _count: { _all: true },
      orderBy: { _sum: { cost: "desc" } },
      take: 5,
    }),
    prisma.channel.findMany({
      where: {
        enabled: true,
        OR: [
          { notes: { contains: "待核对" } },
          // 粗筛：成本 > 0 且 售价 < 成本
          {
            AND: [
              { costUnitPrice: { gt: 0 } },
              { sellUnitPrice: { lt: 0.01 } },
            ],
          },
        ],
      },
      include: {
        model: { select: { name: true, slug: true, type: true } },
        upstream: { select: { name: true } },
      },
      take: 8,
    }),
  ]);

  const rechargeTotal = txSum._sum.amount || 0;
  const spent7d = usage7d.reduce((s, u) => s + u.cost, 0);
  const realCost7d = usage7d.reduce((s, u) => s + (u.realCost || 0), 0);
  const profit7d = spent7d - realCost7d;
  const profitRate7d = spent7d > 0 ? (profit7d / spent7d) * 100 : 0;

  const spent30d = usage30d.reduce((s, u) => s + u.cost, 0);
  const realCost30d = usage30d.reduce((s, u) => s + (u.realCost || 0), 0);
  const profit30d = spent30d - realCost30d;

  // 把 topChannels30d 再关联 channel 名称
  const channelIds = topChannels30d.map((c) => c.channelId!).filter(Boolean);
  const channelMap = new Map(
    (await prisma.channel.findMany({
      where: { id: { in: channelIds } },
      include: { model: { select: { name: true } }, upstream: { select: { name: true } } },
    })).map((c) => [c.id, c])
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold">平台概览</h1>

      <Link
        href="/admin/agent"
        className="flex items-center justify-between gap-4 rounded-2xl border-2 border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 px-5 py-4 shadow-sm hover:border-sky-300 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="font-bold text-slate-900">代理商中心</div>
            <div className="text-sm text-slate-600 mt-0.5">
              在管理后台内查看仪表盘、财务、客户、推广链接（无需切换页面）
            </div>
          </div>
        </div>
        <span className="text-sky-600 font-semibold text-sm shrink-0">进入 →</span>
      </Link>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "注册用户", value: userCount, icon: <Users className="w-5 h-5" />, color: "brand" as const },
          { label: "可用模型", value: modelCount, icon: <Zap className="w-5 h-5" />, color: "violet" as const },
          { label: "累计充值", value: `¥ ${formatMoney(rechargeTotal)}`, icon: <Coins className="w-5 h-5" />, color: "green" as const },
          { label: "近 7 日营收", value: `¥ ${formatMoney(spent7d)}`, icon: <TrendingUp className="w-5 h-5" />, color: "amber" as const },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{s.label}</span>
              <Badge color={s.color}>{s.icon}</Badge>
            </div>
            <div className="mt-3 text-2xl font-bold">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* 利润卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">7 日成本支出</span>
            <Badge color="slate"><Coins className="w-5 h-5" /></Badge>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-700">¥ {formatMoney(realCost7d)}</div>
          <div className="text-xs text-slate-400 mt-1">按渠道成本价累加</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">7 日毛利润</span>
            <Badge color={profit7d >= 0 ? "green" : "rose"}><PiggyBank className="w-5 h-5" /></Badge>
          </div>
          <div className={`mt-3 text-2xl font-bold ${profit7d >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            ¥ {formatMoney(profit7d)}
          </div>
          <div className="text-xs text-slate-400 mt-1">= 营收 − 成本</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">7 日利润率</span>
            <Badge color="brand"><Percent className="w-5 h-5" /></Badge>
          </div>
          <div className={`mt-3 text-2xl font-bold ${profit7d >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {profitRate7d.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-400 mt-1">毛利 / 营收</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">30 日毛利润</span>
            <Badge color={profit30d >= 0 ? "green" : "rose"}><BadgeDollarSign className="w-5 h-5" /></Badge>
          </div>
          <div className={`mt-3 text-2xl font-bold ${profit30d >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            ¥ {formatMoney(profit30d)}
          </div>
          <div className="text-xs text-slate-400 mt-1">营收 ¥ {formatMoney(spent30d)}</div>
        </Card>
      </div>

      {lowProfitChannels.length > 0 && (
        <Card className="p-5 border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 font-semibold text-amber-700 mb-3">
            <AlertTriangle className="w-5 h-5" /> 需要关注的渠道 ({lowProfitChannels.length})
          </div>
          <div className="space-y-2">
            {lowProfitChannels.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2">
                <div>
                  <div className="font-medium">
                    {c.model.name} <span className="text-slate-400">·</span> {c.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.upstream.name} · 成本待核对或售价低于成本
                  </div>
                </div>
                <Link href={`/admin/models`} className="text-xs text-brand-600 hover:underline">去处理</Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="font-semibold mb-3">最新注册</h2>
          <div className="divide-y divide-slate-100">
            {recentUsers.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{u.name || u.email}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
                <div className="text-right">
                  <div>¥ {formatMoney(u.balance)}</div>
                  <div className="text-xs text-slate-400">{relativeTime(u.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-3">最新调用</h2>
          <div className="divide-y divide-slate-100">
            {recentUsages.map((u) => {
              const profit = u.cost - (u.realCost || 0);
              return (
                <div key={u.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{u.model.name}</div>
                    <div className="text-xs text-slate-500">{u.user.email} · {u.type}</div>
                  </div>
                  <div className="text-right">
                    <div>¥ {formatMoney(u.cost, 4)}</div>
                    <div className={`text-xs ${profit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      利润 ¥ {formatMoney(profit, 4)}
                    </div>
                    <div className="text-xs text-slate-400">{relativeTime(u.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">30 日 Top 渠道（按营收）</h2>
        {topChannels30d.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">暂无数据。启用渠道并产生调用后会在这里看到排行。</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b">
                <tr>
                  <th className="py-2 text-left">渠道</th>
                  <th className="text-right">调用数</th>
                  <th className="text-right">营收</th>
                  <th className="text-right">成本</th>
                  <th className="text-right">毛利</th>
                  <th className="text-right">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topChannels30d.map((row) => {
                  const ch = row.channelId ? channelMap.get(row.channelId) : null;
                  const revenue = row._sum.cost || 0;
                  const real = row._sum.realCost || 0;
                  const profit = revenue - real;
                  const rate = revenue > 0 ? (profit / revenue) * 100 : 0;
                  return (
                    <tr key={row.channelId!}>
                      <td className="py-2">
                        <div className="font-medium">
                          {ch ? `${ch.model.name} · ${ch.name}` : row.channelId}
                        </div>
                        <div className="text-xs text-slate-400">{ch?.upstream.name}</div>
                      </td>
                      <td className="text-right">{row._count._all}</td>
                      <td className="text-right">¥ {formatMoney(revenue, 4)}</td>
                      <td className="text-right text-slate-500">¥ {formatMoney(real, 4)}</td>
                      <td className={`text-right font-medium ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        ¥ {formatMoney(profit, 4)}
                      </td>
                      <td className={`text-right ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {rate.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
