"use client";

/**
 * 解说漫剧 · 导演台
 *
 * 阶段 1（当前）：剧本拆分 → 分镜表（手动可增删改 / 拖动排序）
 * 阶段 2：每镜首/尾帧生图（按钮触发，按管线里 image 模型）
 * 阶段 3：每镜 TTS + Vidu img2video（按钮触发，按管线里 tts/video 模型）
 * 阶段 4：导出 ZIP（音频 + 片段 + 清单.json）
 *
 * 阶段 1 只接 /api/comic/scenes/draft，其他按钮先呈现 UI 但禁用。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Button, Card, Input, Label, Textarea, Badge, Spinner, Select,
} from "@/components/ui";
import {
  Wand2, AlertTriangle, Sparkles, Plus, Trash2, ArrowUp, ArrowDown,
  ImageIcon, AudioLines, Film, Download, Mic2, RefreshCcw, Play,
} from "lucide-react";
import { uid } from "@/lib/utils";
import { PipelineSelector, type PipelineState, type PipelineOptions } from "./PipelineSelector";
import { PRESET_VOICES } from "./voices";
import { getDurationOptions, snapDuration } from "@/lib/video-duration";

type VoiceClone = { voiceId: string; name: string; activated: boolean };

/** 单个分镜在前端的状态。后端只接受 description / dialog / speaker / emotion / suggestedDurationSec */
type SlotStatus = "idle" | "running" | "done" | "failed";
type Scene = {
  rid: string; // 客户端临时 id
  index: number;
  description: string;
  dialog: string;
  speaker?: string;
  emotion?: string;
  suggestedDurationSec: number;
  transitionHint?: string;
  /** 选定的实际视频时长档（秒）。下拉选项随视频模型动态生成，默认贴近 suggested */
  durationSlot: number;
  /** 阶段 2 之后会填的素材 */
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  videoUrl?: string;
  /** 每个槽位独立锁定：首帧 / 尾帧 / 配音 / 视频 */
  firstStatus?: SlotStatus;
  lastStatus?: SlotStatus;
  audioStatus?: SlotStatus;
  videoStatus?: SlotStatus;
};

type Character = {
  name: string;
  description: string;
  /** 角色参考图 URL（公网可访问），主图，作为 Vidu 解说剧 assets.image_uri */
  referenceUrl?: string;
  /** 三视图：正面/侧面/背面，可选；前端只把第一张非空的作为 Vidu 主参考图，其余仅作平台内一致性参考 */
  views?: { front?: string; side?: string; back?: string };
};

/** 场景图 / 道具图 资产 */
type SceneAsset = {
  name: string;
  description?: string;
  referenceUrl?: string;
};
type PropAsset = {
  name: string;
  description?: string;
  referenceUrl?: string;
};

const STYLES = ["真人写实", "2D动画", "3D建模", "动漫", "水墨"] as const;

/**
 * 按 name 合并两组资产：旧的保留（含 referenceUrl/views），新条目追加；同名条目用新数据补全空字段，
 * 不会覆盖用户已经填好的图。
 */
function mergeByName<T extends { name: string }>(prev: T[], next: T[]): T[] {
  const out = prev.slice();
  const idxByName = new Map<string, number>();
  out.forEach((p, i) => {
    if (p.name) idxByName.set(p.name.trim(), i);
  });
  for (const n of next) {
    const k = (n.name || "").trim();
    if (!k) continue;
    if (idxByName.has(k)) {
      const i = idxByName.get(k)!;
      out[i] = { ...n, ...out[i] }; // 旧字段优先（保留已填的）
    } else {
      out.push(n);
      idxByName.set(k, out.length - 1);
    }
  }
  return out;
}

/** 启发式：根据角色名挑一个 Vidu 平台预设音色作默认（不需要复刻就能直接配音） */
function pickDefaultVoiceId(name: string): string {
  const n = (name || "").toLowerCase();
  // 旁白 / 解说默认女声
  if (/旁白|解说|narrator|讲述|画外音/.test(name) || n.includes("narrator")) {
    return "Chinese_Female_Protagonist1";
  }
  // 男性启发：含明显男性称谓的字
  if (/男|父|爹|爸|哥|弟|叔|伯|王|帝|公|叔|师傅|大人|少爷|郎|男友|boy|man|sir|king|father|brother/i.test(name)) {
    return "Chinese_Male_Protagonist";
  }
  // 童声
  if (/小孩|儿童|童|baby|kid|child/.test(n)) {
    return "lovely_girl";
  }
  // 默认女声旁白
  return "Chinese_Female_Protagonist1";
}

