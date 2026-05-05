"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Plus,
  RefreshCcw,
  Lock,
  Unlock,
  Loader2,
  Trash2,
  Download,
  Share2,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import type { ComicCharacter } from "./ShotWorkbench";

const VISUAL_STYLES = [
  { slug: "", label: "默认（无预设）" },
  { slug: "hk_neon", label: "港式复古霓虹" },
  { slug: "guofeng", label: "国风水墨" },
  { slug: "anime90s", label: "90 年代日漫" },
  { slug: "pixar3d", label: "皮克斯 3D" },
  { slug: "noir", label: "黑色电影" },
  { slug: "ghibli", label: "吉卜力" },
  { slug: "cyberpunk", label: "赛博朋克" },
  { slug: "realistic", label: "写实摄影" },
];

type AssetType = "character" | "scene" | "prop" | "skill";

const TYPE_TABS: { id: AssetType; label: string; tone: string }[] = [
  { id: "character", label: "角色", tone: "fuchsia" },
  { id: "scene", label: "场景", tone: "cyan" },
  { id: "prop", label: "道具", tone: "slate" },
  { id: "skill", label: "技能", tone: "amber" },
];

export type CharacterFull = ComicCharacter & {
  referenceUrls?: string[];
  nameLocked?: boolean;
};

