import Anthropic from "@anthropic-ai/sdk";
import { AiError, type AiRequest } from "./index.js";

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

  // Telegram replies are capped at 4096 chars per message — short output is intentional.
  const stream = client(apiKey).messages.stream(
    {
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages,
    },
    { signal: req.signal },
  );

  let full = "";
  stream.on("text", (delta) => {
    full += delta;
    onDelta(full);
  });

  try {
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      throw new AiError("refused", "the model declined this request");
    }
    return full;
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError("provider_error", (err as Error).message);
  }
}
