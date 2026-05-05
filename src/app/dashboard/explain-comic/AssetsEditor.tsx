"use client";

import { Plus, Trash2, User, Film, Sword } from "lucide-react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { SingleImageUpload } from "@/components/media/SingleImageUpload";
import { VoicePicker, type VoicePickerOption } from "@/components/media/VoicePicker";
import { cn } from "@/lib/utils";

export type AssetType = "character" | "scene" | "tool";

export type AssetItem = {
  /** 客户端临时 id（uid） */
  rid: string;
  /** Vidu 要求的资产 id："01"/"02"... 由组件自动维护 */
  id: string;
  type: AssetType;
  name: string;
  image_uri: string;
  description: string;
  voice_id: string;
};

/** 兼容旧引入：保留 VoiceOption 别名，但 AssetsEditor 内部直接用 VoicePickerOption */
export type VoiceOption = VoicePickerOption;

const TYPE_META: Record<AssetType, { label: string; icon: typeof User; color: string }> = {
  character: { label: "角色", icon: User, color: "text-violet-600 bg-violet-50" },
  scene:     { label: "场景", icon: Film, color: "text-emerald-600 bg-emerald-50" },
  tool:      { label: "道具", icon: Sword, color: "text-amber-600 bg-amber-50" },
};

const MAX_ASSETS = 20;

/** 给资产重新编号（"01"~"20"），保证连续 */
export function renumberAssets(list: AssetItem[]): AssetItem[] {
  return list.map((a, i) => ({ ...a, id: String(i + 1).padStart(2, "0") }));
}

export function AssetsEditor({
  value,
  onChange,
  voices,
}: {
  value: AssetItem[];
  onChange: (next: AssetItem[]) => void;
  voices: VoicePickerOption[];
}) {
  function patch(rid: string, p: Partial<AssetItem>) {
    onChange(value.map((a) => (a.rid === rid ? { ...a, ...p } : a)));
  }
  function add(type: AssetType) {
    if (value.length >= MAX_ASSETS) return;
    const rid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const next: AssetItem = {
      rid,
      id: "",
      type,
      name: type === "character" ? "" : type === "scene" ? "" : "",
      image_uri: "",
      description: "",
      voice_id: "",
    };
    onChange(renumberAssets([...value, next]));
  }
  function remove(rid: string) {
    onChange(renumberAssets(value.filter((a) => a.rid !== rid)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="!mb-0">资产列表（{value.length}/{MAX_ASSETS}）</Label>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => add("character")} disabled={value.length >= MAX_ASSETS}>
            <Plus className="w-3 h-3" /> 角色
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => add("scene")} disabled={value.length >= MAX_ASSETS}>
            <Plus className="w-3 h-3" /> 场景
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => add("tool")} disabled={value.length >= MAX_ASSETS}>
            <Plus className="w-3 h-3" /> 道具
          </Button>
        </div>
      </div>

      {value.length === 0 ? (
        <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center">
          推荐添加 3~10 个资产（角色 / 场景 / 道具），可显著提升一致性。也可以不添加直接用纯剧本生成。
        </div>
      ) : (
        <div className="space-y-3">
          {value.map((a) => {
            const meta = TYPE_META[a.type];
            const Icon = meta.icon;
            const isCharacter = a.type === "character";
            return (
              <div key={a.rid} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", meta.color)}>
                    <Icon className="w-3 h-3" />
                    <span>{meta.label}</span>
                    <span className="text-slate-400 ml-1">#{a.id}</span>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => remove(a.rid)} className="!h-7 !px-2 text-slate-400 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="grid md:grid-cols-[160px_1fr] gap-3">
                  <SingleImageUpload value={a.image_uri} onChange={(url) => patch(a.rid, { image_uri: url })} />
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="!text-xs !mb-1">名称（≤10字）</Label>
                        <Input
                          value={a.name}
                          onChange={(e) => patch(a.rid, { name: e.target.value.slice(0, 10) })}
                          placeholder={isCharacter ? "如 林枫 / 旁白" : a.type === "scene" ? "如 青云大殿" : "如 斩妖剑"}
                          className="h-9 text-sm"
                        />
                      </div>
                      {isCharacter && (
                        <div>
                          <Label className="!text-xs !mb-1">音色</Label>
                          <VoicePicker
                            value={a.voice_id}
                            onChange={(id) => patch(a.rid, { voice_id: id })}
                            options={voices}
                            allowEmpty
                            emptyLabel="（未选 · 角色不发声）"
                            size="sm"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="!text-xs !mb-1">描述（可选，越详细一致性越高）</Label>
                      <Textarea
                        value={a.description}
                        onChange={(e) => patch(a.rid, { description: e.target.value })}
                        placeholder={
                          isCharacter
                            ? "如：青云宗弟子，身穿青色长袍，眼神坚定。"
                            : a.type === "scene"
                              ? "如：宏伟的宗门主殿，云雾缭绕，仙气十足。"
                              : "如：通体发光的古剑，剑身刻有符文。"
                        }
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
