"use client";

/**
 * 自动化配置表单（客户端）
 *
 *   两组开关：分析规划阶段（4 项）+ 生成制作阶段（3 项）
 *   失败重试上限：Chat 模型 / 图片生成
 *   每方案出图数
 *
 * 阶段 0：保存到 /api/ecom-image/auto-config（待建）暂时直接 PATCH 单行
 *         为简单起见，阶段 0 只在前端 state 维护，不真正落库
 */

import { useState } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

interface FormState {
  autoConfirm: Record<string, boolean>;
  retryChat: number;
  retryImageGen: number;
  imagesPerPlan: number;
  defaultImageModelSlug: string;
  defaultPromptLanguage: "zh" | "en";
}

const ANALYZE_FLAGS = [
  { key: "product_analysis", label: "商品智能分析", desc: "自动选择所有推荐的出图类型并确认" },
  { key: "supplement_info", label: "补充资料", desc: "自动跳过补充资料环节" },
  { key: "image_analysis", label: "图片内容分析", desc: "分析完成后自动确认" },
  { key: "plan_creation", label: "出图方案规划", desc: "方案生成后自动确认" },
];

const GENERATE_FLAGS = [
  { key: "model_selection", label: "模型选择", desc: "使用配置中的默认模型自动确认" },
  { key: "prompt_generation", label: "提示词生成", desc: "自动批量生成所有图片提示词" },
  { key: "image_generation", label: "图片生成", desc: "自动批量生成图片" },
];

export default function SettingsForm({ initial }: { initial: FormState | null }) {
  const [form, setForm] = useState<FormState>(
    initial ?? {
      autoConfirm: {},
      retryChat: 5,
      retryImageGen: 5,
      imagesPerPlan: 2,
      defaultImageModelSlug: "",
      defaultPromptLanguage: "zh",
    },
  );
  const [savedHint, setSavedHint] = useState(false);

  function setFlag(key: string, v: boolean) {
    setForm((f) => ({ ...f, autoConfirm: { ...f.autoConfirm, [key]: v } }));
    setSavedHint(false);
  }

  function setAllInGroup(group: typeof ANALYZE_FLAGS, val: boolean) {
    setForm((f) => {
      const next = { ...f.autoConfirm };
      for (const g of group) next[g.key] = val;
      return { ...f, autoConfirm: next };
    });
    setSavedHint(false);
  }

  function save() {
    // 阶段 0 暂只在前端 state；真正存盘留给后续 API
    // TODO: 阶段 4 接入 PATCH /api/ecom-image/auto-config
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 分析规划阶段 */}
      <Card className="p-5">
        <FlagGroup
          title="分析规划阶段"
          flags={ANALYZE_FLAGS}
          values={form.autoConfirm}
          onChange={setFlag}
          onClearAll={() => setAllInGroup(ANALYZE_FLAGS, false)}
        />
      </Card>

      {/* 生成制作阶段 */}
      <Card className="p-5">
        <FlagGroup
          title="生成制作阶段"
          flags={GENERATE_FLAGS}
          values={form.autoConfirm}
          onChange={setFlag}
          onClearAll={() => setAllInGroup(GENERATE_FLAGS, false)}
        />
      </Card>

      {/* 失败重试上限 */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">失败自动重试上限</h3>
        <div className="space-y-3">
          <NumberRow
            label="Chat 模型"
            sub="节点 / 提示词等，每项最多重试"
            unit="次"
            value={form.retryChat}
            min={0}
            max={20}
            onChange={(v) => setForm((f) => ({ ...f, retryChat: v }))}
          />
          <NumberRow
            label="图片生成"
            sub="每张图片生成失败最多重试"
            unit="次/张"
            value={form.retryImageGen}
            min={0}
            max={20}
            onChange={(v) => setForm((f) => ({ ...f, retryImageGen: v }))}
          />
          <NumberRow
            label="每方案出图数"
            sub="每个图片方案生成几张图（候选挑优用）"
            unit="张/方案"
            value={form.imagesPerPlan}
            min={1}
            max={5}
            onChange={(v) => setForm((f) => ({ ...f, imagesPerPlan: v }))}
          />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {savedHint && <span className="text-xs text-emerald-600">✓ 已保存（阶段 0 仅本地）</span>}
        <button
          onClick={save}
          className="px-4 h-10 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
        >
          保存设置
        </button>
      </div>
    </div>
  );
}

function FlagGroup({
  title,
  flags,
  values,
  onChange,
  onClearAll,
}: {
  title: string;
  flags: { key: string; label: string; desc: string }[];
  values: Record<string, boolean>;
  onChange: (key: string, v: boolean) => void;
  onClearAll: () => void;
}) {
  const allOff = flags.every((f) => !values[f.key]);
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <button
          onClick={onClearAll}
          disabled={allOff}
          className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40"
        >
          取消全选
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {flags.map((f) => {
          const v = !!values[f.key];
          return (
            <div key={f.key} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">{f.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{f.desc}</div>
              </div>
              <button
                onClick={() => onChange(f.key, !v)}
                className={cn(
                  "shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors",
                  v ? "bg-amber-500" : "bg-slate-200",
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full bg-white shadow transition-transform",
                    v ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function NumberRow({
  label,
  sub,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  sub: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-8 h-8 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          −
        </button>
        <span className="w-10 text-center text-sm font-bold">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-8 h-8 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          +
        </button>
        <span className="text-xs text-slate-400 ml-1 w-16">{unit}</span>
      </div>
    </div>
  );
}
