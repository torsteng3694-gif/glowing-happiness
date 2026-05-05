"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { useT } from "@/i18n/client";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  const t = useT();
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t("auth.login.fail")); return; }
      startTransition(() => {
        router.replace(next);
        router.refresh();
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-bold">{t("auth.login.title")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("auth.login.subtitle")}</p>

      <form className="mt-6 space-y-4" onSubmit={submit} autoComplete="off">
        <div>
          <Label>{t("auth.email")}</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email_ph")}
            autoComplete="off"
            name="login-email"
          />
        </div>
        <div>
          <Label>{t("auth.password")}</Label>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password_ph")}
            autoComplete="new-password"
            name="login-password"
          />
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <Button type="submit" className="w-full" variant="glow" loading={loading || isPending}>
          {t("auth.login.btn")}
        </Button>
      </form>

      <div className="mt-6 text-sm text-slate-600 text-center">
        {t("auth.login.no_account")}<Link href="/register" className="text-brand-600 hover:text-brand-700"> {t("auth.login.go_register")}</Link>
      </div>
      <div className="mt-3 text-sm text-center">
        <Link href="/agent/login" className="text-slate-500 hover:text-slate-800">
          代理商登录 →
        </Link>
      </div>
    </Card>
  );
}