export default function AssetLibraryDialog({
  projectId,
  characters,
  visualStyle,
  onClose,
  onChange,
}: {
  projectId: string;
  characters: CharacterFull[];
  visualStyle: string | null;
  onClose: () => void;
  /** 任何修改后通知外部刷新 */
  onChange: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AssetType>("character");
  const [styleSlug, setStyleSlug] = useState<string>(visualStyle || "");
  const [styleOpen, setStyleOpen] = useState(false);

  const grouped = useMemo(() => {
    const m: Record<AssetType, CharacterFull[]> = {
      character: [],
      scene: [],
      prop: [],
      skill: [],
    };
    for (const c of characters) {
      const t = (c.type as AssetType) || "character";
      if (m[t]) m[t].push(c);
    }
    return m;
  }, [characters]);

  const list = grouped[activeTab] || [];

  /* ---- 操作 ---- */
  const apiBase = `/api/comic-multiframe/projects/${projectId}`;

  async function patchProjectStyle(slug: string) {
    setStyleSlug(slug);
    setStyleOpen(false);
    try {
      await fetch(apiBase, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visualStyle: slug }),
      });
      onChange();
    } catch (e) {
      console.error(e);
    }
  }

  async function regenChar(charId: string, replaceIndex?: number) {
    await fetch(`${apiBase}/characters/${charId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "regen-image",
        ...(replaceIndex != null ? { replaceIndex } : {}),
      }),
    });
    onChange();
  }

  async function patchChar(charId: string, patch: Record<string, unknown>) {
    await fetch(`${apiBase}/characters/${charId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    onChange();
  }

  async function deleteChar(charId: string) {
    if (!confirm("删除该资产？此操作不可撤销。")) return;
    await fetch(`${apiBase}/characters/${charId}`, { method: "DELETE" });
    onChange();
  }

  async function addChar() {
    const name = prompt(`新增${TYPE_TABS.find((t) => t.id === activeTab)?.label}名称（≤12字）`);
    if (!name?.trim()) return;
    const description = prompt("简单描述（外观/性格/特点，可留空）") || "";
    await fetch(`${apiBase}/characters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: activeTab,
        name: name.trim(),
        description,
      }),
    });
    onChange();
  }

  /* ---- 全选下载 / 分享 ---- */
  function downloadAll() {
    const urls = list.flatMap((c) => c.referenceUrls?.length ? c.referenceUrls : c.referenceUrl ? [c.referenceUrl] : []);
    if (urls.length === 0) return;
    for (const u of urls) {
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  /* ---- 总数（每个 tab 统计） ---- */
  function tabCount(t: AssetType) {
    return grouped[t].length;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[90vh] rounded-3xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* 顶部 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fuchsia-100 to-cyan-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-fuchsia-600" />
          </div>
          <div className="flex-1">
            <div className="text-base font-semibold text-slate-800">资产库</div>
            <div className="text-xs text-slate-500">管理项目的角色、场景和道具，生成漫剧时系统会自动匹配。</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 工具行：tabs + 风格 + 添加 */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-full bg-slate-100/70 p-1">
            {TYPE_TABS.map((t) => {
              const active = activeTab === t.id;
              const count = tabCount(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={[
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition",
                    active
                      ? `${tabActiveCls(t.tone)} shadow-sm`
                      : "text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
                  <TypeIcon type={t.id} />
                  {t.label}
                  <span className="font-mono text-[10px]">{count}</span>
                </button>
              );
            })}
          </div>

          {/* 风格选择 */}
          <div className="relative">
            <button
              onClick={() => setStyleOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs hover:bg-amber-100"
            >
              <span>⭐</span>
              <span className="text-amber-500">风格：</span>
              <span className="font-medium">
                {VISUAL_STYLES.find((s) => s.slug === styleSlug)?.label || "默认"}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {styleOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 rounded-xl bg-white shadow-lg border border-slate-200 py-1 min-w-[200px]">
                {VISUAL_STYLES.map((s) => (
                  <button
                    key={s.slug || "none"}
                    onClick={() => patchProjectStyle(s.slug)}
                    className={[
                      "w-full px-3 py-2 text-left text-xs hover:bg-slate-50",
                      s.slug === styleSlug ? "text-amber-700 font-medium" : "text-slate-700",
                    ].join(" ")}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={addChar}
            className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100"
          >
            <Plus className="w-3 h-3" />
            添加资产
          </button>
        </div>

        {/* 主区：网格 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {list.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-sm text-slate-400 py-16">
              <div className="text-5xl mb-3">🗂️</div>
              <div>暂无{TYPE_TABS.find((t) => t.id === activeTab)?.label}</div>
              <button
                onClick={addChar}
                className="mt-3 text-xs px-3 py-1.5 rounded-full border border-slate-200 hover:border-slate-300"
              >
                + 添加一个
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {list.map((c) => (
                <AssetCard
                  key={c.id}
                  char={c}
                  onRegen={(idx) => regenChar(c.id, idx)}
                  onPatch={(p) => patchChar(c.id, p)}
                  onDelete={() => deleteChar(c.id)}
                />
              ))}
              <div className="text-center text-xs text-slate-400 py-3 col-span-full">没有更多了</div>
            </div>
          )}
        </div>

        {/* 底栏 */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            共 <span className="font-semibold text-slate-700">{list.length}</span> 个
            {TYPE_TABS.find((t) => t.id === activeTab)?.label}
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
              <Plus className="w-3 h-3" />
              导入资产
            </button>
            <button className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
              <Share2 className="w-3 h-3" />
              分享
            </button>
            <button
              onClick={downloadAll}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-3 h-3" />
              一键下载
            </button>
            <button
              onClick={onClose}
              className="text-xs px-4 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={onClose}
              className="text-xs px-5 py-1.5 rounded-full bg-fuchsia-500 text-white hover:bg-fuchsia-600 shadow"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ 单张资产卡 ============ */
function AssetCard({
  char,
  onRegen,
  onPatch,
  onDelete,
}: {
  char: CharacterFull;
  onRegen: (replaceIndex?: number) => Promise<void>;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(char.name);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setName(char.name), [char.name]);

  const refs = char.referenceUrls && char.referenceUrls.length > 0
    ? char.referenceUrls
    : char.referenceUrl
    ? [char.referenceUrl]
    : [];
  const main = refs[0];
  const subs = refs.slice(1);

  async function handleRegen(idx?: number) {
    setBusy(idx == null ? "append" : `replace-${idx}`);
    try {
      await onRegen(idx);
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    if (!name.trim() || name === char.name) {
      setEditing(false);
      return;
    }
    setBusy("save-name");
    try {
      await onPatch({ name: name.trim() });
      setEditing(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg transition group">
      {/* 主图 + 子图列 */}
      <div className="flex bg-slate-50 aspect-[5/4]">
        <div className="flex-1 relative group/main">
          {main ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={main} alt={char.name} className="w-full h-full object-cover" />
          ) : (
            <button
              onClick={() => handleRegen()}
              disabled={!!busy}
              className="w-full h-full bg-slate-100 flex flex-col items-center justify-center text-slate-400 hover:text-fuchsia-600 hover:bg-slate-50"
            >
              {busy === "append" ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Plus className="w-6 h-6 mb-1" />
                  <span className="text-xs">生成首图</span>
                </>
              )}
            </button>
          )}
          {/* 主图大标签 */}
          {main && (
            <div className="absolute bottom-2 left-2 bg-black/65 backdrop-blur px-2.5 py-1 rounded text-white font-bold text-base">
              {char.name}
            </div>
          )}
        </div>
        {/* 副图栏 */}
        <div className="w-[35%] flex flex-col border-l border-white/40">
          {[0, 1, 2].map((i) => {
            const u = subs[i];
            const slot = i + 1;
            const slotBusy = busy === `replace-${slot}`;
            return (
              <div key={i} className="flex-1 relative group/sub border-b last:border-b-0 border-white/40">
                {u ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => handleRegen(slot)}
                      disabled={!!busy}
                      className="absolute inset-0 bg-black/0 group-hover/sub:bg-black/40 flex items-center justify-center text-white opacity-0 group-hover/sub:opacity-100 transition disabled:opacity-100"
                    >
                      {slotBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleRegen()}
                    disabled={!!busy}
                    className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300 hover:text-fuchsia-600 hover:bg-slate-50"
                  >
                    {busy === "append" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 名字 + 操作 */}
      <div className="px-3 py-2 flex items-center gap-2">
        {editing ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setName(char.name);
                  setEditing(false);
                }
              }}
              autoFocus
              className="flex-1 text-sm font-medium px-2 py-0.5 rounded border border-cyan-300 outline-none"
            />
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              title="点击修改名字（修改后自动锁定）"
              className="flex-1 text-left text-sm font-medium text-slate-800 truncate hover:text-cyan-600"
            >
              {char.name}
            </button>
            {char.nameLocked ? (
              <button
                onClick={() => onPatch({ nameLocked: false })}
                title="名字已锁定，点击解锁"
                className="text-amber-600 hover:text-amber-700"
              >
                <Lock className="w-3 h-3" />
              </button>
            ) : (
              <Unlock className="w-3 h-3 text-slate-300" />
            )}
          </>
        )}

        <button
          onClick={() => handleRegen()}
          disabled={!!busy}
          title="新增一张参考图"
          className="w-7 h-7 rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 flex items-center justify-center disabled:opacity-50"
        >
          {busy === "append" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
        </button>
        <button
          onClick={onDelete}
          title="删除"
          className="w-7 h-7 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ============ 小部件 ============ */

function tabActiveCls(tone: string): string {
  const map: Record<string, string> = {
    fuchsia: "bg-white text-fuchsia-700",
    cyan: "bg-white text-cyan-700",
    slate: "bg-white text-slate-700",
    amber: "bg-white text-amber-700",
  };
  return map[tone] || "bg-white text-slate-700";
}

function TypeIcon({ type }: { type: AssetType }) {
  const map: Record<AssetType, string> = {
    character: "👤",
    scene: "🏞️",
    prop: "○",
    skill: "✦",
  };
  return <span className="text-[12px]">{map[type]}</span>;
}
