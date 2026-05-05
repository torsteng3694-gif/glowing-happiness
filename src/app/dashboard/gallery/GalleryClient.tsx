"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Image as ImageIcon, Video, Music, Heart, Trash2, Download, Copy,
  X, Sparkles, RefreshCw, ChevronDown, ChevronRight, Lightbulb, ArrowLeft,
  CheckSquare, Square,
} from "lucide-react";
import { Card, Badge, EmptyState, Spinner, Button } from "@/components/ui";
import { SafeImage, SafeVideo, proxify } from "@/components/media/SafeMedia";
import { formatMoney, relativeTime, cn } from "@/lib/utils";
import JSZip from "jszip";

type MediaItem = {
  id: string;
  type: "image" | "video" | "audio";
  url: string;
  thumbnail_url: string | null;
  prompt: string | null;
  params: any;
  cost: number;
  favorite: boolean;
  duration_sec: number | null;
  task_id: number | null;
  model_name: string | null;
  model_slug: string | null;
  provider_logo: string | null;
  provider_name: string | null;
  source: string | null;
  source_label: string | null;
  batch_id: string | null;
  created_at: string;
};

type TabKey = "all" | "video" | "image" | "audio" | "inspiration";

/** 与常见「作品中心」布局一致：先视频再图片，「灵感」= 已收藏 */
const TABS: { key: TabKey; label: string; Icon: any }[] = [
  { key: "all",         label: "全部",   Icon: Sparkles },
  { key: "video",       label: "视频",   Icon: Video },
  { key: "image",       label: "图片",   Icon: ImageIcon },
  { key: "audio",       label: "音频",   Icon: Music },
  { key: "inspiration", label: "灵感",   Icon: Lightbulb },
];

const PAGE_SIZE = 24;

