/**
 * 电商一键出图 · 自动化配置
 *
 *   阶段 0：纯 UI 展示，保存到 EcomAutoConfig 表，但引擎暂不读
 *   阶段 4：接入引擎实现自动确认
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function EcomImageSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard/ecom-image/settings");

  const config = await prisma.ecomAutoConfig.findUnique({
    where: { userId: session.id },
  });

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <header className="mb-6">
        <Link
          href="/dashboard/ecom-image"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-2"
        >
          <ChevronLeft className="w-4 h-4" />
          返回项目列表
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">自动化配置</h1>
        <p className="text-sm text-slate-500 mt-1">
          配置每个节点是否自动确认 / 失败重试上限 / 每方案出图数。仅作用于本用户。
        </p>
      </header>

      <Card className="p-5 mb-4 bg-amber-50/40 border-amber-200">
        <div className="text-xs text-amber-700">
          ℹ️ 阶段 0：自动化配置可保存，但<strong>暂未接入引擎</strong>。
          所有节点仍需手动确认。后续阶段开启此能力。
        </div>
      </Card>

      <SettingsForm
        initial={
          config
            ? {
                autoConfirm: safeParse(config.autoConfirm, {} as Record<string, boolean>),
                retryChat: config.retryChat,
                retryImageGen: config.retryImageGen,
                imagesPerPlan: config.imagesPerPlan,
                defaultImageModelSlug: config.defaultImageModelSlug ?? "",
                defaultPromptLanguage: (config.defaultPromptLanguage as "zh" | "en") ?? "zh",
              }
            : null
        }
      />
    </div>
  );
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
