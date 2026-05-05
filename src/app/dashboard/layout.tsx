import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DashboardNav from "./_components/DashboardNav";
import { Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import LocaleSwitcher from "@/i18n/LocaleSwitcher";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) redirect("/login");
  const { t } = await getT();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden md:flex md:w-64 flex-col bg-white border-r border-slate-200 relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-50/80 via-white/0 to-transparent" />

        <div className="relative h-16 flex items-center px-6 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg group">
            <div className="relative w-9 h-9 rounded-xl gradient-bg flex items-center justify-center text-white shadow-glow-brand">
              <Sparkles className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <span className="tracking-tight">AI Hub</span>
          </Link>
        </div>
        <DashboardNav role={user.role} />

        <div className="relative m-4 rounded-2xl overflow-hidden text-white shadow-lg">
          <div className="absolute inset-0 bg-aurora-dark" />
          <div className="relative p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/75">{t("dash.sidebar.balance")}</div>
              <span className="inline-flex items-center gap-1 text-[10px] text-white/80 border border-white/20 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {t("dash.sidebar.realtime")}
              </span>
            </div>
            <div className="text-2xl font-bold mt-1 tracking-tight">
              ¥ {formatMoney(user.balance)}
            </div>
            <Link
              href="/dashboard/billing"
              className="mt-3 block text-center text-sm bg-white/15 hover:bg-white/25 border border-white/15 rounded-lg py-1.5 transition-colors duration-100"
            >
              {t("dash.sidebar.view_billing")}
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="relative h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10">
          <div className="text-sm text-slate-500">
            {t("dash.header.hello")}<span className="text-slate-900 font-medium">{user.name || user.email}</span>
          </div>
          <div className="flex items-center gap-3">
            <LocaleSwitcher variant="ghost" />
            <form action="/api/auth/logout" method="post">
              <input type="hidden" name="next" value="/login" />
              <button type="submit" className="text-sm text-slate-600 hover:text-slate-900 transition-colors duration-100">
                {t("common.logout")}
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 overflow-auto relative">
          <div className="pointer-events-none absolute inset-0 bg-mesh-fine opacity-60" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
