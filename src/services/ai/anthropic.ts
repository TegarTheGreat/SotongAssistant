import Anthropic from "@anthropic-ai/sdk";
import type { AiRequest } from "./index.js";

const clients = new Map<string, Anthropic>();

function client(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey });
    clients.set(apiKey, c);
  }
  return c;
}

export async function streamAnthropic(
  req: AiRequest,
  apiKey: string,
  onDelta: (full: string) => void,
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...req.history.map((m): Anthropic.MessageParam => ({
      role: m.role,
      content: m.name ? `${m.name}: ${m.text}` : m.text,
    })),
    { role: "user", content: req.userName ? `${req.userName}: ${req.userText}` : req.userText },
  ];

  // Balasan Telegram dibatasi 4096 karakter per pesan — output pendek memang disengaja.
  const stream = client(apiKey).messages.stream({
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    system: req.system,
    messages,
  });

  let full = "";
  stream.on("text", (delta) => {
    full += delta;
    onDelta(full);
  });

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("Model menolak menjawab permintaan ini.");
  }
  return full;
}
