import { AiError, type AiRequest, type TokenUsage } from "./index.js";

/**
 * Adapter for every provider exposing an OpenAI-compatible endpoint
 * (POST {base}/chat/completions with SSE streaming).
 */
export async function streamOpenAiCompat(
  req: AiRequest,
  apiKey: string,
  baseUrl: string,
  onDelta: (full: string) => void,
): Promise<string> {
  const finalText = req.userName ? `${req.userName}: ${req.userText}` : req.userText;
  // Multimodal: the OpenAI-compatible shape uses content parts with data URIs.
  const finalContent: unknown = req.images?.length
    ? [
        ...req.images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` },
        })),
        { type: "text", text: finalText },
      ]
    : finalText;
  const messages = [
    { role: "system", content: req.system },
    ...req.history.map((m) => ({
      role: m.role,
      content: m.name ? `${m.name}: ${m.text}` : m.text,
    })),
    { role: "user", content: finalContent },
  ];

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const limit = req.maxTokens ?? 4096;

  const signal = req.signal
    ? AbortSignal.any([AbortSignal.timeout(120_000), req.signal])
    : AbortSignal.timeout(120_000);
  // stream_options asks OpenAI-compatible servers for a final usage chunk. Not
  // every implementation accepts the field, so a 400 naming it retries without.
  const doFetch = (tokenParam: "max_tokens" | "max_completion_tokens", withUsage: boolean) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: req.model,
        [tokenParam]: limit,
        stream: true,
        ...(withUsage ? { stream_options: { include_usage: true } } : {}),
        messages,
      }),
      signal,
    });

  let tokenParam: "max_tokens" | "max_completion_tokens" = "max_tokens";
  let res = await doFetch(tokenParam, true);
  if (!res.ok) {
    let body = await res.text().catch(() => "");
    // OpenAI reasoning models reject max_tokens and require max_completion_tokens.
    if (res.status === 400 && body.includes("max_completion_tokens")) {
      tokenParam = "max_completion_tokens";
      res = await doFetch(tokenParam, true);
      if (!res.ok) body = await res.text().catch(() => body);
    }
    if (!res.ok && res.status === 400 && body.includes("stream_options")) {
      res = await doFetch(tokenParam, false);
      if (!res.ok) body = await res.text().catch(() => body);
    }
    if (!res.ok) {
      throw new AiError("provider_error", `${req.provider.id} HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
  }
  if (!res.body) throw new AiError("provider_error", `${req.provider.id}: empty response body`);

  let full = "";
  let buffer = "";
  let usage: TokenUsage | undefined;
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
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(full);
        }
        // The usage chunk arrives last and carries no choices.
        if (json.usage) {
          usage = {
            inputTokens: json.usage.prompt_tokens ?? 0,
            outputTokens: json.usage.completion_tokens ?? 0,
          };
        }
      } catch {
        /* non-JSON SSE line — ignore */
      }
    }
  }
  if (usage) req.onUsage?.(usage);
  return full;
}
