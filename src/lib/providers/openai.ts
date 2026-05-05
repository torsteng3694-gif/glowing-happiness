import type { ChatOptions, ChatChunk } from "./types";

export async function* openAIChat(opts: ChatOptions, apiKey: string, baseUrl?: string): AsyncGenerator<ChatChunk> {
  const url = (baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text.slice(0, 300)}`);
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
      if (data === "[DONE]") { yield { delta: "", done: true, inputTokens, outputTokens }; return; }
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens || inputTokens;
          outputTokens = json.usage.completion_tokens || outputTokens;
        }
        if (delta) yield { delta, done: false };
      } catch { /* ignore parse error */ }
    }
  }
  yield { delta: "", done: true, inputTokens, outputTokens };
}
