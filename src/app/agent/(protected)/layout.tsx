import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AgentCenterNav from "@/components/agent-center/AgentCenterNav";
import { AgentHeader } from "../_components/AgentHeader";

export default async function AgentProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/agent/login");
  if (session.role !== "agent" && session.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="hidden md:flex md:w-56 lg:w-60 flex-col bg-slate-900 text-slate-200 shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-slate-800">
          <Link href="/agent/dashboard" className="font-bold text-lg tracking-tight text-white">
            星书AI
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          <AgentCenterNav variant="dark" mode="agent" />
        </div>
        <div className="p-3 mt-auto border-t border-slate-800 text-xs text-slate-500">
          <Link href="/dashboard" className="text-sky-400 hover:text-sky-300">
            返回用户端
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <AgentHeader email={session.email} name={session.name} />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
