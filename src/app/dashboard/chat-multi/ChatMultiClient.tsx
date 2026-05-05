"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Select, Textarea, Badge, Spinner } from "@/components/ui";
import {
  Send, Trash2, Users, Sparkles, Zap, ShieldCheck, Bot, User as UserIcon,
  AlertTriangle, Check, Crown,
} from "lucide-react";
import { cn, formatMoney, uid } from "@/lib/utils";
import MarkdownMessage from "@/components/chat/MarkdownMessage";

type Model = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  logo: string;
  inputPrice: number;
  outputPrice: number;
  tags: string[];
};

type Msg = { role: "user" | "assistant"; content: string };

type BranchState = {
  modelId: string;
  name: string;
  logo: string;
  provider: string;
  text: string;
  status: "pending" | "streaming" | "success" | "failed";
  error?: string;
  cost?: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

type Turn = {
  id: string;
  userMessage: string;
  branches: BranchState[];
  fuser: {
    modelId: string;
    name: string;
    logo: string;
    text: string;
    status: "idle" | "streaming" | "success" | "failed";
    error?: string;
    cost?: number;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
  } | null;
  totalCost?: number;
  startedAt: number;
  finishedAt?: number;
};

const FEATURES = [
  { icon: Users, title: "多元视角", desc: "GPT、Claude、Gemini 等多模型同时响应" },
  { icon: Sparkles, title: "智能融合", desc: "AI 自动分析对比，生成最优答案" },
  { icon: Zap, title: "并行加速", desc: "多模型同时运算，极速响应" },
  { icon: ShieldCheck, title: "质量保障", desc: "交叉验证，减少幻觉和错误" },
];

const MAX_SELECT = 5;
const MIN_SELECT = 2;

export default function ChatMultiClient({ models }: { models: Model[] }) {
  // 默认选 3 个；如果模型数量不够就全选
  const defaultSelected = useMemo(() => models.slice(0, Math.min(3, models.length)).map((m) => m.id), [models]);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelected);
  const [fuserEnabled, setFuserEnabled] = useState(true);
  const [fuserModelId, setFuserModelId] = useState<string>(defaultSelected[0] || "");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedModels = useMemo(
    () => selectedIds.map((id) => models.find((m) => m.id === id)!).filter(Boolean),
    [selectedIds, models],
  );

  // 估算一次交互的最大花费：input 全部 + 每个模型估 500 输出 tokens，可见的参考
  const estimatedCost = useMemo(() => {
    const inputTokens = Math.max(1, Math.round(input.length / 3));
    const outEst = 500;
    let c = 0;
    for (const id of selectedIds) {
      const m = models.find((x) => x.id === id);
      if (!m) continue;
      c += (inputTokens / 1000) * m.inputPrice + (outEst / 1000) * m.outputPrice;
    }
    if (fuserEnabled) {
      const m = models.find((x) => x.id === fuserModelId);
      if (m) {
        // 融合的 input = 原问题 + 所有分支答案，粗略 inputEst * N
        c += ((inputTokens + outEst * selectedIds.length) / 1000) * m.inputPrice;
        c += (outEst / 1000) * m.outputPrice;
      }
    }
    return c;
  }, [input, selectedIds, fuserEnabled, fuserModelId, models]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  // 保证 fuserModelId 总是选中模型中的一个
  useEffect(() => {
    if (!selectedIds.includes(fuserModelId) && selectedIds.length > 0) {
      setFuserModelId(selectedIds[0]);
    }
  }, [selectedIds, fuserModelId]);

  function toggleModel(id: string) {
    setSelectedIds((arr) => {
      if (arr.includes(id)) return arr.filter((x) => x !== id);
      if (arr.length >= MAX_SELECT) return arr;
      return [...arr, id];
    });
  }

  async function send() {
    if (loading) return;
    const q = input.trim();
    if (!q) return;
    if (selectedIds.length < MIN_SELECT) {
      setError(`至少选择 ${MIN_SELECT} 个模型进行协作`);
      return;
    }
    setError("");

    // 构造 messages：把历史里之前所有 turn 的 user + 融合答案/首个分支答案串起来，
    // 这样多轮对话仍然有上下文。没有融合时，取第一个成功分支作为 assistant 历史。
    const history: Msg[] = [];
    for (const t of turns) {
      history.push({ role: "user", content: t.userMessage });
      let asst = "";
      if (t.fuser && t.fuser.status === "success" && t.fuser.text) asst = t.fuser.text;
      else {
        const first = t.branches.find((b) => b.status === "success" && b.text);
        if (first) asst = first.text;
      }
      if (asst) history.push({ role: "assistant", content: asst });
    }
    history.push({ role: "user", content: q });

    const turnId = uid();
    const fuserModel = fuserEnabled ? models.find((m) => m.id === fuserModelId) : null;
    const newTurn: Turn = {
      id: turnId,
      userMessage: q,
      branches: selectedModels.map((m) => ({
        modelId: m.id,
        name: m.name,
        logo: m.logo,
        provider: m.provider,
        text: "",
        status: "pending",
      })),
      fuser: fuserModel
        ? {
            modelId: fuserModel.id,
            name: fuserModel.name,
            logo: fuserModel.logo,
            text: "",
            status: "idle",
          }
        : null,
      startedAt: Date.now(),
    };
    setTurns((ts) => [...ts, newTurn]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelIds: selectedIds,
          fuserModelId: fuserModel?.id,
          messages: history,
        }),
      });

      if (!res.ok || !res.body) {
        const txt = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try { errMsg = JSON.parse(txt).error || errMsg; } catch { if (txt) errMsg = txt.slice(0, 200); }
        setTurns((ts) =>
          ts.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  branches: t.branches.map((b) => ({ ...b, status: "failed", error: errMsg })),
                  fuser: t.fuser ? { ...t.fuser, status: "failed", error: errMsg } : null,
                  finishedAt: Date.now(),
                }
              : t,
          ),
        );
        setError(errMsg);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const l = line.trim();
          if (!l) continue;
          let ev: any;
          try { ev = JSON.parse(l); } catch { continue; }
          applyEvent(turnId, ev);
        }
      }
      if (buf.trim()) {
        try { applyEvent(turnId, JSON.parse(buf)); } catch { /* noop */ }
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      setTurns((ts) =>
        ts.map((t) =>
          t.id === turnId
            ? {
                ...t,
                branches: t.branches.map((b) =>
                  b.status === "success" || b.status === "failed" ? b : { ...b, status: "failed", error: m },
                ),
                fuser:
                  t.fuser && t.fuser.status !== "success" && t.fuser.status !== "failed"
                    ? { ...t.fuser, status: "failed", error: m }
                    : t.fuser,
                finishedAt: Date.now(),
              }
            : t,
        ),
      );
    } finally {
      setLoading(false);
      setTurns((ts) =>
        ts.map((t) => (t.id === turnId && !t.finishedAt ? { ...t, finishedAt: Date.now() } : t)),
      );
    }
  }

  function applyEvent(turnId: string, ev: any) {
    setTurns((ts) =>
      ts.map((t) => {
        if (t.id !== turnId) return t;
        switch (ev.type) {
          case "init":
            return t;
          case "delta": {
            return {
              ...t,
              branches: t.branches.map((b) =>
                b.modelId === ev.modelId
                  ? {
                      ...b,
                      text: b.text + (ev.delta || ""),
                      status: b.status === "pending" ? "streaming" : b.status,
                    }
                  : b,
              ),
            };
          }
          case "error": {
            return {
              ...t,
              branches: t.branches.map((b) =>
                b.modelId === ev.modelId ? { ...b, status: "failed", error: ev.error || "失败" } : b,
              ),
            };
          }
          case "done": {
            return {
              ...t,
              branches: t.branches.map((b) =>
                b.modelId === ev.modelId
                  ? {
                      ...b,
                      status: ev.ok === false ? "failed" : "success",
                      cost: ev.cost,
                      latencyMs: ev.latencyMs,
                      inputTokens: ev.inputTokens,
                      outputTokens: ev.outputTokens,
                      error: ev.ok === false ? ev.error || b.error : b.error,
                    }
                  : b,
              ),
            };
          }
          case "fuse-start":
            return {
              ...t,
              fuser: t.fuser
                ? { ...t.fuser, status: "streaming", modelId: ev.modelId || t.fuser.modelId, name: ev.name || t.fuser.name, logo: ev.logo || t.fuser.logo }
                : null,
            };
          case "fuse-delta":
            return {
              ...t,
              fuser: t.fuser
                ? { ...t.fuser, text: t.fuser.text + (ev.delta || ""), status: "streaming" }
                : null,
            };
          case "fuse-error":
            return {
              ...t,
              fuser: t.fuser ? { ...t.fuser, status: "failed", error: ev.error || "失败" } : null,
            };
          case "fuse-done":
            return {
              ...t,
              fuser: t.fuser
                ? {
                    ...t.fuser,
                    status: ev.ok === false ? "failed" : "success",
                    cost: ev.cost,
                    latencyMs: ev.latencyMs,
                    inputTokens: ev.inputTokens,
                    outputTokens: ev.outputTokens,
                    error: ev.ok === false ? ev.error || t.fuser?.error : t.fuser?.error,
                  }
                : null,
            };
          case "all-done":
            return { ...t, totalCost: ev.totalCost, finishedAt: Date.now() };
          default:
            return t;
        }
      }),
    );
  }

  function clearAll() {
    if (loading) return;
    setTurns([]);
    setError("");
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white p-6 md:p-8 shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_50%)] pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Multi-Model Collaboration
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">多模型协作 · 智能对话</h1>
          <p className="mt-2 text-white/85 text-sm md:text-base">
            同时调用多个顶尖 AI 模型，融合最佳答案
          </p>
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-white/10 backdrop-blur rounded-xl p-3">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Icon className="w-4 h-4" /> {f.title}
                  </div>
                  <div className="text-white/80 text-xs mt-1 leading-5">{f.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Config */}
      <Card className="p-5">
        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-800">选择协作模型</div>
              <div className="text-xs text-slate-500">
                已选 <b className="text-slate-900">{selectedIds.length}</b> / 最多 {MAX_SELECT}（至少 {MIN_SELECT}）
              </div>
            </div>
            {models.length === 0 ? (
              <div className="text-sm text-slate-500 py-8 text-center border border-dashed rounded-xl">
                当前没有可用的 chat 模型。请在管理后台或模型市场启用一些。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {models.map((m) => {
                  const on = selectedIds.includes(m.id);
                  const disabled = !on && selectedIds.length >= MAX_SELECT;
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => !disabled && toggleModel(m.id)}
                      disabled={disabled}
                      className={cn(
                        "group text-left relative flex items-start gap-3 rounded-xl border px-3 py-2.5 transition",
                        on
                          ? "border-violet-300 bg-violet-50/60 ring-1 ring-violet-200"
                          : disabled
                            ? "border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed"
                            : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/30",
                      )}
                    >
                      <div className="text-xl leading-none mt-0.5">{m.logo}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-medium text-slate-900 truncate">{m.name}</div>
                          {m.id === fuserModelId && fuserEnabled && on && (
                            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{m.provider}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          ¥{m.inputPrice}/¥{m.outputPrice} · 1K tokens
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5",
                          on ? "bg-violet-600 border-violet-600 text-white" : "border-slate-300 bg-white",
                        )}
                      >
                        {on && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="p-4 bg-slate-50/60 border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Crown className="w-4 h-4 text-amber-500" /> 融合评审
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fuserEnabled}
                    onChange={(e) => setFuserEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-checked:bg-violet-600 rounded-full transition" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition" />
                </label>
              </div>
              <div className="text-[11px] text-slate-500 leading-5 mb-2">
                打开后，会让下列模型读取所有候选答案，自动融合成一个更靠谱的最终答复。
              </div>
              <Select
                value={fuserModelId}
                onChange={(e) => setFuserModelId(e.target.value)}
                disabled={!fuserEnabled}
                className="w-full"
              >
                {selectedIds.length === 0 ? (
                  <option value="">请先选择模型</option>
                ) : (
                  selectedIds.map((id) => {
                    const m = models.find((x) => x.id === id);
                    if (!m) return null;
                    return (
                      <option key={id} value={id}>
                        {m.logo} {m.name}
                      </option>
                    );
                  })
                )}
              </Select>
            </Card>

            <div className="text-xs text-slate-500 leading-5 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-amber-700 font-medium mb-1">
                <Zap className="w-3.5 h-3.5" /> 本次预估
              </div>
              <div>
                最多约 <b className="text-amber-700">¥ {formatMoney(estimatedCost, 4)}</b>（基于 500 tokens 估算；实际按真实用量计费）
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Conversation */}
      <div ref={scrollRef} className="space-y-8">
        {turns.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="text-lg font-semibold text-slate-800">开始你的多模型对话</div>
            <div className="text-sm text-slate-500 mt-1">
              在下面输入你的问题，勾选的模型会并行作答，再由「融合评审」模型给出最终最优答复。
            </div>
            <div className="mt-6 grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
              {[
                "比较不同主流大模型在中文长文摘要上的典型差异",
                "给这段 JS 代码挑三个潜在 bug，并给出修复方案",
                "帮我设计一个 30 天英语口语训练计划",
                "量子计算中为什么叠加态比经典比特更强？",
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-left text-xs p-3 rounded-xl bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50/30 transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} />)
        )}
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 -mx-6 md:-mx-8 px-6 md:px-8">
        <Card className="p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="输入你的问题（Enter 发送，Shift+Enter 换行）"
              className="flex-1 min-h-[52px] max-h-[200px] border-0 focus-visible:ring-0"
              disabled={loading}
            />
            <Button variant="outline" onClick={clearAll} disabled={loading || turns.length === 0} size="md">
              <Trash2 className="w-4 h-4" />
              清空
            </Button>
            <Button
              onClick={send}
              disabled={loading || !input.trim() || selectedIds.length < MIN_SELECT}
              size="lg"
            >
              {loading ? <Spinner /> : <Send className="w-4 h-4" />}
              {loading ? "协作中..." : `协作 (${selectedIds.length})`}
            </Button>
          </div>
          {error && (
            <div className="mt-2 text-xs text-rose-600 inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ============================== Turn view ============================== */

function TurnView({ turn }: { turn: Turn }) {
  const inFlight =
    turn.branches.some((b) => b.status === "pending" || b.status === "streaming") ||
    turn.fuser?.status === "streaming";

  // 列数：根据分支数量决定；桌面端最多 5 列
  const cols = turn.branches.length;
  const colsClass =
    cols <= 1 ? "grid-cols-1"
      : cols === 2 ? "grid-cols-1 md:grid-cols-2"
        : cols === 3 ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          : cols === 4 ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
            : "grid-cols-1 md:grid-cols-2 xl:grid-cols-5";

  return (
    <div className="space-y-4">
      {/* user bubble */}
      <div className="flex justify-end gap-3">
        <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-slate-900 text-white text-sm leading-7 whitespace-pre-wrap">
          {turn.userMessage}
        </div>
        <div className="w-8 h-8 shrink-0 rounded-lg bg-slate-900 text-white flex items-center justify-center">
          <UserIcon className="w-4 h-4" />
        </div>
      </div>

      {/* Branches */}
      <div className={cn("grid gap-3", colsClass)}>
        {turn.branches.map((b) => (
          <BranchCard key={b.modelId} branch={b} />
        ))}
      </div>

      {/* Fuser */}
      {turn.fuser && (
        <FuserCard fuser={turn.fuser} />
      )}

      {/* Footer */}
      <div className="text-[11px] text-slate-400 flex items-center gap-3">
        <span>共耗时 {turn.finishedAt ? Math.round((turn.finishedAt - turn.startedAt) / 100) / 10 : "…"}s</span>
        {typeof turn.totalCost === "number" && (
          <span>本轮消费 <b className="text-slate-600">¥ {formatMoney(turn.totalCost, 4)}</b></span>
        )}
        {inFlight && <span className="text-violet-600 inline-flex items-center gap-1"><Spinner /> 进行中</span>}
      </div>
    </div>
  );
}

function BranchCard({ branch }: { branch: BranchState }) {
  return (
    <Card className={cn(
      "p-4 overflow-hidden transition",
      branch.status === "failed" && "border-rose-200 bg-rose-50/40",
      branch.status === "success" && "border-emerald-200/70",
    )}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center text-base">
            {branch.logo}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">{branch.name}</div>
            <div className="text-[10px] text-slate-500 truncate">{branch.provider}</div>
          </div>
        </div>
        <BranchBadge status={branch.status} />
      </div>

      {branch.status === "failed" && branch.error && (
        <div className="text-xs text-rose-700 bg-rose-100/70 rounded-md px-2 py-1.5 mb-2 leading-5">
          {branch.error}
        </div>
      )}

      <div className="text-sm leading-6 text-slate-800 min-h-[60px] max-h-[400px] overflow-y-auto">
        {branch.text ? (
          <MarkdownMessage content={branch.text} className="text-sm leading-6" />
        ) : branch.status === "pending" || branch.status === "streaming" ? (
          <span className="inline-flex items-center gap-2 text-slate-400"><Spinner /> 等待模型响应…</span>
        ) : null}
      </div>

      {(branch.status === "success" || branch.status === "failed") && (
        <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
          {typeof branch.latencyMs === "number" && <span>{(branch.latencyMs / 1000).toFixed(1)}s</span>}
          {typeof branch.inputTokens === "number" && (
            <span>{branch.inputTokens} in · {branch.outputTokens ?? 0} out</span>
          )}
          {typeof branch.cost === "number" && branch.cost > 0 && (
            <span>¥ {formatMoney(branch.cost, 4)}</span>
          )}
        </div>
      )}
    </Card>
  );
}

function BranchBadge({ status }: { status: BranchState["status"] }) {
  if (status === "pending") return <Badge color="slate" className="text-[10px]">排队</Badge>;
  if (status === "streaming")
    return <Badge color="brand" className="text-[10px] inline-flex items-center gap-1"><Spinner /> 生成中</Badge>;
  if (status === "success") return <Badge color="green" className="text-[10px]">完成</Badge>;
  return <Badge color="rose" className="text-[10px]">失败</Badge>;
}

function FuserCard({ fuser }: { fuser: NonNullable<Turn["fuser"]> }) {
  const isActive = fuser.status === "streaming";
  const ok = fuser.status === "success";
  const failed = fuser.status === "failed";

  return (
    <div className="relative">
      <div className={cn(
        "absolute inset-0 rounded-2xl opacity-60 blur-xl -z-10 transition",
        isActive ? "bg-gradient-to-r from-violet-300 to-fuchsia-300" : ok ? "bg-gradient-to-r from-amber-200 to-rose-200" : "bg-transparent",
      )} />
      <Card className={cn(
        "p-5 border-2",
        ok ? "border-amber-300 bg-gradient-to-br from-amber-50/60 to-white"
          : isActive ? "border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50"
            : failed ? "border-rose-200 bg-rose-50/40"
              : "border-slate-200",
      )}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-rose-500 to-violet-500 text-white flex items-center justify-center">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                融合最佳答案
                <span className="text-[10px] font-normal text-slate-500">by {fuser.logo} {fuser.name}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {fuser.status === "idle" && "等待所有模型返回后开始融合"}
                {fuser.status === "streaming" && "正在交叉分析并融合…"}
                {fuser.status === "success" && "已完成 · 融合自多个候选答案"}
                {fuser.status === "failed" && "融合失败"}
              </div>
            </div>
          </div>
          {fuser.status === "streaming" && <Spinner />}
          {ok && <Badge color="amber">⭐ 推荐</Badge>}
          {failed && <Badge color="rose">失败</Badge>}
        </div>

        {failed && fuser.error && (
          <div className="text-xs text-rose-700 bg-rose-100/70 rounded-md px-2 py-1.5 mb-2 leading-5">
            {fuser.error}
          </div>
        )}

        <div className="text-slate-900">
          {fuser.text ? (
            <MarkdownMessage content={fuser.text} />
          ) : fuser.status === "idle" ? (
            <span className="text-slate-400 text-sm">…</span>
          ) : fuser.status === "streaming" ? (
            <span className="inline-flex items-center gap-2 text-slate-400 text-sm"><Spinner /> 正在融合…</span>
          ) : null}
        </div>

        {(ok || failed) && (
          <div className="mt-3 pt-2 border-t border-slate-200/70 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
            {typeof fuser.latencyMs === "number" && <span>{(fuser.latencyMs / 1000).toFixed(1)}s</span>}
            {typeof fuser.inputTokens === "number" && (
              <span>{fuser.inputTokens} in · {fuser.outputTokens ?? 0} out</span>
            )}
            {typeof fuser.cost === "number" && fuser.cost > 0 && (
              <span>¥ {formatMoney(fuser.cost, 4)}</span>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
