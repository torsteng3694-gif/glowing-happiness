"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Label, Select, Textarea } from "@/components/ui";

type ModelOpt = { id: string; slug: string; name: string; provider: string; logo: string };
type Analysis = {
  styleKeywords: string[];
  characterKeywords: string[];
  sceneKeywords: string[];
  moodKeywords: string[];
  cameraKeywords: string[];
};
type DraftPanel = { index: number; title: string; caption: string; imagePrompt: string };
type Panel = { index: number; title: string; caption: string; url?: string; error?: string };
type PersistedState = {
  prompt: string;
  llmModelId: string;
  imageModelId: string;
  panelCount: number;
  aspectRatio: string;
  step: 1 | 2 | 3;
  analysis: Analysis | null;
  drafts: DraftPanel[];
  panels: Panel[];
  llmCost: number;
  imageCost: number;
  anchorRefUrl: string | null;
  updatedAt: number;
};

const STORAGE_KEY = "comic-auto:workspace:v1";

export default function ComicAutoClient({
  llmModels,
  imageModels,
}: {
  llmModels: ModelOpt[];
  imageModels: ModelOpt[];
}) {
  const [prompt, setPrompt] = useState("");
  const [llmModelId, setLlmModelId] = useState(llmModels[0]?.id || "");
  const [imageModelId, setImageModelId] = useState(imageModels[0]?.id || "");
  const [panelCount, setPanelCount] = useState(4);
  const [aspectRatio, setAspectRatio] = useState("3:2");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [drafts, setDrafts] = useState<DraftPanel[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [llmCost, setLlmCost] = useState(0);
  const [imageCost, setImageCost] = useState(0);
  const [anchorRefUrl, setAnchorRefUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"" | "png" | "pdf">("");
  const restoredRef = useRef(false);

  function resetDownstream(nextStep: 1 | 2 = 1) {
    setStep(nextStep);
    if (nextStep === 1) {
      setAnalysis(null);
      setDrafts([]);
      setPanels([]);
      setLlmCost(0);
      setImageCost(0);
      setAnchorRefUrl(null);
    }
    if (nextStep === 2) {
      setPanels([]);
      setImageCost(0);
      setAnchorRefUrl(null);
    }
  }

  function clearLocalWorkspace() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setPrompt("");
    setLlmModelId(llmModels[0]?.id || "");
    setImageModelId(imageModels[0]?.id || "");
    setPanelCount(4);
    setAspectRatio("3:2");
    setError("");
    resetDownstream(1);
  }

  async function runAnalysis() {
    if (!prompt.trim() || !llmModelId || running) return;
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/comic-auto/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          llmModelId,
          panelCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `分析失败 (HTTP ${res.status})`);
      setAnalysis(data.analysis);
      setDrafts((data.drafts || []) as DraftPanel[]);
      setLlmCost(data?.usage?.llmCost || 0);
      setPanels([]);
      setImageCost(0);
      setAnchorRefUrl(null);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setRunning(false);
    }
  }

  async function runRender() {
    if (!imageModelId || drafts.length === 0 || running) return;
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/comic-auto/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageModelId,
          aspectRatio,
          drafts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `出图失败 (HTTP ${res.status})`);
      setPanels(data.panels || []);
      setImageCost(data?.usage?.imageCost || 0);
      setAnchorRefUrl(data?.consistency?.anchorRefUrl || null);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "出图失败");
    } finally {
      setRunning(false);
    }
  }

  function updateDraft(index: number, patch: Partial<DraftPanel>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function exportByBackend(format: "png" | "pdf") {
    try {
      setExporting(format);
      setError("");
      const okPanels = panels.filter((p) => p.url);
      if (okPanels.length < 2) throw new Error("至少需要 2 张成功分镜才能导出");
      const res = await fetch("/api/comic-auto/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          panels: okPanels.map((p) => ({
            index: p.index,
            title: p.title,
            caption: p.caption,
            url: p.url,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `导出失败 (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `comic-page-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(e instanceof Error ? e.message : `导出 ${format.toUpperCase()} 失败`);
    } finally {
      setExporting("");
    }
  }

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedState;
      if (!parsed || typeof parsed !== "object") return;
      setPrompt(typeof parsed.prompt === "string" ? parsed.prompt : "");
      setLlmModelId(
        llmModels.some((m) => m.id === parsed.llmModelId) ? parsed.llmModelId : (llmModels[0]?.id || ""),
      );
      setImageModelId(
        imageModels.some((m) => m.id === parsed.imageModelId) ? parsed.imageModelId : (imageModels[0]?.id || ""),
      );
      setPanelCount([2, 3, 4, 5, 6, 7, 8].includes(parsed.panelCount) ? parsed.panelCount : 4);
      setAspectRatio(["3:2", "16:9", "9:16", "1:1"].includes(parsed.aspectRatio) ? parsed.aspectRatio : "3:2");
      setStep(parsed.step === 2 || parsed.step === 3 ? parsed.step : 1);
      setAnalysis(parsed.analysis ?? null);
      setDrafts(Array.isArray(parsed.drafts) ? parsed.drafts : []);
      setPanels(Array.isArray(parsed.panels) ? parsed.panels : []);
      setLlmCost(typeof parsed.llmCost === "number" ? parsed.llmCost : 0);
      setImageCost(typeof parsed.imageCost === "number" ? parsed.imageCost : 0);
      setAnchorRefUrl(typeof parsed.anchorRefUrl === "string" ? parsed.anchorRefUrl : null);
    } catch {
      // ignore corrupted local storage
    }
  }, [llmModels, imageModels]);

  useEffect(() => {
    if (!restoredRef.current) return;
    const snapshot: PersistedState = {
      prompt,
      llmModelId,
      imageModelId,
      panelCount,
      aspectRatio,
      step,
      analysis,
      drafts,
      panels,
      llmCost,
      imageCost,
      anchorRefUrl,
      updatedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore quota/security errors
    }
  }, [
    prompt,
    llmModelId,
    imageModelId,
    panelCount,
    aspectRatio,
    step,
    analysis,
    drafts,
    panels,
    llmCost,
    imageCost,
    anchorRefUrl,
  ]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">自动生成漫画智能体</h1>
        <p className="text-sm text-slate-500 mt-1">
          全流程可视化：配置输入 → 分镜草案确认 → 漫画出图导出。
        </p>
      </div>

      <Card className="p-4">
        <div className="grid md:grid-cols-3 gap-2">
          {[
            { id: 1, name: "1. 创意输入" },
            { id: 2, name: "2. 草案确认" },
            { id: 3, name: "3. 出图导出" },
          ].map((s) => (
            <div
              key={s.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                step === s.id
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : step > s.id
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              {s.name}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <Label>漫画创意</Label>
          <Textarea
            className="min-h-[120px]"
            placeholder="例如：未来都市中，外卖员机器人误入黑帮交易现场，被迫假扮卧底..."
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (step > 1) resetDownstream(1);
            }}
          />
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <Label>语言模型</Label>
            <Select
              value={llmModelId}
              onChange={(e) => {
                setLlmModelId(e.target.value);
                if (step > 1) resetDownstream(1);
              }}
              className="w-full"
            >
              {llmModels.map((m) => (
                <option key={m.id} value={m.id}>{m.logo} {m.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>图片模型</Label>
            <Select
              value={imageModelId}
              onChange={(e) => {
                setImageModelId(e.target.value);
                if (step > 2) resetDownstream(2);
              }}
              className="w-full"
            >
              {imageModels.map((m) => (
                <option key={m.id} value={m.id}>{m.logo} {m.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>分镜格数</Label>
            <Select
              value={String(panelCount)}
              onChange={(e) => {
                setPanelCount(parseInt(e.target.value, 10));
                if (step > 1) resetDownstream(1);
              }}
              className="w-full"
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n} 格</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>画幅</Label>
            <Select
              value={aspectRatio}
              onChange={(e) => {
                setAspectRatio(e.target.value);
                if (step > 2) resetDownstream(2);
              }}
              className="w-full"
            >
              {["3:2", "16:9", "9:16", "1:1"].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={runAnalysis} disabled={running || !prompt.trim()} className="flex-1">
            {running ? "分析中..." : "步骤 1：生成关键词与分镜草案"}
          </Button>
          {step > 1 && (
            <Button variant="outline" onClick={() => resetDownstream(1)}>
              重新开始
            </Button>
          )}
          <Button variant="outline" onClick={clearLocalWorkspace}>
            清空本地任务
          </Button>
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
      </Card>

      {analysis && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">步骤 2：关键词与分镜草案确认</h2>
            <Badge color="brand">分析花费 ¥{llmCost.toFixed(4)}</Badge>
          </div>
          <KeywordRow label="风格关键词" items={analysis.styleKeywords} />
          <KeywordRow label="角色关键词" items={analysis.characterKeywords} />
          <KeywordRow label="场景关键词" items={analysis.sceneKeywords} />
          <KeywordRow label="氛围关键词" items={analysis.moodKeywords} />
          <KeywordRow label="镜头关键词" items={analysis.cameraKeywords} />
          <div className="space-y-3 pt-2">
            <div className="text-sm font-medium">分镜草案（可编辑后确认）</div>
            <div className="grid md:grid-cols-2 gap-3">
              {drafts.map((d, i) => (
                <Card key={d.index} className="p-3 space-y-2">
                  <div className="text-xs text-slate-500">第 {d.index} 格</div>
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={d.title}
                    onChange={(e) => updateDraft(i, { title: e.target.value })}
                    placeholder="分镜标题"
                  />
                  <Textarea
                    className="min-h-[60px]"
                    value={d.caption}
                    onChange={(e) => updateDraft(i, { caption: e.target.value })}
                    placeholder="字幕文案"
                  />
                  <Textarea
                    className="min-h-[100px] font-mono text-xs"
                    value={d.imagePrompt}
                    onChange={(e) => updateDraft(i, { imagePrompt: e.target.value })}
                    placeholder="英文 image prompt"
                  />
                </Card>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={runRender} disabled={running || drafts.length === 0} className="flex-1">
              {running ? "出图中..." : "步骤 2 确认并进入步骤 3 出图"}
            </Button>
            <Button variant="outline" onClick={() => setStep(1)}>返回上一步</Button>
          </div>
        </Card>
      )}

      {panels.length > 0 && (
        <div className="space-y-4">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">步骤 3：分镜出图结果</h3>
              <Badge color="brand">总花费 ¥{(llmCost + imageCost).toFixed(4)}</Badge>
            </div>
            <div className="text-xs text-slate-500">出图花费 ¥{imageCost.toFixed(4)}</div>
            {anchorRefUrl && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                连续一致性已启用：后续分镜自动参考首格角色图
              </div>
            )}
          </Card>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => exportByBackend("png")} disabled={exporting !== ""}>
              {exporting === "png" ? "PNG 导出中..." : "导出整页 PNG"}
            </Button>
            <Button onClick={() => exportByBackend("pdf")} disabled={exporting !== ""}>
              {exporting === "pdf" ? "PDF 导出中..." : "导出整页 PDF"}
            </Button>
            <Button variant="outline" onClick={() => setStep(2)}>返回草案继续改</Button>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {panels.map((p) => (
              <Card key={p.index} className="p-4 space-y-3">
                <div className="text-xs text-slate-500">第 {p.index} 格</div>
                <div className="font-medium">{p.title}</div>
                <div className="text-sm text-slate-600">{p.caption}</div>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    <img src={p.url} alt={p.title} className="w-full rounded-lg border border-slate-200" />
                  </a>
                ) : (
                  <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2 py-2">
                    该格生成失败：{p.error || "未知错误"}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KeywordRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-sm text-slate-500 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {(items || []).map((x, i) => (
          <Badge key={`${label}-${i}`} color="slate">{x}</Badge>
        ))}
      </div>
    </div>
  );
}

