"use client";

import { useState } from "react";
import { Card, Button, Spinner, Label, Textarea, Input, Select } from "@/components/ui";
import {
  Check,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  Pencil,
  Save,
  X,
  Settings2,
  ImageOff,
  Film,
} from "lucide-react";
import { IMAGE_PRESETS } from "@/lib/comic-v3/image-presets";
import type { ShotRow } from "./types";

const SHOT_TYPE_LABEL: Record<ShotRow["shotType"], string> = {
  wide: "🌄 远景",
  medium: "👤 中景",
  close: "🔍 近景",
  extreme_close: "🎯 大特写",
  over_shoulder: "👥 过肩",
};

const CAMERA_MOVE_LABEL: Record<ShotRow["cameraMove"], string> = {
  static: "固定",
  pan: "横摇",
  zoom_in: "推镜",
  zoom_out: "拉镜",
  dolly: "移动",
  tracking: "跟拍",
};

export default function ShotWorkbench({
  projectId,
  shots,
}: {
  projectId: string;
  shots: ShotRow[];
}) {
  if (!shots || shots.length === 0) {
    return (
      <Card className="p-12 text-center text-slate-500 text-sm">
        暂无分镜
      </Card>
    );
  }

  const ready = shots.filter((s) => s.genStatus === "ready").length;
  const generating = shots.filter((s) => s.genStatus === "generating").length;
  const pending = shots.filter((s) => s.genStatus === "pending").length;
  const failed = shots.filter((s) => s.genStatus === "failed").length;
  const totalSec = shots.reduce((sum, s) => sum + s.durationSec, 0);

  // 估算剩余时间：未完成镜数 × 平均 60 秒（图像模型平均耗时）÷ 2（并发数）
  const remaining = pending + generating;
  const estMinutes = remaining > 0 ? Math.ceil((remaining * 60) / 2 / 60) : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-800 flex items-center gap-3 flex-wrap">
        <Film className="w-4 h-4" />
        <span>
          共 <b>{shots.length}</b> 镜 · 总时长 <b>{totalSec.toFixed(0)}s</b>
        </span>
        <span className="text-emerald-700">✓ {ready} 已生成</span>
        {generating > 0 && (
          <span className="text-violet-700 inline-flex items-center gap-1">
            <Spinner className="w-3 h-3" /> {generating} 生成中
          </span>
        )}
        {pending > 0 && <span className="text-slate-500">{pending} 待生成</span>}
        {failed > 0 && <span className="text-rose-700">⚠ {failed} 失败</span>}
        {remaining > 0 && (
          <span className="text-slate-500 ml-auto">
            预计剩余 <b>{estMinutes}</b> 分钟（图像模型异步耗时较长，可单镜重生成提速）
          </span>
        )}
      </div>

      {shots.map((s) => (
        <ShotItem key={s.id} projectId={projectId} shot={s} />
      ))}
    </div>
  );
}

/* ============================================================
 * 单个分镜卡
 * ============================================================ */

