"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Plus,
  Loader2,
  Library,
  Wand2,
  RefreshCcw,
  Send,
  RotateCcw,
} from "lucide-react";
import type { ComicCharacter } from "./ShotWorkbench";

/**
 * 资产识别面板 — 在「资产提取」step succeeded 之后展示。
 *
 * - 顶部状态条：✓ 复用 N 绿色徽章 + ✚ 新增 N 紫色徽章 + 操作按钮
 * - 「复用已有资产」分组：从全局资产库复用过来的（sourceAssetId 不为空）
 * - 「需要新建的资产」分组：新生成的 ComicCharacter，按 genStatus 显示不同状态
 * - 底部建议输入框：自然语言修改建议
 */
export default function AssetIdentificationPanel({
  projectId,
  characters,
  onRefresh,
  onOpenAssetLibrary,
}: {
  projectId: string;
  characters: ComicCharacter[];
  onRefresh: () => void;
  onOpenAssetLibrary: () => void;
}) {
  const [advice, setAdvice] = useState("");
  const [refining, setRefining] = useState(false);
  const [oneClickBusy, setOneClickBusy] = useState(false);

  const reused = useMemo(() => characters.filter((c) => c.sourceAssetId), [characters]);
  const fresh = useMemo(() => characters.filter((c) => !c.sourceAssetId), [characters]);
  const pendingCount = useMemo(
    () => characters.filter((c) => c.genStatus === "pending" || c.genStatus === "analyzing").length,
    [characters],
  );

  // 只要还有 pending/analyzing，每 3s 自动 refresh，让"AI 分析中"卡片实时变成完成态
  useEffect(() => {
    if (pendingCount === 0) return;
    const t = setInterval(onRefresh, 3000);
    return () => clearInterval(t);
  }, [pendingCount, onRefresh]);

  const apiBase = `/api/comic-multiframe/projects/${projectId}`;

  async function submitAdvice() {
    if (!advice.trim()) return;
    setRefining(true);
    try {
      const r = await fetch(`${apiBase}/assets/refine`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: advice.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "失败");
      setAdvice("");
      onRefresh();
    } catch (e) {
      alert(`修改建议提交失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefining(false);
    }
  }

  async function regenAll() {
    // 找出所有 pending / failed 的资产，逐个调单角色重生 API
    const targets = characters.filter((c) => c.genStatus !== "ready");
    if (targets.length === 0) return;
    setOneClickBusy(true);
    try {
      for (const c of targets) {
        try {
          await fetch(`${apiBase}/characters/${c.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "regen-image" }),
          });
        } catch {}
      }
      onRefresh();
    } finally {
      setOneClickBusy(false);
    }
  }

  async function manualAdd() {
    const name = prompt("新增资产名称（≤12 字）");
    if (!name?.trim()) return;
    const description = prompt("简单描述（外观 / 特点，可留空）") || "";
    const type = (prompt("类型：character / scene / prop / skill", "character") || "character").trim();
    if (!["character", "scene", "prop", "skill"].includes(type)) {
      alert("类型只能是 character / scene / prop / skill");
      return;
    }
    await fetch(`${apiBase}/characters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, name, description }),
    });
    onRefresh();
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      {/* 顶部 */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-slate-800">资产识别完成</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            以下是从剧本中识别出的需要保持一致性的核心资产
          </div>
        </div>
        <button
          onClick={onRefresh}
          title="刷新"
          className="text-slate-400 hover:text-slate-700"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* 状态条 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
          <span>✓</span>
          复用 {reused.length}
        </span>
        <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-700">
          <Plus className="w-3 h-3" />
          新增 {fresh.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onOpenAssetLibrary}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <Library className="w-3 h-3" />
            从资产库选取
          </button>
          <button
            onClick={regenAll}
            disabled={oneClickBusy || pendingCount === 0}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {oneClickBusy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <span>⭐</span>
            )}
            一键生成剩余 {pendingCount} 个
          </button>
        </div>
      </div>

      {/* 复用已有资产 */}
      {reused.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-slate-700">复用已有资产</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {reused.map((c) => (
              <ReadyCard key={c.id} char={c} />
            ))}
          </div>
        </div>
      )}

      {/* 需要新建的资产 */}
      {(fresh.length > 0 || true) && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
            <span className="text-xs font-medium text-slate-700">需要新建的资产</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {fresh.map((c) => (
              <FreshCard key={c.id} char={c} apiBase={apiBase} onRefresh={onRefresh} />
            ))}
            {/* 手动添加占位卡 */}
            <button
              onClick={manualAdd}
              className="aspect-[4/5] rounded-xl border-2 border-dashed border-slate-300 bg-white hover:border-fuchsia-400 hover:bg-fuchsia-50/40 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-fuchsia-600 transition"
            >
              <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">手动添加资产</span>
              <span className="text-[10px]">点击添加</span>
            </button>
          </div>
        </div>
      )}

      {/* 底部状态行 */}
      {pendingCount > 0 && (
        <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
          <Loader2 className="w-3 h-3 animate-spin" />
          等待所有资产图就绪（剩 {pendingCount} 个）
        </div>
      )}

      {/* 修改建议输入框 */}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 className="w-3 h-3 text-cyan-600" />
          <span className="text-xs text-slate-600">对资产识别有修改建议？</span>
        </div>
        <div className="relative">
          <input
            value={advice}
            onChange={(e) => setAdvice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !refining) submitAdvice();
            }}
            disabled={refining}
            placeholder="输入修改建议后按回车重新分析…"
            className="w-full text-sm px-4 py-2.5 pr-20 rounded-xl border border-slate-200 bg-slate-50/40 outline-none focus:border-cyan-300 focus:bg-white"
          />
          <button
            onClick={submitAdvice}
            disabled={refining || !advice.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Enter
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ 已就绪资产卡（复用 / 已生图） ============ */
function ReadyCard({ char }: { char: ComicCharacter }) {
  const refs = char.referenceUrls && char.referenceUrls.length > 0
    ? char.referenceUrls
    : char.referenceUrl
    ? [char.referenceUrl]
    : [];
  const main = refs[0];
  const subs = refs.slice(1, 4);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition group">
      <div className="relative">
        <TypeBadge type={char.type} />
        <div className="flex bg-slate-50 aspect-[5/4]">
          <div className="flex-1 relative">
            {main ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={main} alt={char.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-slate-100" />
            )}
            {main && (
              <div className="absolute bottom-1.5 left-1.5 bg-black/65 backdrop-blur px-2 py-0.5 rounded text-white font-bold text-sm">
                {char.name}
              </div>
            )}
          </div>
          {subs.length > 0 && (
            <div className="w-[35%] flex flex-col border-l border-white/40">
              {subs.map((u, i) => (
                <div key={i} className="flex-1 border-b last:border-b-0 border-white/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="p-2">
        <div className="text-sm font-medium text-slate-800 truncate">{char.name}</div>
        {char.description && (
          <div className="text-[11px] text-slate-500 line-clamp-3 mt-0.5 leading-relaxed">
            {char.description}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ 新建资产卡（含生图状态） ============ */
function FreshCard({
  char,
  apiBase,
  onRefresh,
}: {
  char: ComicCharacter;
  apiBase: string;
  onRefresh: () => void;
}) {
  const status = (char.genStatus as string) || "pending";
  const refs = char.referenceUrls && char.referenceUrls.length > 0
    ? char.referenceUrls
    : char.referenceUrl
    ? [char.referenceUrl]
    : [];
  const main = refs[0];
  const subs = refs.slice(1, 4);

  const [busy, setBusy] = useState(false);
  async function regen() {
    setBusy(true);
    try {
      await fetch(`${apiBase}/characters/${char.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "regen-image" }),
      });
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition">
      <div className="relative">
        <TypeBadge type={char.type} />
        {status === "ready" && main ? (
          <div className="flex bg-slate-50 aspect-[5/4]">
            <div className="flex-1 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={main} alt={char.name} className="w-full h-full object-cover" />
              <div className="absolute bottom-1.5 left-1.5 bg-black/65 backdrop-blur px-2 py-0.5 rounded text-white font-bold text-sm">
                {char.name}
              </div>
            </div>
            {subs.length > 0 && (
              <div className="w-[35%] flex flex-col border-l border-white/40">
                {subs.map((u, i) => (
                  <div key={i} className="flex-1 border-b last:border-b-0 border-white/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : status === "failed" ? (
          <div className="aspect-[5/4] bg-rose-50 flex flex-col items-center justify-center text-center px-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mb-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div className="text-xs text-rose-700 font-medium">生成失败</div>
            {char.genError && (
              <div className="text-[10px] text-rose-500 mt-1 line-clamp-2" title={char.genError}>
                {char.genError}
              </div>
            )}
            <button
              onClick={regen}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
              点击重试
            </button>
          </div>
        ) : (
          // pending or analyzing
          <div className="aspect-[5/4] bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center text-center px-3">
            <div className="relative w-10 h-10 mb-2">
              <div className="absolute inset-0 rounded-full bg-cyan-200/40 animate-ping" />
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            </div>
            <div className="text-xs text-slate-700 font-medium">AI 分析中</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {status === "analyzing" ? "正在生成多角度参考图…" : "排队中"}
            </div>
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="text-sm font-medium text-slate-800 truncate">
          {char.name}
          {status !== "ready" && (
            <span className="text-[11px] text-slate-400 ml-1">（初醒）</span>
          )}
        </div>
        {char.description && (
          <div className="text-[11px] text-slate-500 line-clamp-3 mt-0.5 leading-relaxed">
            {char.description}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ 类型徽章 ============ */
function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    character: { label: "角色", cls: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200" },
    scene: { label: "场景", cls: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    prop: { label: "道具", cls: "bg-purple-100 text-purple-700 border-purple-200" },
    skill: { label: "技能", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  };
  const t = map[type] || { label: type, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span className={`absolute top-1.5 left-1.5 z-10 text-[10px] px-1.5 py-0.5 rounded border ${t.cls}`}>
      {t.label}
    </span>
  );
}
