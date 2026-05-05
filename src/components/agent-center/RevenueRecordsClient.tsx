"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Spinner } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Period = "today" | "yesterday" | "week" | "month" | "all";

type Row = {
  id: string;
  amount: number;
  rate: number;
  baseAmount: number;
  note: string | null;
  createdAt: string;
  source: { id: string; email: string; name: string | null; avatarUrl: string | null };
};

const PERIOD_BTN: { key: Period; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "yesterday", label: "昨日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "all", label: "全部" },
];

export default function RevenueRecordsClient() {
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
      const res = await fetch(`/api/agent/commissions?${params}`, { cache: "no-store" });
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
            <span>代理商中心</span>
            <span className="mx-1">/</span>
            <span>财务</span>
            <span className="mx-1">/</span>
            <span className="text-slate-800 font-medium">收益记录</span>
          </nav>
          <h2 className="text-lg font-bold text-slate-900">收益记录</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            下级用户产生平台消费时，按邀请返佣规则记入佣金（数据来自 Commission 表）。
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

      <Card className="p-0 overflow-hidden">
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
                <th className="text-left px-4 py-3 font-medium">下级用户</th>
                <th className="text-right px-4 py-3 font-medium">关联消费</th>
                <th className="text-right px-4 py-3 font-medium">分佣收益</th>
                <th className="text-left px-4 py-3 font-medium">备注</th>
                <th className="text-left px-4 py-3 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    暂无收益记录（需有用户通过您的邀请码注册并产生消费）
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white text-xs font-bold flex items-center justify-center shrink-0 overflow-hidden">
                        {row.source.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.source.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (row.source.name || row.source.email).slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">
                          {row.source.name || row.source.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-slate-400 font-mono truncate">{row.source.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    ¥ {formatMoney(row.baseAmount)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">
                    +¥ {formatMoney(row.amount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={row.note || ""}>
                    {row.note || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {formatCn(row.createdAt)}
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

function formatCn(iso: string) {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}
