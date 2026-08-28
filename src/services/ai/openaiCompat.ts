import type { AiRequest } from "./index.js";

/**
 * Adapter untuk semua provider ber-endpoint OpenAI-compatible
 * (POST {base}/chat/completions, SSE stream).
 */
export async function streamOpenAiCompat(
  req: AiRequest,
  apiKey: string,
  baseUrl: string,
  onDelta: (full: string) => void,
): Promise<string> {
  const messages = [
    { role: "system", content: req.system },
    ...req.history.map((m) => ({
      role: m.role,
      content: m.name ? `${m.name}: ${m.text}` : m.text,
    })),
    {
      role: "user",
      content: req.userName ? `${req.userName}: ${req.userText}` : req.userText,
    },
  ];

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      stream: true,
      messages,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Provider ${req.provider.id} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  let full = "";
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : undefined;
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(full);
        }
      } catch {
        /* baris SSE non-JSON — abaikan */
      }
    }
  }
  return full;
}
