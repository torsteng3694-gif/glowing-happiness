import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Badge } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import LocaleSwitcher from "@/i18n/LocaleSwitcher";
import { getT } from "@/i18n/server";
import {
  Sparkles, ArrowRight, ShieldCheck, Zap, Coins, Globe2,
  MessageSquare, Image as ImageIcon, Video, Code2, CheckCircle2,
  Activity, Cpu,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  const { t } = await getT();

  // 数据库未就绪时（首次部署、表未建、连接失败）不让首页崩溃，
  // 用空数据降级渲染。修复后下次刷新自然恢复。
  let chatCount = 0;
  let imageCount = 0;
  let videoCount = 0;
  let models: Awaited<ReturnType<typeof prisma.model.findMany>> = [];
  try {
    [chatCount, imageCount, videoCount, models] = await Promise.all([
      prisma.model.count({ where: { type: "chat", enabled: true } }),
      prisma.model.count({ where: { type: "image", enabled: true } }),
      prisma.model.count({ where: { type: "video", enabled: true } }),
      prisma.model.findMany({
        where: { enabled: true },
        include: { provider: true },
        orderBy: { createdAt: "asc" },
        take: 12,
      }),
    ]);
  } catch (err) {
    console.error("[home] DB query failed, rendering with empty fallback:", err);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg group">
            <div className="relative w-9 h-9 rounded-xl gradient-bg flex items-center justify-center text-white shadow-glow-brand">
              <Sparkles className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <span className="tracking-tight">AI Hub</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#models" className="hover:text-slate-900 transition">{t("nav.models")}</a>
            <a href="#features" className="hover:text-slate-900 transition">{t("nav.features")}</a>
            <a href="#pricing" className="hover:text-slate-900 transition">{t("nav.pricing")}</a>
            <a href="#faq" className="hover:text-slate-900 transition">{t("nav.faq")}</a>
            <Link
              href="/xingye"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text font-semibold text-transparent hover:opacity-80 transition"
            >
              {t("nav.xingye")}
              <ArrowRight className="h-3.5 w-3.5 text-purple-500" />
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <LocaleSwitcher variant="ghost" />
            {session ? (
              <Link href="/dashboard" className="text-sm px-4 h-9 inline-flex items-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition">
                {t("common.enter_console")}
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-slate-700 hover:text-slate-900 transition">{t("common.login")}</Link>
                <Link href="/register" className="text-sm px-4 h-9 inline-flex items-center rounded-lg btn-glow">
                  {t("common.register")}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-mesh" />
        <div className="aurora-blob w-[480px] h-[480px] -top-32 -left-20 bg-indigo-300/50" />
        <div className="aurora-blob w-[480px] h-[480px] -top-20 right-0 bg-pink-300/40" />

        <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-32 text-center">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2 animate-fade-up">
            <span className="chip-tech chip-live"><span className="dot pulse-dot" />{t("hero.chip.online")}</span>
            <span className="chip-tech chip-brand"><Activity className="w-3 h-3" />{t("hero.chip.latency")}</span>
            <span className="chip-tech"><Cpu className="w-3 h-3" />{t("hero.chip.version")}</span>
          </div>

          <div className="relative inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white/80 px-3.5 py-1.5 text-xs text-slate-700 shadow-sm mb-8 animate-fade-up hud-frame">
            <span className="hud-tl" /><span className="hud-tr" /><span className="hud-bl" /><span className="hud-br" />
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
            </span>
            {t("hero.badge.new")} <b className="gradient-text font-semibold">{chatCount + imageCount + videoCount}</b> {t("hero.badge.new_suffix")}
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.1] animate-fade-up">
            {t("hero.title.prefix")}<span className="shimmer-text">{t("hero.title.gradient")}</span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto leading-8 animate-fade-up [animation-delay:.12s]">
            {t("hero.desc")}
          </p>
          <div className="mt-10 flex items-center justify-center gap-4 animate-fade-up [animation-delay:.24s]">
            <Link href={session ? "/dashboard" : "/register"}
              className="inline-flex items-center gap-2 h-12 px-7 rounded-xl btn-glow font-medium">
              {session ? t("common.enter_console") : t("hero.cta.start_free")} <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#models" className="inline-flex items-center h-12 px-6 rounded-xl border border-slate-300 bg-white text-slate-700 hover:border-brand-300 font-medium transition-colors duration-100">
              {t("hero.cta.view_models")}
            </a>
          </div>

          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500 animate-fade-up [animation-delay:.36s]">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t("hero.perk.signup_bonus")}</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t("hero.perk.compat_api")}</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t("hero.perk.referral")}</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t("hero.perk.uptime")}</span>
          </div>

          <div className="mt-16 mx-auto max-w-md flow-line" />
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-6 -mt-12 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            { v: chatCount,  label: t("stats.chat_models"),  icon: <MessageSquare className="w-5 h-5" />, tone: "from-indigo-500 to-blue-500",   suffix: "" },
            { v: imageCount, label: t("stats.image_models"), icon: <ImageIcon className="w-5 h-5" />,     tone: "from-purple-500 to-pink-500",   suffix: "" },
            { v: videoCount, label: t("stats.video_models"), icon: <Video className="w-5 h-5" />,         tone: "from-amber-500 to-rose-500",    suffix: "" },
            { v: 99.9,       label: t("stats.uptime"),       icon: <ShieldCheck className="w-5 h-5" />,   tone: "from-emerald-500 to-teal-500",  suffix: "%", decimals: 1 },
          ] as const).map((s, i) => (
            <div key={i} className="glow-hover relative rounded-2xl bg-white border border-slate-200 p-6 shadow-sm flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.tone} text-white flex items-center justify-center shadow-glow-brand`}>{s.icon}</div>
              <div>
                <div className="text-2xl font-bold text-slate-900 tracking-tight">
                  <CountUp value={s.v as number} decimals={(s as any).decimals ?? 0} suffix={s.suffix} />
                </div>
                <div className="text-sm text-slate-500">{s.label}</div>
              </div>
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />live
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24 relative">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-100 rounded-full px-3 py-1 mb-4">
            <Sparkles className="w-3.5 h-3.5" /> {t("features.highlight_chip")}
          </div>
          <h2 className="text-3xl md:text-4xl font-bold">{t("features.title_prefix")} <span className="gradient-text">AI Hub</span></h2>
          <p className="mt-3 text-slate-600">{t("features.subtitle")}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: <Globe2 className="w-6 h-6" />,     title: t("features.f1.title"), desc: t("features.f1.desc") },
            { icon: <Zap className="w-6 h-6" />,        title: t("features.f2.title"), desc: t("features.f2.desc") },
            { icon: <Coins className="w-6 h-6" />,      title: t("features.f3.title"), desc: t("features.f3.desc") },
            { icon: <ShieldCheck className="w-6 h-6" />,title: t("features.f4.title"), desc: t("features.f4.desc") },
            { icon: <Sparkles className="w-6 h-6" />,   title: t("features.f5.title"), desc: t("features.f5.desc") },
            { icon: <Code2 className="w-6 h-6" />,      title: t("features.f6.title"), desc: t("features.f6.desc") },
          ].map((f, i) => (
            <div key={i} className="glow-hover rounded-2xl p-6 bg-white border border-slate-200">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white flex items-center justify-center mb-4 shadow-glow-brand">
                {f.icon}
              </div>
              <h3 className="font-semibold text-lg">{f.title}</h3>
              <p className="mt-2 text-slate-600 text-sm leading-6">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Models */}
      <section id="models" className="relative border-y border-slate-200/70 bg-aurora">
        <div className="max-w-7xl mx-auto px-6 py-24 relative">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">{t("models.title")}</h2>
            <p className="mt-3 text-slate-600">{t("models.subtitle")}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((m) => (
              <div key={m.id} className="glow-hover rounded-2xl p-5 bg-white border border-slate-200">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center text-xl">
                      {m.provider.logo || "🤖"}
                    </div>
                    <div>
                      <div className="font-semibold">{m.name}</div>
                      <div className="text-xs text-slate-500">{m.provider.name}</div>
                    </div>
                  </div>
                  <Badge color={m.type === "chat" ? "brand" : m.type === "image" ? "violet" : "amber"}>
                    {m.type === "chat" ? t("models.type.chat") : m.type === "image" ? t("models.type.image") : t("models.type.video")}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-slate-600 line-clamp-2 min-h-[40px]">{m.description}</p>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    {m.type === "chat"
                      ? `¥${m.inputPrice}/${m.outputPrice} · 1K tok`
                      : `¥${m.unitPrice}/${m.unit === "second" ? t("models.unit.second") : t("models.unit.image")}`}
                  </span>
                  {m.tags?.split(",").filter(Boolean).slice(0, 1).map((tag) => (
                    <Badge key={tag} color="green">{tag}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/register" className="inline-flex items-center gap-1 text-brand-600 font-medium hover:text-brand-700">
              {t("common.view_all")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">{t("pricing.title")}</h2>
          <p className="mt-3 text-slate-600">{t("pricing.subtitle")}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { name: t("pricing.trial.name"),      price: "0",    desc: t("pricing.trial.desc"),
              items: [t("pricing.trial.f1"), t("pricing.trial.f2"), t("pricing.trial.f3")] },
            { name: t("pricing.personal.name"),   price: "100",  desc: t("pricing.personal.desc"), highlight: true,
              items: [t("pricing.personal.f1"), t("pricing.personal.f2"), t("pricing.personal.f3")] },
            { name: t("pricing.enterprise.name"), price: "1000", desc: t("pricing.enterprise.desc"),
              items: [t("pricing.enterprise.f1"), t("pricing.enterprise.f2"), t("pricing.enterprise.f3"), t("pricing.enterprise.f4")] },
          ].map((p, i) => (
            <div
              key={i}
              className={`relative rounded-2xl p-8 transition ${
                p.highlight
                  ? "glow-border bg-gradient-to-b from-brand-50/80 to-white shadow-glow-brand"
                  : "glow-hover border border-slate-200 bg-white"
              }`}
            >
              {p.highlight && <Badge color="brand" className="absolute -top-3 left-1/2 -translate-x-1/2">{t("pricing.recommend")}</Badge>}
              <div className="text-slate-500 text-sm">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className={`text-5xl font-extrabold tracking-tight ${p.highlight ? "gradient-text" : ""}`}>¥{p.price}</span>
                <span className="text-slate-500 text-sm">{t("pricing.from")}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">{p.desc}</div>
              <ul className="mt-6 space-y-3 text-sm">
                {p.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {it}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`mt-8 inline-flex items-center justify-center w-full h-11 rounded-xl font-medium transition ${
                  p.highlight
                    ? "btn-glow"
                    : "border border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-brand-300"
                }`}
              >
                {t("pricing.start_using")}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-4xl mx-auto px-6 pb-24">
        <h2 className="text-3xl font-bold text-center mb-10">{t("faq.title")}</h2>
        <div className="space-y-3">
          {[
            { q: t("faq.q1"), a: t("faq.a1") },
            { q: t("faq.q2"), a: t("faq.a2") },
            { q: t("faq.q3"), a: t("faq.a3") },
            { q: t("faq.q4"), a: t("faq.a4") },
            { q: t("faq.q5"), a: t("faq.a5") },
          ].map((f, i) => (
            <details key={i} className="group rounded-xl border border-slate-200 bg-white p-5 open:shadow-sm hover:border-brand-300 transition-colors duration-100">
              <summary className="flex items-center justify-between cursor-pointer list-none font-medium">
                <span>{f.q}</span>
                <span className="text-slate-400 group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm text-slate-600 leading-7">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-aurora-dark p-12 md:p-16 text-white text-center">
          <div className="aurora-blob w-[380px] h-[380px] -top-16 -left-8 bg-indigo-400/35" />
          <div className="aurora-blob w-[380px] h-[380px] -bottom-20 right-0 bg-pink-400/35" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold">{t("cta.title")}</h2>
            <p className="mt-3 text-white/80">{t("cta.desc")}</p>
            <Link href="/register" className="mt-8 inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-white text-slate-900 font-medium hover:bg-slate-100 shadow-lg transition">
              {t("common.register")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-10 text-sm text-slate-500 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} AI Hub {t("footer.copy_suffix")}</div>
          <div className="flex items-center gap-6">
            <a href="#faq" className="hover:text-slate-700">{t("footer.help")}</a>
            <Link href="/login" className="hover:text-slate-700">{t("common.login")}</Link>
            <Link href="/register" className="hover:text-slate-700">{t("common.signup_short")}</Link>
            <LocaleSwitcher variant="compact" />
          </div>
        </div>
      </footer>
    </div>
  );
}
