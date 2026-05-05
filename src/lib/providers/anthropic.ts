import type { ChatOptions, ChatChunk } from "./types";

export async function* anthropicChat(opts: ChatOptions, apiKey: string, baseUrl?: string): AsyncGenerator<ChatChunk> {
  const url = (baseUrl || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages";
  const sys = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const msgs = opts.messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      system: sys || undefined,
      messages: msgs,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`Anthropic error: ${res.status} ${text.slice(0, 300)}`);
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
        if (json.type === "content_block_delta" && json.delta?.text) {
          yield { delta: json.delta.text, done: false };
        } else if (json.type === "message_delta" && json.usage) {
          outputTokens = json.usage.output_tokens || outputTokens;
        } else if (json.type === "message_start" && json.message?.usage) {
          inputTokens = json.message.usage.input_tokens || inputTokens;
        }
      } catch { /* ignore */ }
    }
  }
  yield { delta: "", done: true, inputTokens, outputTokens };
}
