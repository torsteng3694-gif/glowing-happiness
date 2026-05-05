"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, Input, Label, Select, Spinner } from "@/components/ui";
import { Wallet, X, AlertTriangle, Plus, Minus, Search, UserCog } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  balance: number;
  totalRecharge: number;
  totalSpent: number;
  referralCode: string;
  createdAt: string;
};

export default function UsersClient({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<UserRow | null>(null);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [toast, setToast] = useState("");
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "admin" | "user" | "agent">("");

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2000);
  }, []);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q) ||
        u.referralCode.toLowerCase().includes(q)
      );
    });
  }, [users, keyword, roleFilter]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">用户管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            用户自助充值已关闭，统一由管理员手动调账。可通过「角色」将用户设为<strong className="text-slate-700">代理商</strong>
            ，使其可登录 <span className="font-mono text-xs">/agent/login</span> 进入代理中心。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "" | "admin" | "user" | "agent")}
            className="h-10 w-36"
          >
            <option value="">全部角色</option>
            <option value="admin">仅管理员</option>
            <option value="agent">仅代理商</option>
            <option value="user">仅普通用户</option>
          </Select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜邮箱 / 昵称 / 邀请码"
              className="pl-8 w-64"
            />
          </div>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs bg-slate-50">
              <tr>
                <th className="text-left px-5 py-3 font-normal">邮箱</th>
                <th className="text-left px-5 py-3 font-normal">昵称</th>
                <th className="text-left px-5 py-3 font-normal">角色</th>
                <th className="text-right px-5 py-3 font-normal">余额</th>
                <th className="text-right px-5 py-3 font-normal">累计充值</th>
                <th className="text-right px-5 py-3 font-normal">累计消费</th>
                <th className="text-left px-5 py-3 font-normal">邀请码</th>
                <th className="text-left px-5 py-3 font-normal">注册时间</th>
                <th className="text-right px-5 py-3 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium">{u.email}</td>
                  <td className="px-5 py-3">{u.name || "-"}</td>
                  <td className="px-5 py-3">
                    {u.role === "admin" ? (
                      <Badge color="amber">管理员</Badge>
                    ) : u.role === "agent" ? (
                      <Badge color="brand">代理商</Badge>
                    ) : (
                      <Badge>用户</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">¥ {formatMoney(u.balance)}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">¥ {formatMoney(u.totalRecharge)}</td>
                  <td className="px-5 py-3 text-right text-rose-600">¥ {formatMoney(u.totalSpent)}</td>
                  <td className="px-5 py-3 font-mono text-xs">{u.referralCode}</td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex flex-wrap gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setRoleTarget(u)}>
                        <UserCog className="w-3.5 h-3.5" /> 角色
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setTarget(u)}>
                        <Wallet className="w-3.5 h-3.5" /> 调账
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    {users.length === 0 ? "暂无用户" : "没有匹配到用户"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {target && (
        <AdjustModal
          user={target}
          onClose={() => setTarget(null)}
          onSaved={(msg) => {
            setTarget(null);
            showToast(msg);
            router.refresh();
          }}
        />
      )}

      {roleTarget && (
        <RoleModal
          user={roleTarget}
          onClose={() => setRoleTarget(null)}
          onSaved={(msg) => {
            setRoleTarget(null);
            showToast(msg);
            router.refresh();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function AdjustModal({
  user, onClose, onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [sign, setSign] = useState<"+" | "-">("+");
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const preview = sign === "+" ? user.balance + amount : user.balance - amount;

  async function submit() {
    setErr("");
    if (!Number.isFinite(amount) || amount <= 0) { setErr("金额必须大于 0"); return; }
    if (sign === "-" && preview < -1e-6) {
      setErr(`余额不足：当前 ¥${user.balance.toFixed(2)}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/go/v2/admin/users/${user.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: sign === "+" ? amount : -amount,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "调账失败"); return; }
      onSaved(
        `已${sign === "+" ? "加" : "扣"} ¥${amount.toFixed(2)}，当前余额 ¥${formatMoney(data.balance)}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "调账失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Wallet className="w-5 h-5 text-brand-600" /> 调账
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">目标用户</span>
              <span className="font-medium">{user.name || user.email}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-slate-500">当前余额</span>
              <span className="font-mono font-semibold">¥ {formatMoney(user.balance)}</span>
            </div>
          </div>

          <div>
            <Label>操作类型</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSign("+")}
                className={`flex-1 h-10 rounded-lg border text-sm inline-flex items-center justify-center gap-1 ${sign === "+" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 hover:bg-slate-50"}`}
              >
                <Plus className="w-4 h-4" /> 加余额（充值）
              </button>
              <button
                type="button"
                onClick={() => setSign("-")}
                className={`flex-1 h-10 rounded-lg border text-sm inline-flex items-center justify-center gap-1 ${sign === "-" ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-300 hover:bg-slate-50"}`}
              >
                <Minus className="w-4 h-4" /> 扣余额
              </button>
            </div>
          </div>

          <div>
            <Label>金额（¥）</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="w-full"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {[10, 50, 100, 500, 1000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(v)}
                  className={`px-3 h-8 rounded-md border text-xs ${amount === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 hover:bg-slate-50"}`}
                >
                  ¥ {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>备注（可选）</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：卡密充值 #A123 / 退款 / 赠送等"
              className="w-full"
            />
          </div>

          <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">调整后余额</span>
              <span className={`font-mono font-bold ${preview < -1e-6 ? "text-rose-600" : "text-brand-700"}`}>
                ¥ {formatMoney(preview)}
              </span>
            </div>
          </div>

          {err && (
            <div className="p-3 text-sm bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {err}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button
            onClick={submit}
            disabled={saving || !Number.isFinite(amount) || amount <= 0 || (sign === "-" && preview < -1e-6)}
          >
            {saving ? <Spinner /> : <Wallet className="w-4 h-4" />}
            确认{sign === "+" ? "充值" : "扣款"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoleModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const initial: "user" | "admin" | "agent" =
    user.role === "admin" ? "admin" : user.role === "agent" ? "agent" : "user";
  const [role, setRole] = useState<"user" | "admin" | "agent">(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "保存失败");
        return;
      }
      const label = role === "admin" ? "管理员" : role === "agent" ? "代理商" : "普通用户";
      onSaved(`已设为「${label}」`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UserCog className="w-5 h-5 text-brand-600" /> 用户角色
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="text-slate-500">用户</div>
            <div className="font-medium mt-0.5">{user.name || user.email}</div>
            <div className="text-xs text-slate-400 mt-1 font-mono">{user.email}</div>
          </div>

          <div>
            <Label>角色</Label>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as "user" | "admin" | "agent")}
              className="w-full mt-1 h-11"
            >
              <option value="user">普通用户 — 用户端功能</option>
              <option value="agent">代理商 — 可登录代理中心，查看佣金与下级数据</option>
              <option value="admin">管理员 — 可进入本后台</option>
            </Select>
            <p className="text-xs text-slate-500 mt-2">
              设为代理商后，请通知对方使用「代理商登录」入口；管理员账号请勿随意降级。
            </p>
          </div>

          {err && (
            <div className="p-3 text-sm bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {err}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving || role === initial}>
            {saving ? <Spinner /> : <UserCog className="w-4 h-4" />}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
