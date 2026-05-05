"use client";
import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { useT } from "@/i18n/client";

export default function RegisterPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const r = sp.get("ref");
    if (r) setRef(r);
  }, [sp]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, referralCode: ref }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t("auth.register.fail")); return; }
      startTransition(() => {
        router.replace("/dashboard");
        router.refresh();
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-bold">{t("auth.register.title")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("auth.register.subtitle")}</p>

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <Label>{t("auth.register.name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auth.register.name_ph")} />
        </div>
        <div>
          <Label>{t("auth.email")}</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.email_ph")} />
        </div>
        <div>
          <Label>{t("auth.password")}</Label>
          <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.password_ph")} />
        </div>
        <div>
          <Label>{t("auth.register.ref")}</Label>
          <Input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder={t("auth.register.ref_ph")} />
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <Button type="submit" className="w-full" variant="glow" loading={loading || isPending}>
          {t("auth.register.btn")}
        </Button>
      </form>

      <div className="mt-6 text-sm text-slate-600 text-center">
        {t("auth.register.have_account")}<Link href="/login" className="text-brand-600 hover:text-brand-700"> {t("auth.register.go_login")}</Link>
      </div>
    </Card>
  );
}