function ShotItem({ projectId, shot }: { projectId: string; shot: ShotRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<"regen" | "edit" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [tempModel, setTempModel] = useState<string>("");

  // 编辑表单态
  const [imagePrompt, setImagePrompt] = useState(shot.imagePrompt);
  const [motionHint, setMotionHint] = useState(shot.motionHint);
  const [dialogue, setDialogue] = useState(shot.dialogue);
  const [durationSec, setDurationSec] = useState(shot.durationSec);
  const [shotType, setShotType] = useState<ShotRow["shotType"]>(shot.shotType);
  const [cameraMove, setCameraMove] = useState<ShotRow["cameraMove"]>(shot.cameraMove);
  const [negativePrompt, setNegativePrompt] = useState(shot.negativePrompt || "");

  function startEdit() {
    setImagePrompt(shot.imagePrompt);
    setMotionHint(shot.motionHint);
    setDialogue(shot.dialogue);
    setDurationSec(shot.durationSec);
    setShotType(shot.shotType);
    setCameraMove(shot.cameraMove);
    setNegativePrompt(shot.negativePrompt || "");
    setEditing(true);
    setActionErr(null);
  }

  async function save() {
    setPending("edit");
    setActionErr(null);
    try {
      const r = await fetch(
        `/api/comic-v3/projects/${projectId}/shots/${shot.id}/edit`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imagePrompt: imagePrompt.trim(),
            motionHint: motionHint.trim(),
            dialogue: dialogue.trim(),
            durationSec,
            shotType,
            cameraMove,
            negativePrompt: negativePrompt.trim() || null,
          }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "保存失败");
      }
      setEditing(false);
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
        `/api/comic-v3/projects/${projectId}/shots/${shot.id}/regen`,
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

  return (
    <Card className="p-4">
      {/* 标题行 */}
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          <span className="text-base font-bold text-slate-900">
            镜 {shot.shotIndex}
          </span>
          <span className="text-xs text-slate-500">
            场景 {shot.sceneIndex}
          </span>
          <StatusPill status={shot.genStatus} />
          <span className="text-[11px] text-slate-500">
            {SHOT_TYPE_LABEL[shot.shotType]} · {CAMERA_MOVE_LABEL[shot.cameraMove]} · {shot.durationSec}s
          </span>
          {shot.imageModelOverride && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
              {shot.imageModelOverride}
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {!editing ? (
            <>
              <Button size="sm" variant="outline" onClick={startEdit} disabled={pending !== null}>
                <Pencil className="w-3.5 h-3.5" /> 编辑
              </Button>
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
                title="临时换图像模型"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending !== null}>
                <X className="w-3.5 h-3.5" /> 取消
              </Button>
              <Button size="sm" variant="glow" onClick={save} loading={pending === "edit"}>
                <Save className="w-3.5 h-3.5" /> 保存
              </Button>
            </>
          )}
        </div>
      </header>

      {/* 模型菜单 */}
      {modelMenuOpen && (
        <div className="mb-3 rounded-md bg-slate-50 border border-slate-200 p-2 flex items-center gap-2">
          <span className="text-xs text-slate-500 shrink-0">用此模型重生成：</span>
          <Select
            value={tempModel}
            onChange={(e) => setTempModel(e.target.value)}
            className="flex-1 text-xs"
          >
            <option value="">选择模型</option>
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
            title="保存为该镜的默认模型"
          >
            保存
          </Button>
        </div>
      )}

      {/* 错误折叠 */}
      {(shot.genError || actionErr) && (
        <div className="mb-3 rounded-md bg-rose-50 border border-rose-100 text-xs text-rose-700">
          <button
            type="button"
            onClick={() => setErrorOpen((v) => !v)}
            className="w-full px-3 py-2 flex items-center gap-2 text-left"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 truncate font-medium">
              {actionErr || shot.genError}
            </span>
            <ChevronDown
              className={
                "w-3.5 h-3.5 transition-transform " + (errorOpen ? "rotate-180" : "")
              }
            />
          </button>
          {errorOpen && (
            <pre className="px-3 pb-2 text-[11px] text-rose-600 whitespace-pre-wrap break-all max-h-40 overflow-y-auto border-t border-rose-100/60">
              {actionErr || shot.genError}
            </pre>
          )}
        </div>
      )}

      {/* 主体：左图 / 右文本 */}
      <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-3">
        {/* 关键帧 */}
        <div className="aspect-[16/9] rounded-md overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center relative">
          {shot.genStatus === "generating" ? (
            <div className="text-slate-500 text-xs flex flex-col items-center gap-1">
              <Spinner className="w-4 h-4" />
              <span>生成中…</span>
            </div>
          ) : shot.keyframeUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.keyframeUrl}
                alt={`镜 ${shot.shotIndex}`}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              {shot.genStatus === "ready" && (
                <span className="absolute top-1 right-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px]">
                  <Check className="w-3 h-3" /> 已就绪
                </span>
              )}
              <a
                href={shot.keyframeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white hover:bg-black/80"
              >
                查看
              </a>
            </>
          ) : (
            <div className="text-slate-400 text-xs flex flex-col items-center gap-1">
              <ImageOff className="w-5 h-5" />
              <span>{shot.genStatus === "failed" ? "失败，可重生成" : "等待生成"}</span>
            </div>
          )}
        </div>

        {/* 文本字段 */}
        <div className="space-y-2 min-w-0">
          {!editing ? (
            <ReadOnlyShotView shot={shot} />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px]">景别</Label>
                  <Select
                    value={shotType}
                    onChange={(e) => setShotType(e.target.value as ShotRow["shotType"])}
                    className="mt-0.5 text-xs"
                  >
                    {(Object.keys(SHOT_TYPE_LABEL) as ShotRow["shotType"][]).map((k) => (
                      <option key={k} value={k}>
                        {SHOT_TYPE_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">运镜</Label>
                  <Select
                    value={cameraMove}
                    onChange={(e) => setCameraMove(e.target.value as ShotRow["cameraMove"])}
                    className="mt-0.5 text-xs"
                  >
                    {(Object.keys(CAMERA_MOVE_LABEL) as ShotRow["cameraMove"][]).map((k) => (
                      <option key={k} value={k}>
                        {CAMERA_MOVE_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">时长(s)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    step={0.5}
                    value={durationSec}
                    onChange={(e) => setDurationSec(Number(e.target.value))}
                    className="mt-0.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[11px]">imagePrompt</Label>
                <Textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="mt-0.5 font-mono text-[11px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">motionHint</Label>
                  <Input
                    value={motionHint}
                    onChange={(e) => setMotionHint(e.target.value)}
                    className="mt-0.5 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">dialogue</Label>
                  <Input
                    value={dialogue}
                    onChange={(e) => setDialogue(e.target.value)}
                    className="mt-0.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[11px]">negativePrompt（可选）</Label>
                <Input
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="blurry, lowres, bad hands"
                  className="mt-0.5 font-mono text-[11px]"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ReadOnlyShotView({ shot }: { shot: ShotRow }) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="text-[11px] text-slate-400 mb-0.5">imagePrompt</div>
        <pre className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 whitespace-pre-wrap break-words font-mono max-h-28 overflow-y-auto">
          {shot.imagePrompt}
        </pre>
      </div>
      {shot.dialogue && (
        <div>
          <div className="text-[11px] text-slate-400 mb-0.5">对白</div>
          <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
            「{shot.dialogue}」
          </div>
        </div>
      )}
      {shot.motionHint && (
        <div>
          <div className="text-[11px] text-slate-400 mb-0.5">运动 hint</div>
          <div className="text-slate-600">{shot.motionHint}</div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "待生成", cls: "bg-slate-100 text-slate-600" },
    generating: { label: "生成中…", cls: "bg-violet-100 text-violet-700" },
    ready: { label: "已就绪", cls: "bg-emerald-100 text-emerald-700" },
    failed: { label: "失败", cls: "bg-rose-100 text-rose-700" },
  };
  const v = map[status] || { label: status, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}
