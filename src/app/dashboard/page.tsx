import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, Badge } from "@/components/ui";
import { SafeImage, SafeVideo } from "@/components/media/SafeMedia";
import { formatMoney, relativeTime } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { Wallet, TrendingUp, Users, Zap, ArrowRight, FolderHeart, Music } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const session = await requireUser();
  const [user, usage7d, recentUsages, invited, recentAssets, assetCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    prisma.usage.findMany({
      where: { userId: session.id, createdAt: { gte: new Date(Date.now() - 7 * 86400 * 1000) } },
    }),
    prisma.usage.findMany({
      where: { userId: session.id },
      include: { model: { include: { provider: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.user.count({ where: { referredById: session.id } }),
    prisma.mediaAsset.findMany({
      where: { userId: session.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.mediaAsset.count({ where: { userId: session.id, deletedAt: null } }),
  ]);
  if (!user) return null;
  const { t } = await getT();

  const spent7d = usage7d.reduce((s, u) => s + u.cost, 0);
  const calls7d = usage7d.length;

  const stats = [
    { label: t("dashhome.stats.balance"),   value: `¥ ${formatMoney(user.balance)}`,  icon: <Wallet className="w-5 h-5" />,     color: "brand"  },
    { label: t("dashhome.stats.spent7d"),   value: `¥ ${formatMoney(spent7d)}`,        icon: <TrendingUp className="w-5 h-5" />, color: "violet" },
    { label: t("dashhome.stats.calls7d"),   value: `${calls7d} ${t("dashhome.stats.calls_unit")}`,    icon: <Zap className="w-5 h-5" />,    color: "amber"  },
    { label: t("dashhome.stats.referrals"), value: `${invited} ${t("dashhome.stats.referrals_unit")}`, icon: <Users className="w-5 h-5" />,  color: "green"  },
  ] as const;

  return (
    <div className="p-6 md:p-8 space-y-6 animate-fade-up">
      <div className="relative overflow-hidden rounded-2xl bg-aurora border border-slate-200/70 px-6 py-5 flex items-center justify-between hud-frame">
        <span className="hud-tl" /><span className="hud-tr" /><span className="hud-bl" /><span className="hud-br" />
        <div className="aurora-blob w-[260px] h-[260px] -top-24 -right-8 bg-pink-300/35" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="chip-tech chip-live"><span className="dot pulse-dot" />{t("dashhome.chip.online")}</span>
            <span className="chip-tech chip-brand"><span className="dot" />{t("dashhome.chip.session")}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("dashhome.welcome_prefix")}<span className="gradient-text">{user.name || t("dashhome.default_name")}</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm">{t("dashhome.welcome_desc")}</p>
        </div>
        <Link href="/dashboard/chat" className="relative hidden md:inline-flex items-center gap-1.5 px-5 h-10 rounded-xl btn-glow font-medium active:scale-[0.98] touch-manipulation">
          {t("dashhome.start_chat")} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} hover className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{s.label}</span>
              <Badge color={s.color as any}>{s.icon}</Badge>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight">{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <FolderHeart className="w-4 h-4 text-brand-600" />
              {t("dashhome.recent_assets")}
              <Badge color="slate">{assetCount}</Badge>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t("dashhome.recent_assets_desc")}</p>
          </div>
          <Link href="/dashboard/gallery" className="text-sm text-brand-600 hover:text-brand-700">
            {t("dashhome.bar_link")}
          </Link>
        </div>
        {recentAssets.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">
            {t("dashhome.no_assets")} <Link href="/dashboard/image" className="text-brand-600">{t("dashhome.gen_image")}</Link>
            {" · "}<Link href="/dashboard/tasks" className="text-brand-600">{t("dashhome.submit_task")}</Link>
          </div>
        ) : (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {recentAssets.map((a) => (
              <Link
                key={a.id}
                href="/dashboard/gallery"
                className="relative block aspect-square rounded-lg overflow-hidden bg-slate-100 hover:ring-2 hover:ring-brand-400 transition"
                title={a.prompt || ""}
              >
                {a.type === "image" ? (
                  <SafeImage src={a.thumbnailUrl || a.url} alt="" className="w-full h-full object-cover" />
                ) : a.type === "video" ? (
                  a.thumbnailUrl ? (
                    <SafeImage src={a.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <SafeVideo src={a.url} className="w-full h-full object-cover" muted />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-rose-100">
                    <Music className="w-6 h-6 text-violet-500" />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 text-[10px] text-white bg-black/50 px-1 py-0.5 truncate">
                  {a.type}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t("dashhome.recent_usage")}</h2>
            <Link href="/dashboard/billing" className="text-sm text-brand-600 hover:text-brand-700">{t("common.view_all")}</Link>
          </div>
          {recentUsages.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              {t("dashhome.no_usage")} <Link href="/dashboard/chat" className="text-brand-600">{t("dashhome.start_chat_link")}</Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentUsages.map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">{u.model.provider.logo || "🤖"}</div>
                    <div>
                      <div className="font-medium">{u.model.name}</div>
                      <div className="text-xs text-slate-500">
                        {u.type === "chat" ? `${u.inputTokens}→${u.outputTokens} tokens` : `${u.units} ${u.model.unit || ""}`}
                        {" · "}{relativeTime(u.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">¥ {formatMoney(u.cost, 4)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-3">{t("dashhome.quick.title")}</h2>
          <div className="space-y-2 text-sm">
            {[
              { href: "/dashboard/chat",  label: t("dashhome.quick.chat.label"),  desc: t("dashhome.quick.chat.desc") },
              { href: "/dashboard/image", label: t("dashhome.quick.image.label"), desc: t("dashhome.quick.image.desc") },
              { href: "/dashboard/ecom-image", label: "电商一键出图 ✨", desc: "上传商品 → AI 7 节点 → 批量出图" },
              { href: "/dashboard/video", label: t("dashhome.quick.video.label"), desc: t("dashhome.quick.video.desc") },
              { href: "/dashboard/keys",  label: t("dashhome.quick.keys.label"),  desc: t("dashhome.quick.keys.desc") },
            ].map((q) => (
              <Link key={q.href} href={q.href} className="group flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-gradient-to-r hover:from-brand-50/60 hover:to-purple-50/60 transition">
                <div>
                  <div className="font-medium">{q.label}</div>
                  <div className="text-xs text-slate-500">{q.desc}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
