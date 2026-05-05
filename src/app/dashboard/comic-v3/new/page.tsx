/**
 * AI 漫剧 · S3.0 — 创建项目
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import NewProjectForm from "./NewProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard/comic-v3/new");

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <Link
        href="/dashboard/comic-v3"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> 返回项目列表
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mb-6">创建新项目</h1>
      <NewProjectForm />
    </div>
  );
}
