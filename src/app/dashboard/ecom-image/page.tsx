/**
 * 电商一键出图 · 项目列表页
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ImagePlus, Plus, Settings, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { NODE_META } from "@/lib/ecom-image/nodes";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  running: "bg-amber-100 text-amber-700",
  awaiting_user: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  paused: "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  running: "运行中",
  awaiting_user: "待确认",
  completed: "已完成",
  failed: "失败",
  paused: "已暂停",
};

export default async function EcomImageIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard/ecom-image");

  const projects = await prisma.ecomProject.findMany({
    where: { userId: session.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      currentNode: true,
      progress: true,
      coverUrl: true,
      initialImageCount: true,
      totalCost: true,
      estimatedCost: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ImagePlus className="w-6 h-6 text-amber-500" />
            电商一键出图
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            上传商品 · AI 智能识别 · 多轮对话 · 精准补全 · 批量出图
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/ecom-image/settings"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 border border-slate-200"
          >
            <Settings className="w-4 h-4" />
            自动化配置
          </Link>
          <Link
            href="/dashboard/ecom-image/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
          >
            <Plus className="w-4 h-4" />
            新建项目
          </Link>
        </div>
      </header>

      {projects.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="text-lg font-semibold text-slate-900">还没有出图项目</div>
          <div className="text-sm text-slate-500 mt-1 mb-6 max-w-md mx-auto">
            上传 1~9 张商品图，让 AI 自动完成商品分析、出图规划、批量生成的全部工作。
            <br />
            每一步可人工审核与微调。
          </div>
          <div className="flex items-center justify-center gap-2">
            <Link
              href="/dashboard/ecom-image/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
            >
              <Plus className="w-4 h-4" /> 创建项目
            </Link>
            <Link
              href="/dashboard/ecom-image/new?demo=1"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 text-amber-600 text-sm font-medium hover:bg-amber-50"
            >
              <Sparkles className="w-4 h-4" /> 一键体验 Demo
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const currentNodeMeta = p.currentNode
              ? NODE_META[p.currentNode as keyof typeof NODE_META] ?? null
              : null;
            return (
              <Link
                key={p.id}
                href={`/dashboard/ecom-image/${p.id}`}
                className="block rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-amber-300 transition-all overflow-hidden"
              >
                <div className="aspect-video bg-slate-50 flex items-center justify-center overflow-hidden">
                  {p.coverUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={p.coverUrl} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-12 h-12 text-slate-300" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        STATUS_COLOR[p.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    {currentNodeMeta && (
                      <span className="text-xs text-slate-500">
                        {currentNodeMeta.title}
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-slate-900 truncate">{p.title}</h3>
                  <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                    <span>{p.initialImageCount} 张商品图</span>
                    <span>{new Date(p.updatedAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                  {/* 进度条 */}
                  <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-[width] duration-500"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
