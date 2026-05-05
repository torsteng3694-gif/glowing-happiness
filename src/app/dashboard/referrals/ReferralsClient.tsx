"use client";
import { useEffect, useState } from "react";
import { Card, Button, Badge } from "@/components/ui";
import { Copy, Users, Coins } from "lucide-react";
import { formatDate, formatMoney, relativeTime } from "@/lib/utils";

type Invited = { id: string; email: string; name: string | null; createdAt: string; totalSpent: number };
type Commission = { id: string; amount: number; baseAmount: number; rate: number; sourceEmail: string; createdAt: string };

export default function ReferralsClient({
  referralCode, rate, invited, commissions, totalCommission,
}: {
  referralCode: string; rate: number; invited: Invited[]; commissions: Commission[]; totalCommission: number;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/register?ref=${referralCode}`;

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    alert("已复制到剪贴板");
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">邀请返佣</h1>
        <p className="text-slate-500 mt-1 text-sm">好友通过你的链接注册，每次消费你都能获得 {(rate * 100).toFixed(0)}% 佣金</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-6 bg-gradient-to-br from-violet-600 to-pink-500 text-white">
          <div className="flex items-center gap-2 text-sm opacity-90"><Coins className="w-4 h-4" /> 累计佣金</div>
          <div className="mt-2 text-3xl font-bold">¥ {formatMoney(totalCommission)}</div>
          <div className="mt-3 text-xs opacity-75">已自动入账到钱包</div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Users className="w-4 h-4" /> 已邀请</div>
          <div className="mt-2 text-3xl font-bold">{invited.length} 人</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-slate-500">邀请码</div>
          <div className="mt-2 text-2xl font-bold font-mono">{referralCode}</div>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => copy(referralCode)}>
            <Copy className="w-4 h-4" /> 复制邀请码
          </Button>
        </Card>
      </div>

      <Card className="p-6">
        <div className="font-semibold mb-3">我的邀请链接</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono break-all">{link}</code>
          <Button onClick={() => copy(link)}><Copy className="w-4 h-4" /> 复制</Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          分享链接 → 好友注册即送 ¥5 → 之后他每次消费，你实时获得 {(rate * 100).toFixed(0)}% 佣金（直接到账）。
        </p>
      </Card>

      <Card className="p-6">
        <div className="font-semibold mb-3">已邀请用户</div>
        {invited.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-sm">还没有邀请用户</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invited.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{u.name || u.email}</div>
                  <div className="text-xs text-slate-500">注册于 {relativeTime(u.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">TA 累计消费</div>
                  <div className="font-medium">¥ {formatMoney(u.totalSpent)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="font-semibold mb-3">佣金明细</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs">
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 font-normal">时间</th>
                <th className="text-left py-2 font-normal">来源</th>
                <th className="text-right py-2 font-normal">消费</th>
                <th className="text-right py-2 font-normal">比例</th>
                <th className="text-right py-2 font-normal">佣金</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="py-2.5 text-slate-600">{formatDate(c.createdAt)}</td>
                  <td className="py-2.5">{c.sourceEmail}</td>
                  <td className="py-2.5 text-right text-slate-600">¥ {formatMoney(c.baseAmount, 4)}</td>
                  <td className="py-2.5 text-right text-slate-600">{(c.rate * 100).toFixed(0)}%</td>
                  <td className="py-2.5 text-right font-medium text-violet-600">+¥ {formatMoney(c.amount, 4)}</td>
                </tr>
              ))}
              {commissions.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">暂无佣金记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
