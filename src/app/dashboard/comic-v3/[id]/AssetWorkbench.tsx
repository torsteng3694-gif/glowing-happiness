"use client";

import { useState } from "react";
import { Card, Button, Spinner, Select } from "@/components/ui";
import {
  Check,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  User as UserIcon,
  MountainSnow,
  Boxes,
  ImageOff,
  Settings2,
} from "lucide-react";
import { IMAGE_PRESETS } from "@/lib/comic-v3/image-presets";
import type { AssetRow } from "./types";

const TYPE_META: Record<AssetRow["type"], { label: string; icon: typeof UserIcon }> = {
  character: { label: "角色", icon: UserIcon },
  scene: { label: "场景", icon: MountainSnow },
  prop: { label: "道具", icon: Boxes },
};

export default function AssetWorkbench({
  projectId,
  assets,
}: {
  projectId: string;
  assets: AssetRow[];
}) {
  if (!assets || assets.length === 0) {
    return (
      <Card className="p-12 text-center text-slate-500 text-sm">
        资产列表为空（剧本未声明角色/场景）
      </Card>
    );
  }

  const groups: Record<AssetRow["type"], AssetRow[]> = {
    character: [],
    scene: [],
    prop: [],
  };
  for (const a of assets) groups[a.type].push(a);

  // 进度统计 + 剩余时间估算（每张约 30 秒，并发 2）
  const ready = assets.filter((a) => !!a.pickedUrl).length;
  const generating = assets.filter((a) => a.genStatus === "generating").length;
  const pending = assets.filter((a) => a.genStatus === "pending" || a.genStatus === "planned").length;
  const failed = assets.filter((a) => a.genStatus === "failed").length;
  const remaining = pending + generating;
  const estMinutes = remaining > 0 ? Math.max(1, Math.ceil((remaining * 30) / 2 / 60)) : 0;

  return (
    <div className="space-y-6">
      {/* 顶部进度条 */}
      {(remaining > 0 || failed > 0) && (
        <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-800 flex items-center gap-3 flex-wrap">
          <span>
            共 <b>{assets.length}</b> 个资产
          </span>
          <span className="text-emerald-700">✓ {ready} 已就绪</span>
          {generating > 0 && (
            <span className="text-violet-700 inline-flex items-center gap-1">
              <Spinner className="w-3 h-3" /> {generating} 生成中
            </span>
          )}
          {pending > 0 && <span className="text-slate-500">{pending} 待生成</span>}
          {failed > 0 && <span className="text-rose-700">⚠ {failed} 失败</span>}
          {remaining > 0 && (
            <span className="text-slate-500 ml-auto">
              预计剩余 <b>{estMinutes}</b> 分钟（异步图像模型耗时较长）
            </span>
          )}
        </div>
      )}

      {(["character", "scene", "prop"] as const).map((type) => {
        const list = groups[type];
        if (list.length === 0) return null;
        const meta = TYPE_META[type];
        const Icon = meta.icon;
        return (
          <section key={type}>
            <div className="flex items-center gap-2 mb-3">
              <Icon className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-800">
                {meta.label}{" "}
                <span className="text-slate-400 font-normal">· {list.length}</span>
              </h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {list.map((a) => (
                <AssetItem key={a.id} projectId={projectId} asset={a} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ============================================================
 * 单个 Asset 卡
 * ============================================================ */

function AssetItem({ projectId, asset }: { projectId: string; asset: AssetRow }) {
  const [pending, setPending] = useState<"pick" | "regen" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [tempModel, setTempModel] = useState<string>("");
  const candidates = asset.candidates || [];

  async function pick(url: string) {
    setPending("pick");
    setActionErr(null);
    try {
      const r = await fetch(
        `/api/comic-v3/projects/${projectId}/assets/${asset.id}/pick`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "挑选失败");
      }
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  async function regen(opts?: { modelSlug?: string; persist?: boolean }) {
    setPending("regen");
    setActionErr(null);
    try {
      const r = await fetch(
        `/api/comic-v3/projects/${projectId}/assets/${asset.id}/regen`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelSlug: opts?.modelSlug || undefined,
            persistModel: opts?.persist || false,
          }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "重生成失败");
      }
      setModelMenuOpen(false);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const modelOptions = IMAGE_PRESETS.filter((p) => p.imageSlug);

  const errorBrief = asset.genError ? extractErrorBrief(asset.genError) : null;

  return (
    <Card className="p-4 flex flex-col">
      {/* 标题行 */}
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 truncate">
              {asset.name}
            </span>
            <StatusPill status={asset.genStatus} />
          </div>
          {asset.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              {asset.description}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => regen()}
            loading={pending === "regen"}
            disabled={pending !== null}
          >
            <RefreshCw className="w-3.5 h-3.5" /> 重生成
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModelMenuOpen((v) => !v)}
            disabled={pending !== null}
            title="临时换图像模型重生成"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {modelMenuOpen && (
        <div className="mb-3 rounded-md bg-slate-50 border border-slate-200 p-2 flex items-center gap-2">
          <span className="text-xs text-slate-500 shrink-0">用此模型重生成：</span>
          <Select
            value={tempModel}
            onChange={(e) => setTempModel(e.target.value)}
            className="flex-1 text-xs"
          >
            <option value="">选择一个模型</option>
            {modelOptions.map((p) => (
              <option key={p.imageSlug!} value={p.imageSlug!}>
                {p.label} · {p.imageSlug}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="glow"
            onClick={() => tempModel && regen({ modelSlug: tempModel })}
            disabled={!tempModel || pending !== null}
          >
            一次
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => tempModel && regen({ modelSlug: tempModel, persist: true })}
            disabled={!tempModel || pending !== null}
            title="保存为该资产的默认模型"
          >
            保存
          </Button>
        </div>
      )}

      {/* 错误信息（折叠） */}
      {errorBrief && (
        <div className="mb-2 rounded-md bg-rose-50 border border-rose-100 text-xs text-rose-700">
          <button
            type="button"
            onClick={() => setErrorOpen((v) => !v)}
            className="w-full px-3 py-2 flex items-center gap-2 text-left"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 truncate font-medium">{errorBrief}</span>
            <ChevronDown
              className={
                "w-3.5 h-3.5 shrink-0 transition-transform " +
                (errorOpen ? "rotate-180" : "")
              }
            />
          </button>
          {errorOpen && (
            <pre className="px-3 pb-2 text-[11px] text-rose-600 whitespace-pre-wrap break-all max-h-40 overflow-y-auto border-t border-rose-100/60">
              {asset.genError}
            </pre>
          )}
        </div>
      )}

      {actionErr && (
        <div className="mb-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded px-2 py-1">
          {actionErr}
        </div>
      )}

      {/* 候选区：固定最小高度，避免塌缩 */}
      <div className="flex-1">
        {asset.genStatus === "generating" ? (
          <CandidatePlaceholder>
            <Spinner className="w-4 h-4" />
            <span>生成中…</span>
          </CandidatePlaceholder>
        ) : candidates.length === 0 ? (
          <CandidatePlaceholder>
            <ImageOff className="w-5 h-5" />
            <span>暂无候选</span>
            <span className="text-[11px] text-slate-400">
              {asset.genStatus === "failed" ? "点击右上角「重生成」重试" : "等待生成…"}
            </span>
          </CandidatePlaceholder>
        ) : candidates.length === 1 ? (
          // 单图模式：占满卡片宽度，更接近"主图"体验
          <SingleCandidate
            candidate={candidates[0]}
            selected={candidates[0].url === asset.pickedUrl}
          />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {candidates.map((c, i) => {
              const selected = c.url === asset.pickedUrl;
              return (
                <button
                  key={c.url}
                  type="button"
                  onClick={() => pick(c.url)}
                  disabled={pending !== null}
                  className={
                    "group relative aspect-[3/4] rounded-md overflow-hidden bg-slate-100 border-2 transition disabled:opacity-60 " +
                    (selected
                      ? "border-violet-500 ring-2 ring-violet-200"
                      : "border-slate-200 hover:border-violet-300")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.url}
                    alt={`候选 ${i + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  {selected && (
                    <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center shadow">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                  <span className="absolute bottom-1 left-1 text-[10px] px-1 py-0.5 rounded bg-black/60 text-white font-mono">
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function CandidatePlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[140px] rounded-md border border-dashed border-slate-200 bg-slate-50/60 flex flex-col items-center justify-center gap-1.5 text-sm text-slate-500">
      {children}
    </div>
  );
}

/** 单候选模式：图片占满卡片宽度，无需点击挑选（自动 pickedUrl） */
function SingleCandidate({
  candidate,
  selected,
}: {
  candidate: { url: string };
  selected: boolean;
}) {
  return (
    <div className="relative w-full aspect-[16/9] rounded-md overflow-hidden bg-slate-100 border-2 border-violet-300">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidate.url}
        alt="资产图"
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      {selected && (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-medium shadow">
          <Check className="w-3 h-3" /> 已选定
        </span>
      )}
      <a
        href={candidate.url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded bg-black/60 text-white hover:bg-black/80 transition"
      >
        查看原图
      </a>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "待生成", cls: "bg-slate-100 text-slate-600" },
    generating: { label: "生成中…", cls: "bg-violet-100 text-violet-700" },
    awaiting_pick: { label: "待挑选", cls: "bg-amber-100 text-amber-700" },
    ready: { label: "已选定", cls: "bg-emerald-100 text-emerald-700" },
    failed: { label: "失败", cls: "bg-rose-100 text-rose-700" },
  };
  const v = map[status] || { label: status, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

/* ============================================================
 * 错误信息提取：从一坨上游 JSON 错误里找最有意义的那一句
 * ============================================================ */

function extractErrorBrief(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();

  // 常见上游格式："message":"xxxxxxx"
  const msgMatch = trimmed.match(/["']?message["']?\s*[:：]\s*["']([^"']+)["']/);
  if (msgMatch) return msgMatch[1].slice(0, 180);

  // "error":"xxx"
  const errMatch = trimmed.match(/["']?error["']?\s*[:：]\s*["']([^"']+)["']/);
  if (errMatch) return errMatch[1].slice(0, 180);

  // 中文错误关键词
  const cnMatch = trimmed.match(/(分辨率[^\s,;。]+|Quota[^\s,;]+|Timeout[^\s,;]+|deadlock[^\s,;]*)/i);
  if (cnMatch) return cnMatch[1];

  // 兜底：取第一句不超过 180 字
  const firstLine = trimmed.split(/[\n;；]/)[0];
  return firstLine.slice(0, 180);
}
