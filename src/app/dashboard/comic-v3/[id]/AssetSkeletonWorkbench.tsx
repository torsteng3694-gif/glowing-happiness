"use client";

import { useState } from "react";
import { Button, Card, Label, Textarea, Input, Select } from "@/components/ui";
import {
  Pencil,
  Save,
  X,
  AlertTriangle,
  ChevronDown,
  User as UserIcon,
  MountainSnow,
  Boxes,
} from "lucide-react";
import { IMAGE_PRESETS } from "@/lib/comic-v3/image-presets";
import type { AssetRow } from "./types";

const TYPE_META: Record<AssetRow["type"], { label: string; icon: typeof UserIcon }> = {
  character: { label: "角色", icon: UserIcon },
  scene: { label: "场景", icon: MountainSnow },
  prop: { label: "道具", icon: Boxes },
};

export default function AssetSkeletonWorkbench({
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

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-800">
        💡 这一步只产出 imagePrompt（不消耗图像模型费用）。审核 / 编辑后点「确认继续」进入下一步开始生图。
      </div>

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
            <div className="space-y-3">
              {list.map((a) => (
                <SkeletonItem key={a.id} projectId={projectId} asset={a} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SkeletonItem({ projectId, asset }: { projectId: string; asset: AssetRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);

  const [imagePrompt, setImagePrompt] = useState(asset.imagePrompt || "");
  const [visualAnchor, setVisualAnchor] = useState(asset.visualAnchor || "");
  const [negativePrompt, setNegativePrompt] = useState(asset.negativePrompt || "");
  const [imageModelOverride, setImageModelOverride] = useState(
    asset.imageModelOverride || "",
  );

  function startEdit() {
    setImagePrompt(asset.imagePrompt || "");
    setVisualAnchor(asset.visualAnchor || "");
    setNegativePrompt(asset.negativePrompt || "");
    setImageModelOverride(asset.imageModelOverride || "");
    setEditing(true);
    setErr(null);
  }

  async function save() {
    setPending(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/comic-v3/projects/${projectId}/assets/${asset.id}/edit`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imagePrompt: imagePrompt.trim(),
            visualAnchor: visualAnchor.trim() || undefined,
            negativePrompt: negativePrompt.trim() || null,
            imageModelOverride: imageModelOverride.trim() || null,
          }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "保存失败");
      }
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  // 仅展示 IMAGE_PRESETS 里有 imageSlug 的（"跟随系统" 那个 imageSlug=null 不算）
  const modelOptions = IMAGE_PRESETS.filter((p) => p.imageSlug);

  return (
    <Card className="p-4">
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 truncate">
              {asset.name}
            </span>
            <StatusPill status={asset.genStatus} />
            {asset.imageModelOverride && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                模型：{asset.imageModelOverride}
              </span>
            )}
          </div>
          {asset.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              {asset.description}
            </p>
          )}
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={startEdit}>
            <Pencil className="w-3.5 h-3.5" /> 编辑
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
              <X className="w-3.5 h-3.5" /> 取消
            </Button>
            <Button size="sm" variant="glow" onClick={save} loading={pending}>
              <Save className="w-3.5 h-3.5" /> 保存
            </Button>
          </div>
        )}
      </header>

      {(asset.genError || err) && (
        <div className="mb-3 rounded-md bg-rose-50 border border-rose-100 text-xs text-rose-700">
          <button
            type="button"
            onClick={() => setErrorOpen((v) => !v)}
            className="w-full px-3 py-2 flex items-center gap-2 text-left"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 truncate font-medium">
              {err || asset.genError}
            </span>
            <ChevronDown
              className={"w-3.5 h-3.5 transition-transform " + (errorOpen ? "rotate-180" : "")}
            />
          </button>
          {errorOpen && (
            <pre className="px-3 pb-2 text-[11px] text-rose-600 whitespace-pre-wrap break-all max-h-40 overflow-y-auto border-t border-rose-100/60">
              {err || asset.genError}
            </pre>
          )}
        </div>
      )}

      {!editing ? (
        <ReadOnlyView asset={asset} />
      ) : (
        <div className="space-y-3">
          <div>
            <Label>视觉锚（visualAnchor）</Label>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-1">
              紧凑的核心特征描述，后续每张分镜图都会用到
            </p>
            <Textarea
              value={visualAnchor}
              onChange={(e) => setVisualAnchor(e.target.value)}
              rows={2}
              maxLength={800}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>图像 Prompt（imagePrompt）</Label>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-1">
              本资产生图时使用的完整 prompt。建议英文，含构图 + 光线 + 风格
            </p>
            <Textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={4}
              maxLength={2000}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>负面 Prompt（可选）</Label>
            <Input
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              maxLength={400}
              placeholder="blurry, deformed hands, low quality"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>覆盖图像模型（可选）</Label>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-1">
              此资产单独使用的图像模型；留空则用项目套餐
            </p>
            <Select
              value={imageModelOverride}
              onChange={(e) => setImageModelOverride(e.target.value)}
              className="font-mono text-xs"
            >
              <option value="">使用项目默认</option>
              {modelOptions.map((p) => (
                <option key={p.imageSlug!} value={p.imageSlug!}>
                  {p.label} · {p.imageSlug}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}
    </Card>
  );
}

function ReadOnlyView({ asset }: { asset: AssetRow }) {
  const hasPrompt = !!asset.imagePrompt;
  return (
    <div className="space-y-2">
      {!hasPrompt && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
          ⚠ 此资产尚未生成 prompt，请编辑后填写
        </div>
      )}
      {asset.visualAnchor && (
        <div>
          <div className="text-[11px] text-slate-400 mb-0.5">视觉锚</div>
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 whitespace-pre-wrap break-words font-mono">
            {asset.visualAnchor}
          </pre>
        </div>
      )}
      {asset.imagePrompt && (
        <div>
          <div className="text-[11px] text-slate-400 mb-0.5">图像 Prompt</div>
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 whitespace-pre-wrap break-words font-mono max-h-32 overflow-y-auto">
            {asset.imagePrompt}
          </pre>
        </div>
      )}
      {asset.negativePrompt && (
        <div>
          <div className="text-[11px] text-slate-400 mb-0.5">负面 Prompt</div>
          <pre className="text-xs bg-rose-50/40 border border-rose-100 rounded px-2 py-1.5 whitespace-pre-wrap break-words font-mono">
            {asset.negativePrompt}
          </pre>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "待生成", cls: "bg-slate-100 text-slate-600" },
    planned: { label: "骨架就绪", cls: "bg-sky-100 text-sky-700" },
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
