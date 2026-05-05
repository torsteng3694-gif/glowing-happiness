"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Spinner } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Smartphone } from "lucide-react";

type Period = "today" | "yesterday" | "week" | "month" | "all";

type Row = {
  id: string;
  method: string;
  accountMask: string;
  amount: number;
  status: string;
  requestedAt: string;
  paidAt: string | null;
};

const PERIOD_BTN: { key: Period; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "all", label: "全部" },
];

const METHOD_LABEL: Record<string, string> = {
  alipay: "支付宝",
  wechat: "微信",
  bank: "银行卡",
};

function statusBadge(status: string) {
  if (status === "success") {
    return (
      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
        成功
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-100">
        失败
      </span>
    );
  }
  return (
    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-100">
      处理中
    </span>
  );
}

function methodIcon(method: string) {
  const isWechat = method === "wechat";
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white shadow-sm ${
        isWechat ? "bg-emerald-500" : "bg-sky-500"
      }`}
    >
      <Smartphone className="w-5 h-5 opacity-95" aria-hidden />
    </div>
  );
}

export default function WithdrawalRecordsClient({ breadcrumbPrefix = "代理商中心" }: { breadcrumbPrefix?: string }) {
  const [period, setPeriod] = useState<Period>("all");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams({
        period,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/agent/withdrawals?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setTotal(data.total ?? 0);
      setItems(data.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [period, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [period]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav className="text-xs text-slate-500 mb-1">
            <span>{breadcrumbPrefix}</span>
            <span className="mx-1">/</span>
            <span>财务</span>
            <span className="mx-1">/</span>
            <span className="text-slate-800 font-medium">提现记录</span>
          </nav>
          <h2 className="text-lg font-bold text-slate-900">提现记录</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            展示您发起的提现申请及打款状态（数据来自 Withdrawal 表）。
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {PERIOD_BTN.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setPeriod(b.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
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

      <Card className="p-0 overflow-hidden border border-slate-200/80 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-slate-600">
            共 <strong className="text-slate-900">{total}</strong> 条
          </span>
          {loading && (
            <span className="text-xs text-slate-400 inline-flex items-center gap-1">
              <Spinner /> 加载中…
            </span>
          )}
        </div>

        {err && (
          <div className="p-4 text-sm text-rose-700 bg-rose-50 border-b border-rose-100">{err}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-4 py-3 font-medium">提现方式</th>
                <th className="text-left px-4 py-3 font-medium">收款账号</th>
                <th className="text-right px-4 py-3 font-medium">提现金额</th>
                <th className="text-left px-4 py-3 font-medium">申请时间</th>
                <th className="text-left px-4 py-3 font-medium">打款时间</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    暂无提现记录。发起提现或接入财务打款后将在此展示。
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-3">
                      {methodIcon(row.method)}
                      <div className="min-w-0 pt-0.5">
                        <div className="font-medium text-slate-900">{METHOD_LABEL[row.method] || row.method}</div>
                        {statusBadge(row.status)}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-slate-800">{row.accountMask}</td>
                  <td className="px-4 py-3 align-top text-right font-semibold text-sky-600 whitespace-nowrap">
                    -¥{formatMoney(row.amount)}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600">{stackTime(row.requestedAt)}</td>
                  <td className="px-4 py-3 align-top text-slate-600">
                    {row.paidAt ? stackTime(row.paidAt) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" /> 上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页 <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function stackTime(iso: string) {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return (
      <div className="text-xs leading-snug whitespace-nowrap">
        <div>{date}</div>
        <div className="text-slate-400">{time}</div>
      </div>
    );
  } catch {
    return iso;
  }
}
