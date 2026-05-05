"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  User,
  Lightbulb,
  Search,
  Wallet,
  Wand2,
  Film,
  AudioLines,
  Bot,
} from "lucide-react";
import { formatMoney } from "@/lib/utils";

export type WorkspaceModel = {
  id: string;
  slug: string;
  name: string;
  type: "chat" | "image" | "video" | "audio" | "embedding";
  description: string;
  provider: string;
  providerSlug: string;
  logo: string;
  tags: string[];
  health: number;
  usableChannels: number;
  hasChannel: boolean;
};

type WorkspaceUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
  balance: number;
};

type MainTab = "model" | "agent" | "inspire";
type SubTab = "all" | "chat" | "image" | "video" | "audio";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "chat", label: "聊天" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
];

const AGENTS = [
  {
    slug: "comic-multiframe",
    name: "AI 漫剧 · S2.0",
    desc: "智能多帧融合 · 14 步流水线 · 一键成片",
    icon: Film,
    color: "from-cyan-400 to-blue-500",
    href: "/dashboard/comic-multiframe",
    tag: "多模态",
  },
  {
    slug: "comic-auto",
    name: "自动漫画智能体",
    desc: "关键词分析 + 分镜生图，一键生成漫画格",
    icon: Wand2,
    color: "from-violet-400 to-indigo-500",
    href: "/dashboard/comic-auto",
    tag: "新",
  },
  {
    slug: "explain-comic",
    name: "解说漫剧",
    desc: "上传图片 + 剧本，自动生成解说短视频",
    icon: Wand2,
    color: "from-fuchsia-400 to-pink-500",
    href: "/dashboard/explain-comic",
    tag: "推荐",
  },
  {
    slug: "voice-clone",
    name: "声音克隆",
    desc: "10 秒样本即克隆专属音色，永久使用",
    icon: AudioLines,
    color: "from-amber-400 to-orange-500",
    href: "/dashboard/voices",
    tag: "Vidu",
  },
  {
    slug: "chat-multi",
    name: "多模型对话",
    desc: "同时调用多个大模型，AI 智能聚合最终答案",
    icon: Bot,
    color: "from-emerald-400 to-teal-500",
    href: "/dashboard/chat-multi",
    tag: "多模型",
  },
];

const INSPIRES = [
  { id: "1", title: "霓虹道士", author: "军刀", cover: "https://picsum.photos/seed/comic1/400/300", likes: 128 },
  { id: "2", title: "末日重启", author: "李白", cover: "https://picsum.photos/seed/comic2/400/300", likes: 86 },
  { id: "3", title: "二狗追夫", author: "张三", cover: "https://picsum.photos/seed/comic3/400/300", likes: 412 },
  { id: "4", title: "极光之夜", author: "王五", cover: "https://picsum.photos/seed/comic4/400/300", likes: 233 },
];

