/**
 * AI 漫剧 · S3.0 — 入口页
 *
 * 简单的项目列表 + 创建入口。点击进入项目工作台。
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Film } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ComicV3IndexPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard/comic-v3");

  const projects = await prisma.comicProjectV3.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      mode: true,
      status: true,
      progress: true,
      currentStep: true,
      totalCost: true,
      estimatedCost: true,
      coverUrl: true,
      finalVideoUrl: true,
      createdAt: true,
    },
  });

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Film className="w-6 h-6 text-violet-600" />
            AI 漫剧 <span className="text-violet-600">S3.0</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            一句话生成漫剧 · 每一步可暂停 / 选候选 / 编辑 / 重跑
          </p>
        </div>
        <Link
          href="/dashboard/comic-v3/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
        >
          <Plus className="w-4 h-4" />
          新建项目
        </Link>
      </header>

      {projects.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center">
            <Film className="w-8 h-8" />
          </div>
          <div className="text-lg font-semibold text-slate-900">还没有项目</div>
          <div className="text-sm text-slate-500 mt-1 mb-6">
            创建第一个 S3.0 项目，体验交互式漫剧生成
          </div>
          <Link
            href="/dashboard/comic-v3/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
          >
            <Plus className="w-4 h-4" /> 创建项目
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/comic-v3/${p.id}`}
              className="block group"
            >
              <Card className="overflow-hidden transition hover:shadow-md hover:border-violet-300 h-full flex flex-col">
                <div className="aspect-video bg-gradient-to-br from-violet-100 via-fuchsia-50 to-rose-50 flex items-center justify-center relative">
                  {p.coverUrl ? (
                    <img src={p.coverUrl} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <Film className="w-10 h-10 text-violet-300" />
                  )}
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={p.status} />
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="text-sm font-semibold text-slate-900 line-clamp-1 group-hover:text-violet-700">
                    {p.title}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>{p.mode === "auto" ? "自动" : "逐步"}</span>
                    <span className="text-slate-300">·</span>
                    <span>进度 {p.progress}%</span>
                  </div>
                  <div className="mt-auto pt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      ¥ {p.totalCost.toFixed(2)}{" "}
                      <span className="text-slate-300">/ 估 {p.estimatedCost.toFixed(2)}</span>
                    </span>
                    <span className="text-slate-400">
                      {new Date(p.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "草稿", cls: "bg-slate-100 text-slate-600" },
    running: { label: "运行中", cls: "bg-violet-100 text-violet-700" },
    awaiting_user: { label: "待你选择", cls: "bg-amber-100 text-amber-700" },
    paused: { label: "暂停", cls: "bg-slate-100 text-slate-600" },
    failed: { label: "失败", cls: "bg-rose-100 text-rose-700" },
    completed: { label: "已完成", cls: "bg-emerald-100 text-emerald-700" },
  };
  const v = map[status] || { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}
