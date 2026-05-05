"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  Send,
  Square,
  Trash2,
  Copy,
  Check,
  Sparkles,
  User,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  { title: "解释一个概念", prompt: "用通俗的比喻解释一下什么是 Transformer 架构。" },
  { title: "写代码", prompt: "用 Python 写一个带有详细注释的快速排序，并给出复杂度分析。" },
  { title: "润色文案", prompt: "帮我把下面这段产品介绍改得更吸引人：\n\n" },
  { title: "头脑风暴", prompt: "给一个做 AI 办公助理的创业项目起 5 个有记忆点的中英文名字，并各写一句 slogan。" },
];

const DEFAULT_SYSTEM =
  "你是一个严谨、体贴、有幽默感的中文助手。回答需要结构清晰，必要时使用 Markdown（标题、列表、代码块、表格等）。代码一律放在 ```language 代码块中。";

export default function XingyeClient({
  model,
  configured,
}: {
  model: string;
  configured: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [showSettings, setShowSettings] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // 自适应输入框高度
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [input]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (!text || loading) return;

      const userMsg: Msg = { role: "user", content: text };
      const history = [...messages, userMsg];
      setMessages([...history, { role: "assistant", content: "" }]);
      setInput("");
      setLoading(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/xingye/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            system,
            temperature,
            messages: history,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: "请求失败" }));
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              content: `⚠️ **请求失败**\n\n\`\`\`\n${err.error || "未知错误"}${
                err.detail ? "\n\n" + err.detail : ""
              }\n\`\`\``,
            };
            return next;
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: acc };
            return next;
          });
        }
      } catch (err: unknown) {
        const aborted =
          err instanceof DOMException && err.name === "AbortError";
        if (!aborted) {
          const msg = err instanceof Error ? err.message : String(err);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && !last.content) {
              next[next.length - 1] = {
                role: "assistant",
                content: `⚠️ 连接中断：${msg}`,
              };
            }
            return next;
          });
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [input, loading, messages, model, system, temperature],
  );

  const regenerate = useCallback(async () => {
    if (loading) return;
    // 找到最后一条 user 消息，删掉其之后的所有消息并重发
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx < 0) return;
    const realIdx = messages.length - 1 - lastUserIdx;
    const history = messages.slice(0, realIdx);
    const prompt = messages[realIdx].content;
    setMessages(history);
    await send(prompt);
  }, [loading, messages, send]);

  const clear = () => {
    if (loading) stop();
    setMessages([]);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0b0b14] text-slate-100">
      {/* 背景装饰：渐变光晕 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[32rem] w-[32rem] rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/3 h-[28rem] w-[28rem] rounded-full bg-sky-500/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative flex min-h-screen flex-col">
        {/* 顶部栏 */}
        <header className="flex items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-purple-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-base font-semibold leading-tight">星爷ai · 对话</div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>模型</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-slate-200">
                  {model}
                </span>
                {!configured && (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-amber-300">
                    未配置 API Key
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">参数</span>
            </button>
            <button
              onClick={clear}
              disabled={isEmpty && !loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">清空</span>
            </button>
          </div>
        </header>

        {/* 参数面板 */}
        {showSettings && (
          <div className="mx-4 mb-4 sm:mx-8">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">对话参数</div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_200px]">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    System Prompt（角色设定，新一轮对话生效）
                  </label>
                  <textarea
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400/60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    Temperature: {temperature.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>严谨</span>
                    <span>发散</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 对话区 */}
        <main className="flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto px-4 pb-8 sm:px-8"
          >
            <div className="mx-auto max-w-3xl">
              {isEmpty ? (
                <Empty onPick={(p) => send(p)} />
              ) : (
                <div className="space-y-6 py-6">
                  {messages.map((m, i) => (
                    <MessageBubble
                      key={i}
                      msg={m}
                      streaming={loading && i === messages.length - 1 && m.role === "assistant"}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* 输入区 */}
        <footer className="border-t border-white/5 bg-black/30 px-4 py-4 backdrop-blur-xl sm:px-8">
          <div className="mx-auto max-w-3xl">
            {messages.length > 0 && !loading && (
              <div className="mb-2 flex items-center justify-center">
                <button
                  onClick={regenerate}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
                >
                  <RotateCcw className="h-3 w-3" />
                  重新生成
                </button>
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-inner shadow-black/40 focus-within:border-indigo-400/60">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="发消息给 星爷ai…（Enter 发送 / Shift+Enter 换行）"
                className="max-h-[220px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-slate-100 placeholder:text-slate-500 outline-none"
              />
              {loading ? (
                <button
                  onClick={stop}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-slate-100 transition hover:bg-white/20"
                  title="停止生成"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  title="发送"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-2 text-center text-[11px] text-slate-500">
              内容由 AI 生成，请谨慎甄别。
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* -------------------- 子组件 -------------------- */

function Empty({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-xl shadow-purple-500/40">
        <Sparkles className="h-8 w-8 text-white" />
      </div>
      <h1 className="bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
        你好，我是 星爷ai
      </h1>
      <p className="mt-3 max-w-md text-sm text-slate-400">
        由 GPT-5.4 驱动，擅长写代码、写文案、解释概念、头脑风暴。支持流式输出与 Markdown 渲染。
      </p>
      <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="group rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-indigo-400/40 hover:bg-white/10"
          >
            <div className="mb-1 text-sm font-medium text-slate-100">{s.title}</div>
            <div className="line-clamp-2 text-xs text-slate-400 group-hover:text-slate-300">
              {s.prompt}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  streaming,
}: {
  msg: Msg;
  streaming: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-md " +
          (isUser
            ? "bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-indigo-500/30"
            : "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-purple-500/30")
        }
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={
            "group relative rounded-2xl px-4 py-3 text-[15px] leading-7 shadow-lg " +
            (isUser
              ? "bg-gradient-to-br from-indigo-500/90 to-purple-600/90 text-white shadow-indigo-900/30"
              : "border border-white/10 bg-white/[0.04] text-slate-100 shadow-black/30 backdrop-blur")
          }
        >
          {msg.content ? (
            <Markdown content={msg.content} invert={isUser} />
          ) : streaming ? (
            <TypingDots />
          ) : null}
          {streaming && msg.content && (
            <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-[3px] animate-pulse bg-indigo-300" />
          )}
          {!streaming && msg.content && !isUser && <CopyButton text={msg.content} />}
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-300 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-purple-300 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-pink-300" />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="absolute -bottom-3 right-3 hidden items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[11px] text-slate-300 backdrop-blur transition hover:text-white group-hover:flex"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function Markdown({ content, invert }: { content: string; invert: boolean }) {
  // 用 useMemo 稳定 plugins，避免每次渲染重建
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const rehypePlugins = useMemo(() => [rehypeHighlight], []);

  return (
    <div className={`xy-md ${invert ? "xy-md-invert" : ""}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          a: (props) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2"
            />
          ),
          code({ className, children, ...rest }) {
            const match = /language-(\w+)/.exec(className || "");
            const isBlock = Boolean(match) || String(children).includes("\n");
            if (!isBlock) {
              return (
                <code
                  {...rest}
                  className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.85em] text-pink-200"
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1117] p-4 text-[13px] leading-6">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-white/10 bg-white/5 px-3 py-1.5 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-white/10 px-3 py-1.5 align-top">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