export default function ExplainComicClient({
  pipeline: initialPipeline,
  options,
  voiceClones,
}: {
  pipeline: PipelineState;
  options: PipelineOptions;
  voiceClones: VoiceClone[];
}) {
  const [pipeline, setPipeline] = useState<PipelineState>(initialPipeline);

  // LLM 是否可用（用于禁用拆分按钮 + 显示告警）
  const llmAvailable = !!options.llm.find((o) => o.slug === pipeline.effective.llmSlug);

  const [script, setScript] = useState("");
  const [style, setStyle] = useState<string>("2D动画");
  const [targetSceneCount, setTargetSceneCount] = useState<number | "">("");

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [sceneAssets, setSceneAssets] = useState<SceneAsset[]>([]);
  const [propAssets, setPropAssets] = useState<PropAsset[]>([]);
  // 角色名 → 音色 voiceId 的映射（阶段 3 配音用）
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({});

  const [drafting, setDrafting] = useState(false);
  const [extractingAssets, setExtractingAssets] = useState(false);
  const [busy, setBusy] = useState<"none" | "frames" | "av" | "vidu">("none");
  const [topErr, setTopErr] = useState("");
  const [topErrDetail, setTopErrDetail] = useState<string>("");
  const [hint, setHint] = useState("");

  // ====== Vidu 模式 ======
  // 开启后：跳过分镜 / 首尾帧 / 单镜 TTS+视频 流程，直接调用 vidu-explain-comic 生成成片
  const [viduMode, setViduMode] = useState(false);
  const [viduScriptName, setViduScriptName] = useState("我的解说剧");
  type ViduTask = {
    taskId: number;
    externalId?: string;
    status: string;
    progress: number;
    videoUrl?: string;
    coverUrl?: string;
    durationSec?: number;
    errorMessage?: string;
    cost?: number;
    estimatedCost?: number;
  };
  const [viduTask, setViduTask] = useState<ViduTask | null>(null);
  const viduPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const VIDU_RESOLUTION_OPTIONS = ["720p", "1080p"] as const;
  const VIDU_ASPECT_OPTIONS = ["16:9", "9:16", "4:3", "3:4"] as const;
  const [viduResolution, setViduResolution] = useState<(typeof VIDU_RESOLUTION_OPTIONS)[number]>("720p");
  const [viduAspect, setViduAspect] = useState<(typeof VIDU_ASPECT_OPTIONS)[number]>("16:9");
  const [viduLanguage, setViduLanguage] = useState<"zh" | "en">("zh");
  const [viduLipsync, setViduLipsync] = useState(true);

  // 单元锁：rid + slot 维度的"是否正在生成"，避免 setState 异步导致重复点击重复发请求
  const inFlightRef = useRef<Set<string>>(new Set());
  function takeLock(key: string): boolean {
    if (inFlightRef.current.has(key)) return false;
    inFlightRef.current.add(key);
    return true;
  }
  function releaseLock(key: string) {
    inFlightRef.current.delete(key);
  }

  const cpLen = useMemo(() => [...script].length, [script]);
  const scriptOk = cpLen >= 30 && cpLen <= 5000;

  // 给所有"已经填了名字但还没有音色"的角色补一个默认预设音色
  useEffect(() => {
    setVoiceMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const c of characters) {
        const k = (c.name || "").trim();
        if (!k) continue;
        if (next[k]) continue;
        next[k] = pickDefaultVoiceId(k);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [characters]);

  /* ============ 1. 剧本拆分 ============ */
  async function draft() {
    if (!scriptOk) return;
    setDrafting(true);
    setTopErr("");
    setTopErrDetail("");
    setHint("");
    try {
      const res = await fetch("/api/comic/scenes/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          style,
          targetSceneCount: targetSceneCount === "" ? undefined : targetSceneCount,
          characters: characters.length > 0 ? characters : undefined,
        }),
      });
      const data = await res.json();
      console.log("[explain-comic] /api/comic/scenes/draft response:", data);
      if (!res.ok) {
        if (data?.rawSample) {
          setTopErrDetail(String(data.rawSample));
        }
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const rawScenes = Array.isArray(data?.scenes) ? data.scenes : [];
      if (rawScenes.length === 0) {
        setTopErr("LLM 返回了 0 个分镜，请检查剧本是否过短/格式异常，或更换 LLM 模型重试");
        setTopErrDetail(
          typeof data === "object" ? JSON.stringify(data, null, 2).slice(0, 1500) : String(data),
        );
        return;
      }
      const newScenes: Scene[] = rawScenes.map((s: any, i: number) => ({
        rid: uid(),
        index: i + 1,
        description: String(s.description || ""),
        dialog: String(s.dialog || ""),
        speaker: s.speaker || undefined,
        emotion: s.emotion || undefined,
        suggestedDurationSec: Number(s.suggestedDurationSec) || 8,
        transitionHint: s.transitionHint || undefined,
        durationSlot: snapDuration(pipeline.effective.videoSlug, Number(s.suggestedDurationSec) || 8),
      }));
      setScenes(newScenes);
      const newCharacters: Character[] = (data.characters || []).map((c: any) => ({
        name: String(c.name || ""),
        description: String(c.description || ""),
      }));
      setCharacters(newCharacters);
      // 给每个角色按名字启发式自动分配默认音色（仅未手动选过的）
      setVoiceMap((prev) => {
        const next = { ...prev };
        for (const c of newCharacters) {
          const k = (c.name || "").trim();
          if (!k) continue;
          if (next[k]) continue; // 已选过的不动
          next[k] = pickDefaultVoiceId(k);
        }
        return next;
      });
      setHint(`生成 ${newScenes.length} 个分镜，消费 ¥${(data.cost || 0).toFixed(4)}`);
      // 自动滚动到分镜区
      requestAnimationFrame(() => {
        document.getElementById("comic-scenes")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : "拆分失败");
    } finally {
      setDrafting(false);
    }
  }

  /* ============ 分镜增删改 ============ */
  function patchScene(rid: string, p: Partial<Scene>) {
    setScenes((arr) => arr.map((s) => (s.rid === rid ? { ...s, ...p } : s)));
  }
  function addScene(afterRid?: string) {
    const newOne: Scene = {
      rid: uid(),
      index: 0,
      description: "",
      dialog: "",
      suggestedDurationSec: 8,
      durationSlot: snapDuration(pipeline.effective.videoSlug, 8),
    };
    setScenes((arr) => {
      let next: Scene[];
      if (!afterRid) next = [...arr, newOne];
      else {
        const i = arr.findIndex((s) => s.rid === afterRid);
        next = [...arr.slice(0, i + 1), newOne, ...arr.slice(i + 1)];
      }
      return next.map((s, i) => ({ ...s, index: i + 1 }));
    });
  }
  function removeScene(rid: string) {
    setScenes((arr) => arr.filter((s) => s.rid !== rid).map((s, i) => ({ ...s, index: i + 1 })));
  }
  function moveScene(rid: string, dir: -1 | 1) {
    setScenes((arr) => {
      const i = arr.findIndex((s) => s.rid === rid);
      if (i < 0) return arr;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = arr.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((s, k) => ({ ...s, index: k + 1 }));
    });
  }

  /* ============ 阶段 2 · 首/尾帧生成 ============ */
  // imageSlot: "first" | "last"
  async function genSceneFrame(rid: string, slot: "first" | "last") {
    const lockKey = `${rid}::${slot}`;
    if (!takeLock(lockKey)) {
      // 已经有同一槽位在跑，直接忽略本次点击
      console.warn("[explain-comic] gen frame skip duplicate", lockKey);
      return;
    }
    try {
      const cur = scenes.find((s) => s.rid === rid);
      if (!cur) return;
      if (!options.image.find((o) => o.slug === pipeline.effective.imageSlug)) {
        setTopErr(`图像模型 ${pipeline.effective.imageSlug} 不可用，请到顶部图像 chip 选一个可用模型`);
        return;
      }
      const modelSlug = pipeline.effective.imageSlug;
      const modelId = await resolveModelIdBySlug(modelSlug);
      if (!modelId) {
        setTopErr(`找不到图像模型 ${modelSlug} 的 modelId，请联系管理员检查模型表`);
        return;
      }

      // 用画面描述 + 转场提示组合 prompt（尾帧使用 transitionHint 生成转场画面）
      const basePrompt = (cur.description || "").trim();
      const transitionHint = (cur.transitionHint || "").trim();
      const prompt =
        slot === "first"
          ? `${basePrompt}${style ? `\n画风：${style}` : ""}`.trim()
          : `${basePrompt}${transitionHint ? `\n（镜头末尾画面，转场至下一镜：${transitionHint}）` : "（镜头末尾画面，留出明显的转场感）"}${style ? `\n画风：${style}` : ""}`.trim();

      patchScene(rid, slot === "first" ? { firstStatus: "running" } : { lastStatus: "running" });
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, prompt, n: 1 }),
        });
        const text = await res.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const url = data?.images?.[0]?.url;
        if (!url) throw new Error("未拿到图像 URL");
        patchScene(rid, slot === "first"
          ? { firstStatus: "done", firstFrameUrl: url }
          : { lastStatus: "done", lastFrameUrl: url },
        );
      } catch (e) {
        patchScene(rid, slot === "first" ? { firstStatus: "failed" } : { lastStatus: "failed" });
        setTopErr(`分镜 ${cur.index} ${slot === "first" ? "首帧" : "尾帧"}生成失败：${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      releaseLock(lockKey);
    }
  }

  // 缓存 modelSlug → modelId 解析（避免每次分镜都打一遍 /api/admin）
  const modelIdCacheRef = useMemo(() => ({ map: new Map<string, string>() }), []);
  async function resolveModelIdBySlug(slug: string): Promise<string | null> {
    if (modelIdCacheRef.map.has(slug)) return modelIdCacheRef.map.get(slug)!;
    try {
      const res = await fetch(`/api/me/comic-pipeline/resolve-model?slug=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.id) {
          modelIdCacheRef.map.set(slug, data.id);
          return data.id;
        }
      }
    } catch { /* fallthrough */ }
    return null;
  }

  async function genAllFrames() {
    setTopErr("");
    setTopErrDetail("");
    setHint("");
    if (scenes.length === 0) {
      setTopErr("请先点「一键 LLM 拆分」生成分镜表");
      return;
    }
    if (!options.image.find((o) => o.slug === pipeline.effective.imageSlug)) {
      setTopErr(`图像模型 ${pipeline.effective.imageSlug} 不可用，请到顶部图像 chip 选一个可用模型`);
      return;
    }
    setBusy("frames");
    let ok = 0, fail = 0;
    try {
      // 串行，避免一下打爆上游
      for (const s of scenes) {
        console.log("[explain-comic] gen first frame:", s.index);
        try {
          await genSceneFrame(s.rid, "first");
          ok++;
        } catch { fail++; }
        console.log("[explain-comic] gen last frame:", s.index);
        try {
          await genSceneFrame(s.rid, "last");
          ok++;
        } catch { fail++; }
      }
      setHint(`首尾帧生成完成：成功 ${ok} 张，失败 ${fail} 张`);
    } finally {
      setBusy("none");
    }
  }

  /* ============ 阶段 3 · TTS 配音 ============ */
  async function genSceneTts(rid: string): Promise<boolean> {
    const lockKey = `${rid}::audio`;
    if (!takeLock(lockKey)) {
      console.warn("[explain-comic] gen tts skip duplicate", lockKey);
      return false;
    }
    try {
    const cur = scenes.find((s) => s.rid === rid);
    if (!cur) return false;
    if (!cur.dialog || !cur.dialog.trim()) {
      patchScene(rid, { audioStatus: "done", audioUrl: undefined, audioDurationSec: 0 });
      return true; // 没有台词视为完成
    }
    const ttsSlug = pipeline.effective.ttsSlug;
    if (!options.tts.find((o) => o.slug === ttsSlug)) {
      setTopErr(`TTS 模型 ${ttsSlug} 不可用，请到顶部 TTS chip 选一个可用模型`);
      return false;
    }
    const speaker = (cur.speaker || "").trim();
    const voiceId = voiceMap[speaker] || (speaker ? "" : "");
    if (!voiceId) {
      setTopErr(`分镜 ${cur.index} 缺少音色：请在“角色”里给「${speaker || "未指定说话人"}」选一个音色`);
      return false;
    }
    const modelId = await resolveModelIdBySlug(ttsSlug);
    if (!modelId) {
      setTopErr(`找不到 TTS 模型 ${ttsSlug} 的 modelId`);
      return false;
    }

    patchScene(rid, { audioStatus: "running" });
    try {
      const res = await fetch("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          text: cur.dialog,
          voiceId,
          emotion: cur.emotion,
        }),
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const url = data?.fileUrl;
      if (!url) throw new Error("未拿到 TTS 音频 URL");
      patchScene(rid, {
        audioStatus: "done",
        audioUrl: url,
        audioDurationSec: Number(data?.durationSec) || undefined,
      });
      return true;
    } catch (e) {
      patchScene(rid, { audioStatus: "failed" });
      setTopErr(`分镜 ${cur.index} 配音失败：${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    } finally {
      releaseLock(lockKey);
    }
  }

  /* ============ 阶段 3 · 图生视频 ============ */
  async function genSceneVideo(rid: string): Promise<boolean> {
    const lockKey = `${rid}::video`;
    if (!takeLock(lockKey)) {
      console.warn("[explain-comic] gen video skip duplicate", lockKey);
      return false;
    }
    try {
    const cur = scenes.find((s) => s.rid === rid);
    if (!cur) return false;
    const videoSlug = pipeline.effective.videoSlug;
    if (!options.video.find((o) => o.slug === videoSlug)) {
      setTopErr(`视频模型 ${videoSlug} 不可用，请到顶部视频 chip 选一个可用模型`);
      return false;
    }
    if (!cur.firstFrameUrl) {
      setTopErr(`分镜 ${cur.index} 缺少首帧，请先生成首帧再生成视频`);
      return false;
    }
    const modelId = await resolveModelIdBySlug(videoSlug);
    if (!modelId) {
      setTopErr(`找不到视频模型 ${videoSlug} 的 modelId`);
      return false;
    }

    patchScene(rid, { videoStatus: "running" });
    try {
      const params: Record<string, unknown> = {
        image: cur.firstFrameUrl,
        image_url: cur.firstFrameUrl,
        first_frame_image: cur.firstFrameUrl,
        images: [cur.firstFrameUrl],
      };
      if (cur.lastFrameUrl) {
        params.last_frame_image = cur.lastFrameUrl;
      }
      // 不同视频模型 duration 合法集不同（VEO3 固定 8 / Vidu Q3 仅 4|8 / Sora-2 仅 4|8|12 ...）
      // 前端按统一 snapDuration 适配当前模型，避免上游 400。
      const requestedDuration = snapDuration(videoSlug, cur.durationSlot);

      // Vidu 接受 aspect_ratio="auto"，让上游按参考图自适配比例；其他模型仍 16:9
      const aspectRatio = /^vidu/i.test(videoSlug) || /viduq[0-9]/.test(videoSlug) ? "auto" : "16:9";

      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          prompt: cur.description + (cur.transitionHint ? `\n转场：${cur.transitionHint}` : ""),
          duration: requestedDuration,
          aspectRatio,
          params,
        }),
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const url = data?.videoUrl;
      if (!url) throw new Error("未拿到视频 URL");
      patchScene(rid, { videoStatus: "done", videoUrl: url });
      return true;
    } catch (e) {
      patchScene(rid, { videoStatus: "failed" });
      setTopErr(`分镜 ${cur.index} 视频生成失败：${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    } finally {
      releaseLock(lockKey);
    }
  }

  /** 一键生成所有镜头的 TTS + 视频。需要先有首帧。 */
  async function genAllAudioAndVideo() {
    setTopErr("");
    setTopErrDetail("");
    setHint("");
    if (scenes.length === 0) {
      setTopErr("请先点「一键 LLM 拆分」生成分镜表");
      return;
    }
    if (!options.tts.find((o) => o.slug === pipeline.effective.ttsSlug)) {
      setTopErr(`TTS 模型 ${pipeline.effective.ttsSlug} 不可用，请到顶部 TTS chip 选一个可用模型`);
      return;
    }
    if (!options.video.find((o) => o.slug === pipeline.effective.videoSlug)) {
      setTopErr(`视频模型 ${pipeline.effective.videoSlug} 不可用，请到顶部视频 chip 选一个可用模型`);
      return;
    }
    const missingFrame = scenes.find((s) => !s.firstFrameUrl);
    if (missingFrame) {
      setTopErr(`分镜 ${missingFrame.index} 还没有首帧，请先点「一键生成首尾帧」`);
      return;
    }
    const dialogScenes = scenes.filter((s) => s.dialog && s.dialog.trim());
    const missingVoice = dialogScenes.find(
      (s) => s.speaker && !voiceMap[(s.speaker || "").trim()],
    );
    if (missingVoice) {
      setTopErr(
        `分镜 ${missingVoice.index} 的角色「${missingVoice.speaker}」还没有选音色，请到上方角色卡片为该角色选一个音色`,
      );
      return;
    }
    setBusy("av");
    let okAudio = 0, failAudio = 0;
    let okVideo = 0, failVideo = 0;
    try {
      // 串行，避免视频上游同时打爆
      for (const s of scenes) {
        console.log("[explain-comic] gen tts for scene", s.index);
        const tts = await genSceneTts(s.rid);
        if (tts) okAudio++; else failAudio++;
        console.log("[explain-comic] gen video for scene", s.index);
        const vid = await genSceneVideo(s.rid);
        if (vid) okVideo++; else failVideo++;
      }
      setHint(
        `配音：成功 ${okAudio} / 失败 ${failAudio}；视频：成功 ${okVideo} / 失败 ${failVideo}`,
      );
    } finally {
      setBusy("none");
    }
  }

  /* ============ 一键 AI 抽资产（剧本 → 角色/场景/道具 + 图像 prompt） ============ */
  async function extractAssets() {
    setTopErr("");
    setTopErrDetail("");
    setHint("");
    if (!script.trim() || cpLen < 30 || cpLen > 5000) {
      setTopErr("剧本必须 30-5000 字");
      return;
    }
    if (!llmAvailable) {
      setTopErr(`LLM 模型 ${pipeline.effective.llmSlug} 不可用，请到顶部 LLM chip 选一个可用模型`);
      return;
    }
    setExtractingAssets(true);
    try {
      const res = await fetch("/api/comic/assets/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, style: style || undefined }),
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
      if (!res.ok) {
        if (data?.rawSample) setTopErrDetail(String(data.rawSample));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const llmCharacters: Character[] = (data?.characters || []).map((c: any) => ({
        name: String(c.name || ""),
        // 把 imagePrompt 当作描述显示并直接用作生图 prompt；如果没有 imagePrompt 则用 description
        description: String(c.imagePrompt || c.description || ""),
      }));
      const llmScenes: SceneAsset[] = (data?.scenes || []).map((s: any) => ({
        name: String(s.name || ""),
        description: String(s.imagePrompt || s.description || ""),
      }));
      const llmProps: PropAsset[] = (data?.props || []).map((p: any) => ({
        name: String(p.name || ""),
        description: String(p.imagePrompt || p.description || ""),
      }));
      // 合并而不是覆盖：同名优先保留用户已有图/已选音色
      setCharacters((prev) => mergeByName(prev, llmCharacters));
      setSceneAssets((prev) => mergeByName(prev, llmScenes));
      setPropAssets((prev) => mergeByName(prev, llmProps));
      // 自动开启 Vidu 模式所需的资产视图
      setViduMode(true);
      setHint(
        `抽取完成：${llmCharacters.length} 个角色、${llmScenes.length} 个场景、${llmProps.length} 个道具，消费 ¥${(data.cost || 0).toFixed(4)}。可逐项点 ✨AI 生图。`,
      );
    } catch (e) {
      setTopErr(`AI 抽资产失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExtractingAssets(false);
    }
  }

  /* ============ 资产 AI 生图（角色 / 场景 / 道具公用） ============ */
  // 内存级 prompt 锁：同一个 prompt 在跑时不允许并发触发，避免重复出图
  const aiGenLockRef = useRef<Set<string>>(new Set());
  async function generateAssetImage(prompt: string): Promise<string | null> {
    if (!prompt.trim()) {
      setTopErr("请先填写名字 / 描述，再生成");
      return null;
    }
    if (!options.image.find((o) => o.slug === pipeline.effective.imageSlug)) {
      setTopErr(`图像模型 ${pipeline.effective.imageSlug} 不可用，请到顶部图像 chip 选一个可用模型`);
      return null;
    }
    const modelId = await resolveModelIdBySlug(pipeline.effective.imageSlug);
    if (!modelId) {
      setTopErr(`找不到图像模型 ${pipeline.effective.imageSlug} 的 modelId`);
      return null;
    }
    const finalPrompt = `${prompt}${style ? `\n画风：${style}` : ""}`.trim();
    const lockKey = `${pipeline.effective.imageSlug}::${finalPrompt}`;
    if (aiGenLockRef.current.has(lockKey)) {
      console.warn("[explain-comic] AI 生图重复点击已忽略", lockKey);
      return null;
    }
    aiGenLockRef.current.add(lockKey);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, prompt: finalPrompt, n: 1 }),
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
      if (!res.ok) {
        setTopErr(`AI 生图失败：${data?.error || `HTTP ${res.status}`}`);
        return null;
      }
      const url = data?.images?.[0]?.url;
      if (!url) {
        setTopErr("AI 生图未返回图片 URL");
        return null;
      }
      // 把上游临时 URL 转存到 COS，避免一会儿就过期
      try {
        const persistRes = await fetch("/api/me/persist-image-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, dir: `ai-hub/comic-assets` }),
        });
        if (persistRes.ok) {
          const pdata = await persistRes.json().catch(() => null);
          if (pdata?.url) return pdata.url;
        }
      } catch (e) {
        console.warn("[explain-comic] persist 失败，使用原 URL：", e);
      }
      return url;
    } finally {
      aiGenLockRef.current.delete(lockKey);
    }
  }

  /* ============ Vidu 模式 · 一键解说剧 ============ */
  async function startViduTask() {
    setTopErr("");
    setTopErrDetail("");
    setHint("");
    if (!script.trim()) {
      setTopErr("请先填入剧本内容");
      return;
    }
    const scriptCpLen = [...script].length;
    if (scriptCpLen < 50 || scriptCpLen > 2000) {
      setTopErr(`Vidu 解说剧要求剧本 50-2000 字，当前 ${scriptCpLen} 字`);
      return;
    }
    if (!viduScriptName.trim()) {
      setTopErr("请填写剧名（≤ 20 字）");
      return;
    }

    // 解析 vidu-explain-comic 模型
    const modelId = await resolveModelIdBySlug("vidu-explain-comic");
    if (!modelId) {
      setTopErr("找不到 vidu-explain-comic 模型，请联系管理员在「模型管理」里启用");
      return;
    }

    // 资产映射成 Vidu assets：character / scene / tool
    // 文档：assets[i].id 必填、type ∈ character|scene|tool、name ≤ 10 字、单次最多 20 个
    type ViduAsset = {
      id: string;
      type: "character" | "scene" | "tool";
      name: string;
      description?: string;
      image_uri?: string;
      voice_id?: string;
    };
    const list: ViduAsset[] = [];
    let idx = 0;
    const nextId = () => {
      idx += 1;
      return String(idx).padStart(2, "0");
    };
    for (const c of characters.filter((x) => x.name.trim())) {
      const speaker = c.name.trim();
      // 优先 referenceUrl；没有就取三视图里的第一张非空
      const v = c.views || {};
      const image_uri = c.referenceUrl || v.front || v.side || v.back || undefined;
      list.push({
        id: nextId(),
        type: "character",
        name: speaker.slice(0, 10),
        description: c.description?.slice(0, 200) || undefined,
        image_uri,
        voice_id: voiceMap[speaker] || undefined,
      });
    }
    for (const s of sceneAssets.filter((x) => x.name.trim())) {
      list.push({
        id: nextId(),
        type: "scene",
        name: s.name.trim().slice(0, 10),
        description: s.description?.slice(0, 200) || undefined,
        image_uri: s.referenceUrl || undefined,
      });
    }
    for (const p of propAssets.filter((x) => x.name.trim())) {
      list.push({
        id: nextId(),
        type: "tool",
        name: p.name.trim().slice(0, 10),
        description: p.description?.slice(0, 200) || undefined,
        image_uri: p.referenceUrl || undefined,
      });
    }
    if (list.length > 20) {
      setTopErr(`Vidu 单次最多 20 个资产，当前 ${list.length} 个，请精简`);
      return;
    }
    const assets = list;
    const missingAsset = assets.find((a) => !a.image_uri);
    if (missingAsset) {
      setTopErr(`资产「${missingAsset.name}（${missingAsset.type}）」缺少参考图，请先上传`);
      return;
    }

    setBusy("vidu");
    try {
      const res = await fetch("/api/explain-comic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          scriptName: viduScriptName.trim().slice(0, 20),
          scriptContent: script,
          assets,
          resolution: viduResolution,
          aspectRatio: viduAspect,
          style: style ? style.slice(0, 10) : undefined,
          language: viduLanguage,
          enableLipsync: viduLipsync,
        }),
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const t: ViduTask = {
        taskId: Number(data.task_id),
        externalId: data.external_id || undefined,
        status: data.status || "submitted",
        progress: 5,
        estimatedCost: data?.estimated?.cost,
      };
      setViduTask(t);
      setHint(
        `Vidu 任务已创建：预计 ${data?.estimated?.duration_sec || "?"}s，预估 ¥${(data?.estimated?.cost || 0).toFixed(2)}`,
      );
      pollViduTask(t.taskId);
    } catch (e) {
      setTopErr(`Vidu 解说剧任务创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy("none");
    }
  }

  function stopViduPoll() {
    if (viduPollRef.current) {
      clearInterval(viduPollRef.current);
      viduPollRef.current = null;
    }
  }

  function pollViduTask(taskId: number) {
    stopViduPoll();
    const tick = async () => {
      try {
        const res = await fetch(`/api/explain-comic/${taskId}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          console.warn("[vidu] poll failed", data);
          return;
        }
        const status = String(data?.status || "").toLowerCase();
        const next: ViduTask = {
          taskId,
          externalId: data?.external_id || data?.externalId,
          status,
          progress: Number(data?.progress) || 0,
          videoUrl: data?.videoUrl || data?.video_url,
          coverUrl: data?.coverUrl || data?.cover_url,
          durationSec: Number(data?.durationSec || data?.duration_sec) || undefined,
          errorMessage: data?.errorMessage || data?.error,
          cost: Number(data?.cost) || undefined,
        };
        setViduTask(next);
        // 终态停止轮询
        if (
          status === "success" ||
          status === "succeeded" ||
          status === "failed" ||
          status === "cancelled" ||
          next.videoUrl
        ) {
          stopViduPoll();
        }
      } catch (e) {
        console.warn("[vidu] poll error", e);
      }
    };
    // 立即查一次，然后每 5 秒查一次
    tick();
    viduPollRef.current = setInterval(tick, 5000);
  }

  /* ============ Characters ============ */
  function patchCharacter(idx: number, p: Partial<Character>) {
    setCharacters((arr) => arr.map((c, i) => (i === idx ? { ...c, ...p } : c)));
  }
  function addCharacter() {
    setCharacters((arr) => [...arr, { name: "", description: "" }]);
    // 不预设 voiceMap：等用户填了名字后再按 patchCharacter 时下面 useEffect 兜底分配。
  }
  function removeCharacter(idx: number) {
    setCharacters((arr) => arr.filter((_, i) => i !== idx));
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <Header pipeline={pipeline} options={options} onChangePipeline={setPipeline} />

      <Card className="p-6">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-4">
            <div>
              <Label>
                剧本（{cpLen}/5000 字
                {cpLen > 0 && cpLen < 30 && <span className="text-rose-500"> · 至少 30 字</span>}
                {cpLen > 5000 && <span className="text-rose-500"> · 已超 5000 字</span>}
                ）
              </Label>
              <Textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="贴入完整剧本。LLM 会自动拆分为分镜表，识别角色，并给出每镜的画面描述、台词、推荐时长。"
                className="min-h-[280px] text-sm leading-6"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>风格（≤ 30 字）</Label>
              <Input value={style} onChange={(e) => setStyle(e.target.value.slice(0, 30))} />
              <div className="mt-2 flex flex-wrap gap-1">
                {STYLES.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setStyle(s)}
                    className={
                      "text-[11px] px-2 h-6 rounded-full border " +
                      (s === style
                        ? "border-violet-500 text-violet-700 bg-violet-50"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50")
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>期望分镜数（可选）</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={targetSceneCount}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setTargetSceneCount(v === "" ? "" : Math.max(1, Math.min(50, parseInt(v) || 1)));
                }}
                placeholder="留空让 LLM 自决"
              />
              <div className="text-[11px] text-slate-400 mt-1">
                每镜 5~10 秒，参考：60s 视频 ≈ 8~12 个分镜
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={viduMode}
                  onChange={(e) => setViduMode(e.target.checked)}
                />
                <span className="font-medium">Vidu 一键解说剧</span>
                <span className="text-[11px] text-slate-400">关：分镜 + 单镜生成；开：直接走 vidu-explain-comic 出成片</span>
              </label>
              {viduMode && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="!text-xs !mb-1">剧名（≤ 20 字）</Label>
                    <Input
                      value={viduScriptName}
                      onChange={(e) => setViduScriptName(e.target.value.slice(0, 20))}
                      className="!h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="!text-xs !mb-1">语言</Label>
                    <Select
                      value={viduLanguage}
                      onChange={(e) => setViduLanguage(e.target.value as "zh" | "en")}
                      className="!h-8 text-sm"
                    >
                      <option value="zh">中文</option>
                      <option value="en">英文</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="!text-xs !mb-1">分辨率</Label>
                    <Select
                      value={viduResolution}
                      onChange={(e) => setViduResolution(e.target.value as (typeof VIDU_RESOLUTION_OPTIONS)[number])}
                      className="!h-8 text-sm"
                    >
                      {VIDU_RESOLUTION_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label className="!text-xs !mb-1">画面比例</Label>
                    <Select
                      value={viduAspect}
                      onChange={(e) => setViduAspect(e.target.value as (typeof VIDU_ASPECT_OPTIONS)[number])}
                      className="!h-8 text-sm"
                    >
                      {VIDU_ASPECT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </div>
                  <label className="col-span-2 inline-flex items-center gap-1 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={viduLipsync}
                      onChange={(e) => setViduLipsync(e.target.checked)}
                    />
                    开启唇形同步（lipsync）
                  </label>
                  <div className="col-span-2 text-[11px] text-slate-500">
                    Vidu 模式下：剧本 50-2000 字；每个角色需在下方「角色」卡片填名 + 上传参考图（推荐再绑音色）。
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              onClick={extractAssets}
              disabled={!scriptOk || extractingAssets || !llmAvailable}
              loading={extractingAssets}
              className="w-full"
            >
              <Sparkles className="w-4 h-4" />
              AI 抽资产清单（角色 + 场景 + 道具）
            </Button>

            {viduMode ? (
              <Button
                onClick={startViduTask}
                disabled={busy === "vidu" || cpLen < 50 || cpLen > 2000 || !viduScriptName.trim()}
                loading={busy === "vidu"}
                className="w-full"
                size="lg"
              >
                <Film className="w-4 h-4" />
                一键 Vidu 解说剧
              </Button>
            ) : (
              <Button
                onClick={draft}
                disabled={!scriptOk || drafting || !llmAvailable}
                loading={drafting}
                className="w-full"
                size="lg"
              >
                <Wand2 className="w-4 h-4" />
                一键 LLM 拆分
              </Button>
            )}
            {!llmAvailable && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                LLM 模型 <code>{pipeline.effective.llmSlug}</code> 不可用，请点顶部 LLM chip 选一个可用的 chat 模型。
              </div>
            )}
            {topErr && (
              <div className="space-y-2">
                <div className="text-xs text-rose-600 inline-flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> <span>{topErr}</span>
                </div>
                {topErrDetail && (
                  <details className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-md">
                    <summary className="px-2 py-1.5 cursor-pointer hover:text-slate-700">
                      展开 LLM 原始返回（用于诊断）
                    </summary>
                    <pre className="px-2 pb-2 whitespace-pre-wrap break-words max-h-[280px] overflow-auto font-mono text-[11px] leading-5">
                      {topErrDetail}
                    </pre>
                  </details>
                )}
              </div>
            )}
            {hint && (
              <div className="text-xs text-emerald-700 inline-flex items-start gap-1">
                <Sparkles className="w-3 h-3 mt-0.5 shrink-0" /> <span>{hint}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {viduTask && (
        <ViduTaskCard
          task={viduTask}
          onRefresh={() => pollViduTask(viduTask.taskId)}
          onClear={() => { stopViduPoll(); setViduTask(null); }}
        />
      )}

      {viduMode && (
        <>
          <CharactersPanel
            value={characters}
            onChange={setCharacters}
            onPatch={patchCharacter}
            onAdd={addCharacter}
            onRemove={removeCharacter}
            voiceClones={voiceClones}
            voiceMap={voiceMap}
            onVoiceChange={(name, voiceId) =>
              setVoiceMap((m) => {
                const next = { ...m };
                if (voiceId) next[name] = voiceId;
                else delete next[name];
                return next;
              })
            }
            onGenerateImage={generateAssetImage}
          />
          <SimpleAssetPanel
            title="场景图"
            kind="scene"
            value={sceneAssets}
            onChange={setSceneAssets}
            onGenerateImage={generateAssetImage}
          />
          <SimpleAssetPanel
            title="道具图"
            kind="prop"
            value={propAssets}
            onChange={setPropAssets}
            onGenerateImage={generateAssetImage}
          />
        </>
      )}

      {!viduMode && (scenes.length > 0 || characters.length > 0) && (
        <CharactersPanel
          value={characters}
          onChange={setCharacters}
          onPatch={patchCharacter}
          onAdd={addCharacter}
          onRemove={removeCharacter}
          voiceClones={voiceClones}
          voiceMap={voiceMap}
          onVoiceChange={(name, voiceId) =>
            setVoiceMap((m) => {
              const next = { ...m };
              if (voiceId) next[name] = voiceId;
              else delete next[name];
              return next;
            })
          }
          onGenerateImage={generateAssetImage}
        />
      )}

      {scenes.length > 0 && (
        <div id="comic-scenes" className="space-y-3 scroll-mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold inline-flex items-center gap-2">
              <Film className="w-5 h-5 text-violet-500" />
              分镜表（{scenes.length}）
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => addScene()} disabled={busy !== "none"}>
                <Plus className="w-3 h-3" /> 末尾加一镜
              </Button>
              <Button
                size="sm"
                onClick={genAllFrames}
                loading={busy === "frames"}
                disabled={busy !== "none"}
                title="按当前图像模型，为每镜生成首帧 + 尾帧"
              >
                <Sparkles className="w-3 h-3" /> 一键生成首尾帧
              </Button>
              <Button
                size="sm"
                onClick={genAllAudioAndVideo}
                loading={busy === "av"}
                disabled={busy !== "none"}
                title="按每镜的台词调 TTS、首帧调图生视频"
              >
                <Film className="w-3 h-3" /> 一键 TTS + 视频
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled
                title="阶段 4 开放"
                className="opacity-60 cursor-not-allowed"
              >
                <Download className="w-3 h-3" /> 导出 ZIP（待开放）
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {scenes.map((s, i) => (
              <SceneRow
                key={s.rid}
                scene={s}
                isFirst={i === 0}
                isLast={i === scenes.length - 1}
                durationOptions={getDurationOptions(pipeline.effective.videoSlug)}
                onPatch={(p) => patchScene(s.rid, p)}
                onRemove={() => removeScene(s.rid)}
                onMove={(d) => moveScene(s.rid, d)}
                onAddBelow={() => addScene(s.rid)}
                onGenFrame={(slot) => genSceneFrame(s.rid, slot)}
                onGenAudio={() => genSceneTts(s.rid)}
                onGenVideo={() => genSceneVideo(s.rid)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =================== 头部 · 管线展示 + 切换 =================== */
function Header({
  pipeline, options, onChangePipeline,
}: {
  pipeline: PipelineState;
  options: PipelineOptions;
  onChangePipeline: (next: PipelineState) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold inline-flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-violet-500" />
            解说漫剧 · 导演台
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            剧本 → LLM 拆分分镜 → 每镜首尾帧 → 台词配音 → 视频片段 → 导出素材包自由剪辑
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dashboard/voices"
            className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 px-2 h-7 rounded-md border border-violet-200 hover:bg-violet-50"
          >
            <Mic2 className="w-3 h-3" />
            管理音色
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-[11px] text-slate-400 mb-1.5 inline-flex items-center gap-1">
          <Wand2 className="w-3 h-3" />
          点击下方任一胶囊可切换该步骤使用的模型（仅对你自己生效，不影响别人）
        </div>
        <PipelineSelector
          pipeline={pipeline}
          options={options}
          onChange={onChangePipeline}
        />
      </div>
    </div>
  );
}

/* =================== Characters 卡片 =================== */
function CharactersPanel({
  value, onPatch, onAdd, onRemove, voiceClones, voiceMap, onVoiceChange, onGenerateImage,
}: {
  value: Character[];
  onChange: (next: Character[]) => void;
  onPatch: (idx: number, p: Partial<Character>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  voiceClones: VoiceClone[];
  voiceMap: Record<string, string>;
  onVoiceChange: (name: string, voiceId: string) => void;
  /** AI 生成参考图：传入完整 prompt，返回图片 URL（失败返回 null） */
  onGenerateImage?: (prompt: string) => Promise<string | null>;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">角色（{value.length}）</h2>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="w-3 h-3" /> 加角色
        </Button>
      </div>
      {voiceClones.length > 0 && (
        <div className="text-[11px] text-violet-700 bg-violet-50 border border-violet-100 rounded-md px-2 py-1 mb-3">
          检测到你有 {voiceClones.length} 个复刻音色，阶段 3 配音时会出现在角色音色下拉里。
        </div>
      )}
      {value.length === 0 ? (
        <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center">
          通常由 LLM 自动识别，也可手动添加。
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {value.map((c, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3 bg-white">
              <div className="flex items-start gap-2">
                <Input
                  value={c.name}
                  onChange={(e) => onPatch(i, { name: e.target.value.slice(0, 20) })}
                  placeholder="角色名（如 林枫 / 旁白）"
                  className="!h-8 text-sm"
                />
                <button
                  onClick={() => onRemove(i)}
                  className="shrink-0 w-8 h-8 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Textarea
                value={c.description}
                onChange={(e) => onPatch(i, { description: e.target.value })}
                placeholder="外貌 / 性格 / 着装等细节，越详细一致性越高"
                className="mt-2 min-h-[60px] text-sm"
              />
              <div className="mt-2 space-y-1">
                <Label className="!text-xs !mb-1">主参考图（用于 Vidu 解说剧 image_uri）</Label>
                <ImageUrlInput
                  value={c.referenceUrl || ""}
                  onChange={(url) => onPatch(i, { referenceUrl: url })}
                  onGenerate={onGenerateImage}
                  generatePrompt={[`角色：${c.name || "未命名角色"}`, c.description || ""].filter(Boolean).join("\n")}
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["front", "side", "back"] as const).map((slot) => {
                  const slotLabel = slot === "front" ? "正面" : slot === "side" ? "侧面" : "背面";
                  return (
                    <div key={slot}>
                      <Label className="!text-xs !mb-1">{slotLabel}</Label>
                      <ImageUrlInput
                        compact
                        value={(c.views || {})[slot] || ""}
                        onChange={(url) =>
                          onPatch(i, {
                            views: { ...(c.views || {}), [slot]: url },
                          })
                        }
                        onGenerate={onGenerateImage}
                        generatePrompt={[
                          `角色三视图 · ${slotLabel}：${c.name || "未命名角色"}`,
                          c.description || "",
                        ].filter(Boolean).join("\n")}
                      />
                    </div>
                  );
                })}
              </div>
              <VoicePicker
                characterName={c.name}
                value={voiceMap[c.name] || ""}
                onChange={(voiceId) => onVoiceChange(c.name, voiceId)}
                voiceClones={voiceClones}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* =================== 角色音色选择器（含试听） =================== */
function VoicePicker({
  characterName, value, onChange, voiceClones,
}: {
  characterName: string;
  value: string;
  onChange: (voiceId: string) => void;
  voiceClones: VoiceClone[];
}) {
  const sample = useMemo(() => {
    const hit = PRESET_VOICES.find((v) => v.id === value);
    return hit?.sample || "";
  }, [value]);

  // 把预设音色按 group 聚合，避免一次性渲染上百个 option
  const presetByGroup = useMemo(() => {
    const map = new Map<string, typeof PRESET_VOICES>();
    for (const v of PRESET_VOICES) {
      const g = v.group || "其他";
      if (!map.has(g)) map.set(g, [] as unknown as typeof PRESET_VOICES);
      (map.get(g) as ViduOption[]).push(v as unknown as ViduOption);
    }
    return Array.from(map.entries());
  }, []);

  const playSample = () => {
    if (!sample) return;
    try {
      const a = new Audio(sample);
      a.play().catch(() => {/* 用户没交互过会被浏览器拦掉，忽略 */});
    } catch { /* ignore */ }
  };

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2">
        <Label className="!text-xs !mb-0 shrink-0">音色</Label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm flex-1 rounded-md border border-slate-300 bg-white px-2"
        >
          <option value="">未选择（无法配音）</option>
          {voiceClones.length > 0 && (
            <optgroup label="我的复刻音色">
              {voiceClones.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.name}{v.activated ? "" : "（未激活）"}
                </option>
              ))}
            </optgroup>
          )}
          {presetByGroup.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={playSample}
          disabled={!sample}
          title={sample ? "试听" : "该音色没有试听样本"}
          className="shrink-0 w-8 h-8 rounded-md border border-slate-300 bg-white text-slate-500 hover:text-violet-700 hover:border-violet-400 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      </div>
      {voiceClones.length === 0 && !value && (
        <div className="text-[11px] text-slate-400">
          已默认按角色名挑选了一个 Vidu 平台预设音色，可在下拉里换其它，或去 <a href="/dashboard/voices" className="text-violet-600 hover:underline">音色管理</a> 复刻自己的。
        </div>
      )}
    </div>
  );
}

type ViduOption = { id: string; label: string; group?: string; sample?: string };

/* =================== 通用图片输入（URL + 上传 + AI 生成） =================== */
function ImageUrlInput({
  value, onChange, compact = false, onGenerate, generatePrompt,
}: {
  value: string;
  onChange: (url: string) => void;
  /** 紧凑模式：用于三视图等小格子 */
  compact?: boolean;
  /** AI 生成回调，传 prompt 进去；不传则隐藏「AI 生成」按钮 */
  onGenerate?: (prompt: string) => Promise<string | null>;
  /** 默认 prompt（角色名/描述拼好的） */
  generatePrompt?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");

  async function aiGenerate() {
    if (!onGenerate) return;
    const prompt = (generatePrompt || "").trim();
    if (!prompt) {
      setErr("先填名字或描述再 AI 生成");
      return;
    }
    setErr("");
    setGenerating(true);
    try {
      const url = await onGenerate(prompt);
      if (url) onChange(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI 生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function uploadAndFill(file: File) {
    setErr("");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr("文件过大（>10MB）");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.absoluteUrl) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      if (data.isLocalhost) {
        setErr("已上传，但 URL 是本机地址，Vidu 拉不到，请配置 COS 或 PUBLIC_BASE_URL");
        return;
      }
      onChange(data.absoluteUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  if (compact) {
    // 紧凑模式：上方上传按钮（占满宽度），下方 URL 输入很小，预览正方形
    return (
      <div className="space-y-1">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadAndFill(f);
            e.target.value = "";
          }}
        />
        {value && /^https?:\/\//i.test(value) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="参考图"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onClick={() => fileRef.current?.click()}
            onError={(e) => {
              // 加载失败时把图片隐藏，提示用户重新生成
              (e.currentTarget as HTMLImageElement).style.display = "none";
              setErr("图片加载失败，可能链接已过期，请重新生成或上传");
            }}
            className="aspect-square w-full rounded-md border border-slate-200 object-cover bg-black cursor-pointer"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || generating}
            className="aspect-square w-full rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-400 text-[11px] flex flex-col items-center justify-center gap-1 hover:border-violet-400 hover:text-violet-600 disabled:opacity-60"
          >
            {uploading || generating ? <Spinner /> : <ImageIcon className="w-3.5 h-3.5" />}
            {uploading ? "上传中" : generating ? "生成中" : "点击上传"}
          </button>
        )}
        <div className="flex items-center gap-1">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
            className="!h-7 text-[11px]"
          />
          {onGenerate && (
            <Button
              variant="outline"
              size="sm"
              onClick={aiGenerate}
              loading={generating}
              disabled={generating || uploading}
              className="!h-7 !px-1.5 text-[10px] shrink-0"
              title="按当前图像模型 + 风格 自动生成"
            >
              <Sparkles className="w-3 h-3" /> AI
            </Button>
          )}
        </div>
        {err && <div className="text-[11px] text-rose-600">{err}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="!h-8 text-sm flex-1"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadAndFill(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          loading={uploading}
          disabled={uploading || generating}
          className="!h-8 !px-2 text-[11px] shrink-0"
        >
          <ImageIcon className="w-3 h-3" /> 上传
        </Button>
        {onGenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={aiGenerate}
            loading={generating}
            disabled={uploading || generating}
            className="!h-8 !px-2 text-[11px] shrink-0"
            title="按当前图像模型 + 风格 自动生成"
          >
            <Sparkles className="w-3 h-3" /> AI 生成
          </Button>
        )}
      </div>
      {value && /^https?:\/\//i.test(value) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="参考图"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            setErr("图片加载失败，可能链接已过期，请重新生成或上传");
          }}
          className="h-20 rounded-md border border-slate-200 object-cover bg-black"
        />
      )}
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
    </div>
  );
}

/* =================== 场景 / 道具 资产面板（Vidu 模式专用） =================== */
function SimpleAssetPanel({
  title, kind, value, onChange, onGenerateImage,
}: {
  title: string;
  kind: "scene" | "prop";
  value: { name: string; description?: string; referenceUrl?: string }[];
  onChange: (next: { name: string; description?: string; referenceUrl?: string }[]) => void;
  onGenerateImage?: (prompt: string) => Promise<string | null>;
}) {
  function patch(idx: number, p: Partial<{ name: string; description?: string; referenceUrl?: string }>) {
    onChange(value.map((v, i) => (i === idx ? { ...v, ...p } : v)));
  }
  function add() {
    onChange([...value, { name: "", description: "", referenceUrl: "" }]);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  const placeholder =
    kind === "scene"
      ? "如：古风客栈 / 雪山之巅 / 教室"
      : "如：青锋剑 / 红宝石项链 / 飞剑";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}（{value.length}）</h2>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="w-3 h-3" /> 加{kind === "scene" ? "场景" : "道具"}
        </Button>
      </div>
      {value.length === 0 ? (
        <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg px-4 py-6 text-center">
          可选项。Vidu 解说剧支持 character / scene / tool 三种资产，提交时统一打包给上游。
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {value.map((c, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3 bg-white">
              <div className="flex items-start gap-2">
                <Input
                  value={c.name}
                  onChange={(e) => patch(i, { name: e.target.value.slice(0, 10) })}
                  placeholder={`名称（≤10字，${kind === "scene" ? "场景" : "道具"}）`}
                  className="!h-8 text-sm"
                />
                <button
                  onClick={() => remove(i)}
                  className="shrink-0 w-8 h-8 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Textarea
                value={c.description || ""}
                onChange={(e) => patch(i, { description: e.target.value })}
                placeholder={placeholder + "（描述风格 / 时代 / 特征等）"}
                className="mt-2 min-h-[50px] text-sm"
              />
              <div className="mt-2 space-y-1">
                <Label className="!text-xs !mb-1">参考图（用于 Vidu image_uri）</Label>
                <ImageUrlInput
                  value={c.referenceUrl || ""}
                  onChange={(url) => patch(i, { referenceUrl: url })}
                  onGenerate={onGenerateImage}
                  generatePrompt={[
                    `${kind === "scene" ? "场景图" : "道具图"}：${c.name || (kind === "scene" ? "场景" : "道具")}`,
                    c.description || "",
                  ].filter(Boolean).join("\n")}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* =================== Vidu 解说剧任务面板 =================== */
function ViduTaskCard({
  task, onRefresh, onClear,
}: {
  task: {
    taskId: number;
    externalId?: string;
    status: string;
    progress: number;
    videoUrl?: string;
    coverUrl?: string;
    durationSec?: number;
    errorMessage?: string;
    cost?: number;
    estimatedCost?: number;
  };
  onRefresh: () => void;
  onClear: () => void;
}) {
  const status = (task.status || "").toLowerCase();
  const isFinal =
    status === "success" || status === "succeeded" || status === "failed" || status === "cancelled" || Boolean(task.videoUrl);
  return (
    <Card className="p-4 space-y-3 border-violet-200">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold inline-flex items-center gap-2">
          <Film className="w-4 h-4 text-violet-500" /> Vidu 解说剧任务 #{task.taskId}
        </div>
        <div className="flex items-center gap-2">
          <Badge color={isFinal ? (status === "failed" ? "rose" : "green") : "amber"}>
            {task.status || "submitted"}
          </Badge>
          <Button size="sm" variant="outline" onClick={onRefresh} className="!h-7 !px-2 text-[11px]">
            <RefreshCcw className="w-3 h-3" /> 刷新
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} className="!h-7 !px-2 text-[11px] text-slate-400">
            清除
          </Button>
        </div>
      </div>
      <div className="text-xs text-slate-500 flex flex-wrap gap-4">
        <span>进度：{Math.max(0, Math.min(100, Number(task.progress) || 0))}%</span>
        {task.durationSec && <span>时长：{task.durationSec}s</span>}
        {typeof task.cost === "number" && <span>实结：¥ {task.cost.toFixed(2)}</span>}
        {typeof task.estimatedCost === "number" && !task.cost && (
          <span>预估：¥ {task.estimatedCost.toFixed(2)}</span>
        )}
        {task.externalId && <span className="font-mono text-[11px]">ext={task.externalId}</span>}
      </div>
      <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
        <div
          className="h-1.5 bg-gradient-to-r from-violet-500 to-pink-500 transition-all"
          style={{ width: `${Math.max(0, Math.min(100, Number(task.progress) || 0))}%` }}
        />
      </div>
      {task.errorMessage && (
        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2 py-1.5">
          失败：{task.errorMessage}
        </div>
      )}
      {task.videoUrl ? (
        <video
          src={task.videoUrl}
          poster={task.coverUrl || undefined}
          controls
          className="w-full max-h-[420px] rounded-md bg-black"
        />
      ) : (
        <div className="aspect-video rounded-md bg-slate-100 flex items-center justify-center text-slate-400 text-xs gap-2">
          <Spinner /> Vidu 正在出片，可保持页面或稍后回来查看
        </div>
      )}
    </Card>
  );
}

/* =================== 单个分镜行 =================== */
function SceneRow({
  scene, isFirst, isLast, durationOptions, onPatch, onRemove, onMove, onAddBelow, onGenFrame, onGenAudio, onGenVideo,
}: {
  scene: Scene;
  isFirst: boolean;
  isLast: boolean;
  durationOptions: number[];
  onPatch: (p: Partial<Scene>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onAddBelow: () => void;
  onGenFrame: (slot: "first" | "last") => void;
  onGenAudio: () => void;
  onGenVideo: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {/* 序号 + 排序按钮 */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <Badge color="violet" className="text-base font-mono w-9 h-7 inline-flex items-center justify-center">
            {String(scene.index).padStart(2, "0")}
          </Badge>
          <button
            disabled={isFirst}
            onClick={() => onMove(-1)}
            className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent inline-flex items-center justify-center"
            title="上移"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={isLast}
            onClick={() => onMove(1)}
            className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent inline-flex items-center justify-center"
            title="下移"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="w-7 h-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="!text-xs !mb-1">画面描述</Label>
              <Textarea
                value={scene.description}
                onChange={(e) => onPatch({ description: e.target.value })}
                placeholder="详细的视觉描述，用于送图像 / 视频模型"
                className="min-h-[80px] text-sm"
              />
            </div>
            <div>
              <Label className="!text-xs !mb-1">
                台词
                {scene.speaker && (
                  <span className="ml-2 text-[11px] text-slate-400">说话人：{scene.speaker}</span>
                )}
              </Label>
              <Textarea
                value={scene.dialog}
                onChange={(e) => onPatch({ dialog: e.target.value })}
                placeholder="留空表示纯画面无对白"
                className="min-h-[80px] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <Label className="!text-xs !mb-1">说话人</Label>
              <Input
                value={scene.speaker || ""}
                onChange={(e) => onPatch({ speaker: e.target.value || undefined })}
                placeholder="角色名"
                className="!h-8 text-sm"
              />
            </div>
            <div>
              <Label className="!text-xs !mb-1">情绪</Label>
              <Select
                value={scene.emotion || ""}
                onChange={(e) => onPatch({ emotion: e.target.value || undefined })}
                className="!h-8 text-sm"
              >
                <option value="">自动</option>
                <option value="happy">happy 高兴</option>
                <option value="sad">sad 悲伤</option>
                <option value="angry">angry 愤怒</option>
                <option value="fearful">fearful 害怕</option>
                <option value="disgusted">disgusted 厌恶</option>
                <option value="surprised">surprised 惊讶</option>
                <option value="calm">calm 中性</option>
              </Select>
            </div>
            <div>
              <Label className="!text-xs !mb-1">视频时长档</Label>
              <Select
                value={scene.durationSlot}
                onChange={(e) => onPatch({ durationSlot: parseInt(e.target.value) || 8 })}
                className="!h-8 text-sm"
              >
                {durationOptions.map((s) => (
                  <option key={s} value={s}>{s} 秒</option>
                ))}
              </Select>
              {scene.suggestedDurationSec !== scene.durationSlot && (
                <div className="text-[10px] text-slate-400 mt-0.5">建议 {scene.suggestedDurationSec}s</div>
              )}
            </div>
            <div>
              <Label className="!text-xs !mb-1">转场</Label>
              <Input
                value={scene.transitionHint || ""}
                onChange={(e) => onPatch({ transitionHint: e.target.value || undefined })}
                placeholder="尾帧画面提示"
                className="!h-8 text-sm"
              />
            </div>
          </div>

          {/* 阶段 2-3 素材槽位 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
            <SlotPlaceholder
              icon={ImageIcon}
              label="首帧"
              status={scene.firstStatus}
              previewUrl={scene.firstFrameUrl}
              hint="点击生成首帧"
              onAction={() => onGenFrame("first")}
            />
            <SlotPlaceholder
              icon={ImageIcon}
              label="尾帧"
              status={scene.lastStatus}
              previewUrl={scene.lastFrameUrl}
              hint="点击生成尾帧（按转场提示）"
              onAction={() => onGenFrame("last")}
            />
            <SlotPlaceholder
              icon={AudioLines}
              label={`台词配音${scene.dialog ? "" : "（无台词）"}`}
              status={scene.audioStatus}
              previewUrl={scene.audioUrl}
              hint={scene.dialog ? "点击调用 TTS 生成台词配音" : "本镜无台词，无需配音"}
              onAction={scene.dialog ? onGenAudio : undefined}
              kind="audio"
            />
            <SlotPlaceholder
              icon={Film}
              label={`视频片段（${scene.durationSlot}s）`}
              status={scene.videoStatus}
              previewUrl={scene.videoUrl}
              hint="使用首帧调图生视频"
              onAction={onGenVideo}
              kind="video"
            />
          </div>

          <div className="flex items-center justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={onAddBelow} className="!h-7 !px-2 text-xs text-slate-400 hover:text-slate-700">
              <Plus className="w-3 h-3" /> 在下方插入
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SlotPlaceholder({
  icon: Icon, label, status, previewUrl, hint, kind = "image", onAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  status?: "idle" | "running" | "done" | "failed";
  previewUrl?: string;
  hint: string;
  kind?: "image" | "audio" | "video";
  onAction?: () => void;
}) {
  const empty = !previewUrl;
  const running = status === "running";
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-2 flex flex-col">
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
        <span className="inline-flex items-center gap-1">
          <Icon className="w-3 h-3" /> {label}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!onAction || running}
          onClick={onAction}
          className={
            "!h-6 !px-1.5 text-[10px] " +
            (!onAction ? "opacity-60 cursor-not-allowed" : "")
          }
          title={hint}
        >
          {running ? <Spinner /> : <RefreshCcw className="w-2.5 h-2.5" />}
          {running ? "生成中" : empty ? "生成" : "重生成"}
        </Button>
      </div>
      {status === "running" ? (
        <div className="aspect-video rounded-md bg-slate-100 flex items-center justify-center text-slate-400 text-xs gap-1">
          <Spinner /> 生成中
        </div>
      ) : empty ? (
        <div className="aspect-video rounded-md bg-slate-100/60 flex items-center justify-center text-[11px] text-slate-400 italic">
          {hint}
        </div>
      ) : kind === "audio" ? (
        <audio src={previewUrl} controls className="w-full h-9" preload="none" />
      ) : kind === "video" ? (
        <video src={previewUrl} controls className="aspect-video rounded-md bg-black w-full" preload="metadata" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={label} className="aspect-video rounded-md object-cover bg-black" />
      )}
    </div>
  );
}