export default function WorkspaceClient({
  user,
  models,
}: {
  user: WorkspaceUser;
  models: WorkspaceModel[];
}) {
  const [mainTab, setMainTab] = useState<MainTab>("model");
  const [subTab, setSubTab] = useState<SubTab>("chat");
  const [q, setQ] = useState("");
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (subTab !== "all") {
        if (subTab === "audio" && m.type !== "audio") return false;
        if (subTab !== "audio" && m.type !== subTab) return false;
      }
      if (q && !(m.name.toLowerCase().includes(q.toLowerCase()) || m.description.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [models, subTab, q]);

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* ======== 侧边栏 ======== */}
      <aside className="w-[300px] shrink-0 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-white/5 flex flex-col">
        {/* 顶部品牌 */}
        <div className="p-5 text-center">
          <div className="text-[11px] tracking-wider text-slate-400 uppercase">AI 大模型聚合平台</div>
        </div>

        {/* 三大 Tab */}
        <div className="px-4 mb-4">
          <div className="grid grid-cols-3 gap-1.5">
            <MainTabButton
              active={mainTab === "model"}
              onClick={() => setMainTab("model")}
              icon={<Sparkles className="w-5 h-5" />}
              label="大模型"
              activeGradient="from-cyan-500 to-blue-500"
            />
            <MainTabButton
              active={mainTab === "agent"}
              onClick={() => setMainTab("agent")}
              icon={<User className="w-5 h-5" />}
              label="智能体"
              activeGradient="from-fuchsia-500 to-pink-500"
            />
            <MainTabButton
              active={mainTab === "inspire"}
              onClick={() => setMainTab("inspire")}
              icon={<Lightbulb className="w-5 h-5" />}
              label="灵感广场"
              activeGradient="from-amber-500 to-orange-500"
            />
          </div>
        </div>

        {mainTab === "model" && (
          <>
            {/* 子 tab */}
            <div className="px-4 mb-3">
              <div className="grid grid-cols-5 gap-1 text-xs">
                {SUB_TABS.map((t) => {
                  const active = subTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSubTab(t.id)}
                      className={[
                        "py-1.5 rounded-md transition flex items-center justify-center gap-1",
                        active
                          ? "bg-amber-400 text-slate-900 font-medium shadow shadow-amber-500/30"
                          : "text-slate-400 hover:bg-white/5",
                      ].join(" ")}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 搜索框 */}
            <div className="px-4 mb-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="搜索模型或功能…"
                  className="w-full bg-slate-900/60 border border-amber-500/40 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* 模型列表 */}
            <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-1.5 custom-scroll">
              {filteredModels.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-12">没有找到匹配的模型</div>
              ) : (
                filteredModels.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    active={activeModelId === m.id}
                    onClick={() => setActiveModelId(m.id)}
                  />
                ))
              )}
            </div>
          </>
        )}

        {mainTab === "agent" && (
          <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2 custom-scroll">
            {AGENTS.map((a) => (
              <Link
                key={a.slug}
                href={a.href}
                className="block rounded-xl bg-slate-900/40 border border-white/5 hover:border-fuchsia-500/40 hover:bg-slate-900/60 transition p-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.color} flex items-center justify-center shadow-lg`}>
                    <a.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-100 truncate">{a.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25">
                        {a.tag}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{a.desc}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {mainTab === "inspire" && (
          <div className="flex-1 overflow-y-auto px-3 pb-2 custom-scroll">
            <div className="grid grid-cols-2 gap-2">
              {INSPIRES.map((it) => (
                <button
                  key={it.id}
                  className="rounded-xl overflow-hidden bg-slate-900/40 border border-white/5 hover:border-amber-500/40 transition group"
                >
                  <div className="relative aspect-video bg-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.cover} alt={it.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div className="p-2">
                    <div className="text-xs text-slate-200 truncate font-medium">{it.title}</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-slate-500">{it.author}</span>
                      <span className="text-[10px] text-amber-400">♥ {it.likes}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="text-center text-[10px] text-slate-500 mt-3">— 更多作品敬请期待 —</div>
          </div>
        )}

        {/* 底部用户区 */}
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-semibold">
                  {user.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-100 truncate">{user.name}</div>
              <div className="text-[11px] text-emerald-400">在线</div>
            </div>
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-amber-400 text-slate-900 font-medium hover:bg-amber-300 transition shadow shadow-amber-500/30"
            >
              <Wallet className="w-3 h-3" />
              充值
            </Link>
          </div>
          <div className="mt-2 px-1 text-[11px] text-slate-500">
            余额：<span className="text-slate-300 font-medium">¥ {formatMoney(user.balance)}</span>
          </div>
        </div>
      </aside>

      {/* ======== 主体区 ======== */}
      <main className="flex-1 overflow-auto">
        <WorkspaceMain
          mainTab={mainTab}
          activeModel={activeModelId ? models.find((m) => m.id === activeModelId) ?? null : null}
        />
      </main>

      {/* 自定义滚动条 */}
      <style jsx global>{`
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.16); }
      `}</style>
    </div>
  );
}

/* ============ 主 Tab 按钮 ============ */
function MainTabButton({
  active,
  onClick,
  icon,
  label,
  activeGradient,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeGradient: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "relative flex flex-col items-center gap-1 py-2.5 rounded-xl transition group",
        active
          ? `bg-gradient-to-br ${activeGradient} text-white shadow-lg`
          : "bg-slate-900/40 text-slate-400 hover:bg-slate-900/70",
      ].join(" ")}
    >
      <div className={active ? "" : "group-hover:text-slate-200"}>{icon}</div>
      <span className="text-xs font-medium">{label}</span>
      {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/80" />}
    </button>
  );
}

/* ============ 模型卡 ============ */
function ModelCard({
  model,
  active,
  onClick,
}: {
  model: WorkspaceModel;
  active: boolean;
  onClick: () => void;
}) {
  // 健康度颜色：>= 80 绿，>= 30 黄，< 30 红
  const healthCls =
    model.health >= 80
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : model.health >= 30
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-rose-500/15 text-rose-300 border-rose-500/30";

  // 多模态特殊徽章
  const isMulti = model.tags.includes("多模态") || model.tags.includes("multimodal");

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3 transition group relative",
        active
          ? "bg-gradient-to-r from-emerald-600/30 to-emerald-500/10 border border-emerald-400/40 shadow-lg shadow-emerald-500/10"
          : "border border-white/5 hover:bg-white/5 hover:border-white/10",
      ].join(" ")}
    >
      {/* 左侧 logo */}
      <div className="w-9 h-9 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-base shrink-0">
        {model.logo}
      </div>
      {/* 主体 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-medium text-slate-100 truncate">{model.name}</span>
          {isMulti ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25 shrink-0">
              多模态
            </span>
          ) : (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${healthCls}`}>
              {model.health}%
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 line-clamp-2 leading-snug">{model.description}</div>
      </div>
      {active && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gradient-to-b from-emerald-300 to-emerald-500" />
      )}
    </button>
  );
}

/* ============ 主体区（右侧） ============ */
function WorkspaceMain({
  mainTab,
  activeModel,
}: {
  mainTab: MainTab;
  activeModel: WorkspaceModel | null;
}) {
  // 简洁占位主体；真正点击模型/智能体会跳到对应页面
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-10 relative overflow-hidden">
      {/* 极光背景 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[10%] left-[20%] w-[400px] h-[400px] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-[10%] right-[15%] w-[500px] h-[500px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="relative max-w-2xl text-center">
        {!activeModel ? (
          <>
            <div className="w-16 h-16 rounded-2xl mx-auto bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mb-5 shadow-2xl shadow-cyan-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
              {mainTab === "model" ? "选择一个大模型开始对话" : mainTab === "agent" ? "选择一个智能体开始创作" : "在灵感广场寻找灵感"}
            </div>
            <div className="text-sm text-slate-500">
              {mainTab === "model"
                ? "左侧列表实时显示所有已接入模型的可用率，点击即可进入对应工作台。"
                : mainTab === "agent"
                ? "AI 漫剧、解说漫剧、声音克隆等专属智能体，开箱即用。"
                : "看看其他用户用 AI 创作出了什么。"}
            </div>
          </>
        ) : (
          <ActiveModelHero model={activeModel} />
        )}
      </div>
    </div>
  );
}

function ActiveModelHero({ model }: { model: WorkspaceModel }) {
  const target = (() => {
    if (model.type === "chat") return `/dashboard/chat?model=${model.id}`;
    if (model.type === "image") return `/dashboard/image?model=${model.id}`;
    if (model.type === "video") return `/dashboard/video?model=${model.id}`;
    if (model.type === "audio") return `/dashboard/voices`;
    return "/dashboard";
  })();
  return (
    <>
      <div className="w-20 h-20 rounded-2xl mx-auto bg-slate-800 border border-white/10 flex items-center justify-center text-3xl mb-4">
        {model.logo}
      </div>
      <div className="text-3xl font-bold tracking-tight mb-1">{model.name}</div>
      <div className="text-sm text-slate-400 mb-3">{model.provider}</div>
      <p className="text-sm text-slate-300 leading-relaxed mb-5 max-w-xl mx-auto">{model.description}</p>
      <div className="flex items-center justify-center gap-2 mb-6">
        <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          可用率 {model.health}%
        </span>
        <span className="text-xs px-3 py-1 rounded-full bg-slate-700/50 text-slate-300 border border-white/10">
          {model.type === "chat" ? "对话" : model.type === "image" ? "图像" : model.type === "video" ? "视频" : "音频"}
        </span>
        <span className="text-xs px-3 py-1 rounded-full bg-slate-700/50 text-slate-300 border border-white/10">
          {model.usableChannels} 条可用渠道
        </span>
      </div>
      <Link
        href={target}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition"
      >
        <Sparkles className="w-4 h-4" />
        进入工作台
      </Link>
    </>
  );
}
