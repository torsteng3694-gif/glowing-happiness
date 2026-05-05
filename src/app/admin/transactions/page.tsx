import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminTransactions() {
  const txs = await prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true } } },
  });

  const labels: Record<string, { label: string; color: any }> = {
    recharge: { label: "充值", color: "green" },
    consume: { label: "消费", color: "rose" },
    commission: { label: "返佣", color: "violet" },
    refund: { label: "退款", color: "amber" },
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold">交易流水</h1>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs bg-slate-50">
              <tr>
                <th className="text-left px-5 py-3 font-normal">时间</th>
                <th className="text-left px-5 py-3 font-normal">用户</th>
                <th className="text-left px-5 py-3 font-normal">类型</th>
                <th className="text-left px-5 py-3 font-normal">备注</th>
                <th className="text-right px-5 py-3 font-normal">金额</th>
                <th className="text-right px-5 py-3 font-normal">余额</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const info = labels[t.type] || { label: t.type, color: "slate" };
                return (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-500">{formatDate(t.createdAt)}</td>
                    <td className="px-5 py-3">{t.user.email}</td>
                    <td className="px-5 py-3"><Badge color={info.color}>{info.label}</Badge></td>
                    <td className="px-5 py-3 text-slate-600">{t.note || "-"}</td>
                    <td className={`px-5 py-3 text-right font-medium ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {t.amount >= 0 ? "+" : ""}¥ {formatMoney(t.amount, 4)}
                    </td>
                    <td className="px-5 py-3 text-right">¥ {formatMoney(t.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
