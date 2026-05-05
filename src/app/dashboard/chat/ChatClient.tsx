"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Select, Textarea, Badge, Spinner } from "@/components/ui";
import { Send, Trash2, User, Bot, UserRound, X } from "lucide-react";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import PersonaModal, { type Persona } from "@/components/chat/PersonaModal";

type ChannelOpt = {
  id: string;
  name: string;
  tier: string;
  sellInputPrice: number;
  sellOutputPrice: number;
};

type Model = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  logo: string;
  inputPrice: number;
  outputPrice: number;
  tags: string[];
  channels: ChannelOpt[];
};
type Msg = { role: "user" | "assistant"; content: string };
type WireMsg = { role: "user" | "assistant" | "system"; content: string };

export default function ChatClient({ models }: { models: Model[] }) {
  const [modelId, setModelId] = useState(models[0]?.id || "");
  const [channelId, setChannelId] = useState<string>(models[0]?.channels?.[0]?.id || "");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [personaOpen, setPersonaOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ai-hub:chat-persona");
      if (raw) setPersona(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function handlePickPersona(p: Persona | null) {
    setPersona(p);
    try {
      if (p) localStorage.setItem("ai-hub:chat-persona", JSON.stringify(p));
      else localStorage.removeItem("ai-hub:chat-persona");
    } catch { /* ignore */ }
  }

  const currentModel = models.find((m) => m.id === modelId);
  const currentChannel = currentModel?.channels.find((c) => c.id === channelId) || currentModel?.channels[0];

  function onModelChange(id: string) {
    setModelId(id);
    const m = models.find((x) => x.id === id);
    setChannelId(m?.channels?.[0]?.id || "");
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    if (!input.trim() || !modelId || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    // 占位 assistant 气泡
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const payloadMessages: WireMsg[] = persona?.systemPrompt
        ? [{ role: "system", content: persona.systemPrompt }, ...next]
        : next;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          channelId: channelId || undefined,
          messages: payloadMessages,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: "请求失败" }));
        setMessages((m) => {
          const n = [...m];
          n[n.length - 1] = { role: "assistant", content: `❌ ${j.error || "请求失败"}` };
          return n;
        });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const n = [...m];
          n[n.length - 1] = { role: "assistant", content: acc };
          return n;
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setMessages([]);
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row">
      {/* Sidebar: model */}
      <div className="md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs text-slate-500 mb-2">当前模型</div>
          <Select value={modelId} onChange={(e) => onModelChange(e.target.value)} className="w-full">
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.logo} {m.name} · {m.provider}</option>
            ))}
          </Select>
          {currentModel && currentModel.channels.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-1">渠道档位</div>
              <Select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full">
                {currentModel.channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · ¥{c.sellInputPrice}/{c.sellOutputPrice}</option>
                ))}
              </Select>
            </div>
          )}
          {currentModel && (
            <div className="mt-3 text-xs text-slate-500">
              <div>输入：¥ {currentChannel?.sellInputPrice ?? currentModel.inputPrice} / 1K tokens</div>
              <div>输出：¥ {currentChannel?.sellOutputPrice ?? currentModel.outputPrice} / 1K tokens</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {currentModel.tags.map((t) => <Badge key={t} color="brand">{t}</Badge>)}
              </div>
            </div>
          )}
        </div>
        <div className="mt-auto space-y-2">
          <Button variant="outline" onClick={() => setPersonaOpen(true)} className="w-full justify-start">
            <UserRound className="w-4 h-4" />
            <span className="flex-1 text-left truncate">
              {persona ? `角色：${persona.name}` : "选择 AI 角色"}
            </span>
          </Button>
          <Button variant="outline" onClick={clear} className="w-full">
            <Trash2 className="w-4 h-4" /> 清空对话
          </Button>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {persona && (
          <div className="px-4 md:px-8 py-2 border-b border-slate-200 bg-sky-50/60 flex items-center gap-2 text-xs text-sky-800">
            <span className="text-base leading-none">{persona.avatar || "🤖"}</span>
            <span className="font-medium">当前角色：{persona.name}</span>
            {persona.description && (
              <span className="text-sky-700/80 hidden sm:inline truncate">· {persona.description}</span>
            )}
            <button
              type="button"
              onClick={() => handlePickPersona(null)}
              className="ml-auto p-1 rounded hover:bg-sky-100 text-sky-700"
              title="清除角色"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto mt-10">
              <h2 className="text-2xl font-bold text-center">你好，我能帮你做什么？</h2>
              <p className="text-center text-slate-500 mt-2 text-sm">选择左侧模型，开始你的创作</p>
              <div className="mt-8 grid sm:grid-cols-2 gap-3">
                {[
                  "用 300 字介绍什么是 AI Hub 聚合平台",
                  "帮我写一段 Python 代码，读取 CSV 并统计词频",
                  "给一个做 SaaS 的创业公司起 5 个名字",
                  "把这段中文翻译成地道英文：...",
                ].map((p) => (
                  <button key={p} onClick={() => setInput(p)} className="text-left text-sm p-3 rounded-xl bg-white border border-slate-200 hover:border-brand-300 hover:bg-brand-50/40">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                  {m.role === "assistant" && (
                    <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 text-white flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-7 ${
                    m.role === "user"
                      ? "bg-brand-600 text-white whitespace-pre-wrap"
                      : "bg-white border border-slate-200"
                  }`}>
                    {m.role === "assistant" ? (
                      m.content ? (
                        <MarkdownMessage content={m.content} />
                      ) : loading && i === messages.length - 1 ? (
                        <Spinner />
                      ) : null
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="w-8 h-8 shrink-0 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="输入你的问题（Enter 发送，Shift+Enter 换行）"
              className="flex-1 min-h-[52px] max-h-[200px]"
            />
            <Button onClick={send} disabled={loading || !input.trim()} size="lg">
              {loading ? <Spinner /> : <Send className="w-4 h-4" />}
              发送
            </Button>
          </div>
        </div>
      </div>

      <PersonaModal
        open={personaOpen}
        selectedId={persona?.id ?? null}
        onClose={() => setPersonaOpen(false)}
        onSelect={handlePickPersona}
      />
    </div>
  );
}
