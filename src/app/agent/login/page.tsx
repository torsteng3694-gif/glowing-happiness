"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";

export default function AgentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/agent-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      startTransition(() => {
        router.replace("/agent/dashboard");
        router.refresh();
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[420px] space-y-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 ring-1 ring-sky-400/40 mb-4">
            <Building2 className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">星书AI</h1>
          <p className="mt-1 text-sm text-slate-400">代理商中心 · 登录</p>
        </div>

        <Card className="p-8 shadow-xl border-slate-700/50 bg-white/95 backdrop-blur">
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label>邮箱</Label>
              <Input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="代理商账号邮箱"
                className="mt-1"
              />
            </div>
            <div>
              <Label>密码</Label>
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="mt-1"
              />
            </div>
            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" variant="glow" loading={loading || isPending}>
              进入代理商后台
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-sm text-slate-600">
            <Link href="/login" className="text-sky-600 hover:text-sky-700 font-medium">
              普通用户登录
            </Link>
            <span className="mx-2 text-slate-300">|</span>
            <Link href="/" className="text-slate-500 hover:text-slate-700">
              返回首页
            </Link>
          </div>
        </Card>

        <p className="text-center text-xs text-slate-500">
          仅限已开通代理权限的账号。如需开通请联系管理员。
        </p>
      </div>
    </div>
  );
}