export default function GalleryClient({
  initialCounts, totalCost,
}: { initialCounts: Record<string, number>; totalCost: number }) {
  const [tab, setTab] = useState<TabKey>("all");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [toast, setToast] = useState("");
  const [groupByBatch, setGroupByBatch] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [zippingGroup, setZippingGroup] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zippingSelected, setZippingSelected] = useState(false);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 1800);
  }, []);

  const fetchPage = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const nextOffset = reset ? 0 : offset;
      const isInspiration = tab === "inspiration";
      const params = new URLSearchParams({
        type: isInspiration ? "all" : tab,
        limit: String(PAGE_SIZE),
        offset: String(nextOffset),
      });
      if (isInspiration) params.set("favorite", "1");
      const res = await fetch(`/api/me/media?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setCounts(data.counts);
      setHasMore(Boolean(data.has_more));
      setOffset(nextOffset + data.items.length);
      setItems((prev) => reset ? data.items : [...prev, ...data.items]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab, offset, showToast]);

  useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(true);
    setSelected(new Set());
    setBatchMode(false);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("链接已复制");
    } catch { showToast("复制失败"); }
  };

  const download = async (item: MediaItem) => {
    try {
      const ext = item.type === "image" ? "jpg" : item.type === "video" ? "mp4" : "mp3";
      const res = await fetch(proxify(item.url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `ai-hub-${item.id}.${ext}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      window.open(item.url, "_blank");
    }
  };

  const toggleFav = async (item: MediaItem) => {
    const prev = item.favorite;
    setItems((list) => list.map((x) => x.id === item.id ? { ...x, favorite: !prev } : x));
    try {
      const res = await fetch(`/api/me/media/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: !prev }),
      });
      if (!res.ok) throw new Error();
      showToast(!prev ? "已加入收藏" : "已取消收藏");
    } catch {
      setItems((list) => list.map((x) => x.id === item.id ? { ...x, favorite: prev } : x));
      showToast("操作失败");
    }
  };

  const removeItem = async (item: MediaItem) => {
    if (!confirm("确定删除这个作品？删除后在画廊不再显示。")) return;
    setItems((list) => list.filter((x) => x.id !== item.id));
    setCounts((c) => ({ ...c, [item.type]: Math.max(0, (c[item.type] || 1) - 1), all: Math.max(0, (c.all || 1) - 1) }));
    try {
      const res = await fetch(`/api/me/media/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (preview?.id === item.id) setPreview(null);
      showToast("已删除");
    } catch {
      showToast("删除失败，已恢复");
      fetchPage(true);
    }
  };

  const stats = useMemo(
    () => [
      { label: "全部作品", value: counts.all || 0, Icon: Sparkles },
      { label: "视频", value: counts.video || 0, Icon: Video },
      { label: "图片", value: counts.image || 0, Icon: ImageIcon },
      { label: "音频", value: counts.audio || 0, Icon: Music },
      { label: "灵感（收藏）", value: counts.inspiration || 0, Icon: Lightbulb },
    ],
    [counts],
  );

  const selectedList = useMemo(
    () => items.filter((it) => selected.has(it.id)),
    [items, selected],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllInView = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of items) next.add(it.id);
      return next;
    });
  }, [items]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const exitBatch = useCallback(() => {
    setBatchMode(false);
    setSelected(new Set());
  }, []);

  const downloadSelectedZip = useCallback(async () => {
    if (selectedList.length === 0) {
      showToast("请先选择作品");
      return;
    }
    try {
      setZippingSelected(true);
      const zip = new JSZip();
      const folder = zip.folder("ai-hub-works");
      if (!folder) throw new Error("ZIP 初始化失败");
      let idx = 1;
      for (const it of selectedList) {
        const res = await fetch(proxify(it.url));
        if (!res.ok) continue;
        const blob = await res.blob();
        const extFromUrl = (() => {
          try {
            const u = new URL(it.url);
            const seg = u.pathname.split(".").pop()?.toLowerCase() || "";
            if (seg && seg.length <= 5) return seg;
          } catch {}
          return "";
        })();
        const ext =
          extFromUrl || (it.type === "image" ? "jpg" : it.type === "video" ? "mp4" : "mp3");
        const source = (it.source_label || "asset").replace(/[^\w\u4e00-\u9fa5-]+/g, "_");
        folder.file(`${String(idx).padStart(2, "0")}-${source}-${it.id}.${ext}`, blob);
        idx++;
      }
      const out = await zip.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = href;
      a.download = `ai-hub-selected-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      showToast("打包下载已开始");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "打包失败");
    } finally {
      setZippingSelected(false);
    }
  }, [selectedList, showToast]);

  const deleteSelected = useCallback(async () => {
    if (selectedList.length === 0) {
      showToast("请先选择作品");
      return;
    }
    if (!confirm(`确定删除选中的 ${selectedList.length} 个作品？`)) return;
    const toRemove = [...selectedList];
    setItems((list) => list.filter((x) => !toRemove.some((r) => r.id === x.id)));
    for (const t of toRemove) {
      setCounts((c) => ({
        ...c,
        [t.type]: Math.max(0, (c[t.type] || 1) - 1),
        all: Math.max(0, (c.all || 1) - 1),
        inspiration: t.favorite ? Math.max(0, (c.inspiration || 1) - 1) : c.inspiration,
      }));
    }
    clearSelection();
    let fail = 0;
    for (const it of toRemove) {
      try {
        const res = await fetch(`/api/me/media/${it.id}`, { method: "DELETE" });
        if (!res.ok) fail++;
      } catch {
        fail++;
      }
    }
    if (fail) {
      showToast(`已提交删除，部分失败请刷新（${fail}）`);
      fetchPage(true);
    } else {
      showToast("已删除");
    }
  }, [selectedList, showToast, clearSelection, fetchPage]);

  const groupedItems = useMemo(() => {
    if (!groupByBatch) return [];
    const groups = new Map<string, MediaItem[]>();
    for (const item of items) {
      const fallbackDate = new Date(item.created_at).toISOString().slice(0, 13);
      const key = item.batch_id || (item.task_id ? `task-${item.task_id}` : `time-${fallbackDate}`);
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([key, list]) => ({ key, list }));
  }, [groupByBatch, items]);

  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const downloadGroupZip = useCallback(async (groupKey: string, groupItems: MediaItem[]) => {
    try {
      setZippingGroup(groupKey);
      const zip = new JSZip();
      const folder = zip.folder("assets");
      if (!folder) throw new Error("ZIP 初始化失败");

      let idx = 1;
      for (const it of groupItems) {
        const res = await fetch(proxify(it.url));
        if (!res.ok) continue;
        const blob = await res.blob();
        const extFromUrl = (() => {
          try {
            const u = new URL(it.url);
            const seg = u.pathname.split(".").pop()?.toLowerCase() || "";
            if (seg && seg.length <= 5) return seg;
          } catch {}
          return "";
        })();
        const ext =
          extFromUrl ||
          (it.type === "image" ? "jpg" : it.type === "video" ? "mp4" : "mp3");
        const source = (it.source_label || "asset").replace(/[^\w\u4e00-\u9fa5-]+/g, "_");
        folder.file(`${String(idx).padStart(2, "0")}-${source}-${it.id}.${ext}`, blob);
        idx++;
      }

      const out = await zip.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = href;
      a.download = `batch-${groupKey}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      showToast("批次 ZIP 已开始下载");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "批次 ZIP 下载失败");
    } finally {
      setZippingGroup(null);
    }
  }, [showToast]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="返回工作台"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold">我的作品</h1>
          </div>
          <p className="text-slate-500 mt-1 text-sm pl-0 md:pl-11">
            你在本平台生成的所有图片、视频、音频都会回传到这里，方便随时查看、下载与复用
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-500">
            累计消费 <span className="font-semibold text-slate-800">¥ {formatMoney(totalCost)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchPage(true)} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> 刷新
          </Button>
        </div>
      </div>

      <div
        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950/90"
        role="status"
      >
        温馨提示：作品在服务器保留时间有限（1~15 天因存储策略而异），请及时下载到本地保存~
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((s) => {
          const Icon = s.Icon;
          return (
            <Card key={s.label} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{s.label}</span>
                <Icon className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2 text-2xl font-bold">{s.value}</div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {TABS.map((t) => {
            const Icon = t.Icon;
            const active = tab === t.key;
            const count = (counts as Record<string, number>)[t.key] || 0;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-sm font-medium transition",
                  active
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                <span className={cn("ml-1 text-xs", active ? "opacity-80" : "opacity-60")}>{count}</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => {
                setBatchMode((m) => !m);
                setSelected(new Set());
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-sm font-medium transition border",
                batchMode
                  ? "bg-amber-50 text-amber-800 border-amber-300"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              {batchMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              批量操作
            </button>
            <button
              onClick={() => setGroupByBatch((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-sm font-medium transition border",
                groupByBatch
                  ? "bg-brand-50 text-brand-700 border-brand-200"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              按批次分组
            </button>
          </div>
        </div>

        {batchMode && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-2 rounded-lg bg-slate-50 border border-slate-200 text-sm">
            <span className="text-slate-600">已选 {selected.size} 项</span>
            <Button size="sm" variant="outline" onClick={selectAllInView} type="button">
              全选本页
            </Button>
            <Button size="sm" variant="outline" onClick={clearSelection} type="button">
              取消选择
            </Button>
            <Button size="sm" variant="outline" onClick={exitBatch} type="button">
              退出批量
            </Button>
            <div className="flex-1 min-w-[1px]" />
            <Button size="sm" onClick={downloadSelectedZip} disabled={zippingSelected} type="button">
              {zippingSelected ? <Spinner /> : <Download className="w-3.5 h-3.5" />}
              下载 ZIP
            </Button>
            <Button size="sm" variant="danger" onClick={deleteSelected} type="button">
              <Trash2 className="w-3.5 h-3.5" />
              删除
            </Button>
          </div>
        )}

        {items.length === 0 && !loading ? (
          <EmptyState
            icon={<Sparkles className="w-6 h-6" />}
            title="还没有作品"
            desc={
              tab === "inspiration"
                ? "在任意作品卡片上点心形收藏，即可在「灵感」里快速找到~"
                : tab === "video"
                  ? "去【视频生成】或【异步任务】生成视频吧"
                  : tab === "audio"
                    ? "去【异步任务】里生成音频吧"
                    : "去【图像生成】或【异步任务】创作你的第一张图吧"
            }
          />
        ) : (
          <>
            {!groupByBatch ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {items.map((it) => (
                  <MediaCard
                    key={it.id}
                    item={it}
                    batchMode={batchMode}
                    selected={selected.has(it.id)}
                    onBatchToggle={() => toggleSelect(it.id)}
                    onPreview={() => setPreview(it)}
                    onCopy={() => copyUrl(it.url)}
                    onDownload={() => download(it)}
                    onFav={() => toggleFav(it)}
                    onDelete={() => removeItem(it)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {groupedItems.map((g) => (
                  <div key={g.key} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleGroupCollapse(g.key)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                        title={collapsedGroups[g.key] ? "展开批次" : "折叠批次"}
                      >
                        {collapsedGroups[g.key] ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <Badge color="brand">批次</Badge>
                      <span className="text-sm text-slate-700">
                        {g.list[0]?.source_label || "通用生成"} · {g.list.length} 项
                      </span>
                      <span className="text-xs text-slate-400">{g.key}</span>
                      <div className="ml-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadGroupZip(g.key, g.list)}
                          disabled={zippingGroup !== null}
                        >
                          <Download className="w-4 h-4" />
                          {zippingGroup === g.key ? "打包中..." : "批次下载 ZIP"}
                        </Button>
                      </div>
                    </div>
                    {!collapsedGroups[g.key] && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                        {g.list.map((it) => (
                          <MediaCard
                            key={it.id}
                            item={it}
                            batchMode={batchMode}
                            selected={selected.has(it.id)}
                            onBatchToggle={() => toggleSelect(it.id)}
                            onPreview={() => setPreview(it)}
                            onCopy={() => copyUrl(it.url)}
                            onDownload={() => download(it)}
                            onFav={() => toggleFav(it)}
                            onDelete={() => removeItem(it)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {hasMore && (
              <div className="flex justify-center mt-6">
                <Button variant="outline" onClick={() => fetchPage(false)} disabled={loading}>
                  {loading ? <Spinner /> : "加载更多"}
                </Button>
              </div>
            )}
            {!hasMore && items.length > 0 && (
              <div className="text-center text-xs text-slate-400 mt-6">— 到底啦 —</div>
            )}
          </>
        )}
      </Card>

      {preview && (
        <PreviewModal
          item={preview}
          onClose={() => setPreview(null)}
          onCopy={() => copyUrl(preview.url)}
          onDownload={() => download(preview)}
          onFav={() => toggleFav(preview)}
          onDelete={() => removeItem(preview)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function MediaCard({
  item,
  batchMode,
  selected,
  onBatchToggle,
  onPreview,
  onCopy,
  onDownload,
  onFav,
  onDelete,
}: {
  item: MediaItem;
  batchMode?: boolean;
  selected?: boolean;
  onBatchToggle?: () => void;
  onPreview: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onFav: () => void;
  onDelete: () => void;
}) {
  const thumb = item.thumbnail_url || (item.type === "image" ? item.url : "");
  return (
    <div
      className={cn(
        "group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square hover:shadow-lg transition",
        batchMode && selected && "ring-2 ring-brand-500 ring-offset-0",
      )}
    >
      <button
        type="button"
        onClick={batchMode ? onBatchToggle : onPreview}
        className="absolute inset-0 flex items-center justify-center"
      >
        {item.type === "image" && thumb ? (
          <SafeImage src={thumb} alt="" className="w-full h-full object-cover" />
        ) : item.type === "video" ? (
          thumb ? (
            <SafeImage src={thumb} alt="" className="w-full h-full object-cover" />
          ) : (
            <SafeVideo src={item.url} className="w-full h-full object-cover" muted />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-violet-100 to-rose-100">
            <Music className="w-10 h-10 text-violet-500" />
            <span className="mt-2 text-xs text-slate-600">音频作品</span>
          </div>
        )}
      </button>

      <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[80%] z-[1]">
        <Badge color={item.type === "image" ? "brand" : item.type === "video" ? "violet" : "amber"}>
          {item.type === "image" ? "图片" : item.type === "video" ? "视频" : "音频"}
        </Badge>
        {item.source_label && <Badge color="green">{item.source_label}</Badge>}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFav();
        }}
        className="absolute top-2 right-2 w-7 h-7 z-[2] rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition shadow"
        aria-label="收藏"
      >
        <Heart className={cn("w-4 h-4", item.favorite ? "fill-rose-500 text-rose-500" : "text-slate-500")} />
      </button>

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent transition",
          batchMode ? "hidden" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <div className="text-white text-[11px] truncate">{item.prompt || "(无提示词)"}</div>
        <div className="flex items-center gap-1 mt-1">
          <ActionBtn onClick={(e) => { e.stopPropagation(); onDownload(); }} title="下载"><Download className="w-3.5 h-3.5" /></ActionBtn>
          <ActionBtn onClick={(e) => { e.stopPropagation(); onCopy(); }} title="复制链接"><Copy className="w-3.5 h-3.5" /></ActionBtn>
          <ActionBtn onClick={(e) => { e.stopPropagation(); onDelete(); }} title="删除" danger><Trash2 className="w-3.5 h-3.5" /></ActionBtn>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  children, onClick, title, danger,
}: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition shadow",
        danger ? "text-rose-600" : "text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

function PreviewModal({
  item, onClose, onCopy, onDownload, onFav, onDelete,
}: {
  item: MediaItem; onClose: () => void; onCopy: () => void; onDownload: () => void;
  onFav: () => void; onDelete: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl overflow-hidden max-w-5xl w-full max-h-[90vh] flex flex-col md:flex-row shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="bg-slate-950 flex items-center justify-center md:w-2/3 min-h-[300px]">
          {item.type === "image" ? (
            <SafeImage src={item.url} alt="" className="max-h-[90vh] max-w-full object-contain" />
          ) : item.type === "video" ? (
            <SafeVideo src={item.url} controls autoPlay className="max-h-[90vh] max-w-full" />
          ) : (
            <div className="p-10 w-full">
              <div className="flex flex-col items-center gap-4 text-white">
                <Music className="w-16 h-16 opacity-80" />
                <audio src={item.url} controls className="w-full max-w-md" />
              </div>
            </div>
          )}
        </div>

        <div className="md:w-1/3 p-5 flex flex-col gap-4 overflow-auto">
          <div>
            <div className="flex items-center gap-2">
              <Badge color={item.type === "image" ? "brand" : item.type === "video" ? "violet" : "amber"}>
                {item.type === "image" ? "图片" : item.type === "video" ? "视频" : "音频"}
              </Badge>
              {item.model_name && <Badge color="slate">{item.provider_logo} {item.model_name}</Badge>}
              {item.source_label && <Badge color="green">{item.source_label}</Badge>}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              {relativeTime(new Date(item.created_at))}
              {item.task_id && <> · 任务 #{item.task_id}</>}
              {item.duration_sec ? <> · {item.duration_sec} 秒</> : null}
              {item.cost > 0 ? <> · ¥{formatMoney(item.cost)}</> : null}
            </div>
          </div>

          {item.prompt && (
            <div>
              <div className="text-xs text-slate-500 mb-1">提示词</div>
              <div className="text-sm text-slate-800 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap break-words">{item.prompt}</div>
            </div>
          )}

          {item.params && Object.keys(item.params).length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">参数</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(item.params).map(([k, v]) => (
                  <span key={k} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-slate-500 mb-1">资源地址</div>
            <div className="text-xs text-slate-800 bg-slate-50 rounded-lg p-2 break-all">{item.url}</div>
          </div>

          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={onDownload}><Download className="w-4 h-4" /> 下载</Button>
            <Button size="sm" variant="outline" onClick={onCopy}><Copy className="w-4 h-4" /> 复制链接</Button>
            <Button size="sm" variant="outline" onClick={onFav}>
              <Heart className={cn("w-4 h-4", item.favorite && "fill-rose-500 text-rose-500")} />
              {item.favorite ? "已收藏" : "收藏"}
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete}><Trash2 className="w-4 h-4" /> 删除</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
