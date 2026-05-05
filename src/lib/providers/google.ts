import type { ChatOptions, ChatChunk } from "./types";

export async function* googleChat(opts: ChatOptions, apiKey: string, baseUrl?: string): AsyncGenerator<ChatChunk> {
  const base = baseUrl || process.env.GOOGLE_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  const url = `${base}/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const contents = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const sys = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
      },
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`Google error: ${res.status} ${text.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let inputTokens = 0, outputTokens = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const data = l.slice(5).trim();
      try {
        const json = JSON.parse(data);
        const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
        if (json.usageMetadata) {
          inputTokens = json.usageMetadata.promptTokenCount || inputTokens;
          outputTokens = json.usageMetadata.candidatesTokenCount || outputTokens;
        }
        if (text) yield { delta: text, done: false };
      } catch { /* ignore */ }
    }
  }
  yield { delta: "", done: true, inputTokens, outputTokens };
}
