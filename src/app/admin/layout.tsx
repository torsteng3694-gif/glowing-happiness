import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminNav from "./_components/AdminNav";
import { ShieldCheck, Building2 } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden md:flex md:w-64 flex-col bg-white border-r border-slate-200">
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            AI Hub · 管理
          </Link>
        </div>
        {/* 内嵌「代理商中心」：直接进入 /admin/agent，不跳出管理后台 */}
        <div className="p-3 border-b border-slate-100">
          <Link
            href="/admin/agent"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-3 py-3 text-sm font-bold text-white shadow hover:from-sky-500 hover:to-indigo-500"
          >
            <Building2 className="w-5 h-5 shrink-0" />
            代理商中心
          </Link>
        </div>
        <AdminNav />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <div className="text-sm text-slate-500">管理员：<span className="text-slate-900 font-medium">{session.email}</span></div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/admin/agent"
              className="inline-flex items-center gap-1.5 text-sky-600 hover:text-sky-800 font-medium"
            >
              <Building2 className="w-4 h-4" />
              代理商
            </Link>
            <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">返回用户端</Link>
            <form action="/api/auth/logout" method="post">
              <input type="hidden" name="next" value="/login" />
              <button type="submit" className="text-slate-600 hover:text-slate-900">退出</button>
            </form>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
