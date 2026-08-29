import { getProviderKey, type MemoryMessage } from "../../db/repo.js";
import type { CatalogProvider } from "../catalog.js";
import { streamAnthropic } from "./anthropic.js";
import { streamOpenAiCompat } from "./openaiCompat.js";

export interface AiRequest {
  provider: CatalogProvider;
  model: string;
  system: string;
  history: MemoryMessage[];
  userText: string;
  userName?: string;
  maxTokens?: number;
  /** Images attached to the user message (multimodal models only). */
  images?: Array<{ mediaType: string; dataBase64: string }>;
  /** Abort generation early (e.g. Telegram's native "stop generating" button). */
  signal?: AbortSignal;
}

/** Error carrying a machine-readable code so callers can localize the message. */
export class AiError extends Error {
  constructor(
    public code: "no_key" | "unsupported_provider" | "refused" | "provider_error",
    message: string,
  ) {
    super(message);
  }
}

/** Base URLs for major providers whose models.dev entry has no `api` field. */
const KNOWN_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com",
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
  togetherai: "https://api.together.xyz/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
};

export function resolveApiKey(provider: CatalogProvider): string | undefined {
  const fromDb = getProviderKey(provider.id);
  if (fromDb) return fromDb;
  for (const envName of provider.env ?? []) {
    const v = process.env[envName];
    if (v) return v;
  }
  return undefined;
}

/**
 * Streaming completion. `onDelta` receives the accumulated text on every chunk;
 * resolves with the full text when generation finishes.
 */
export async function streamCompletion(req: AiRequest, onDelta: (full: string) => void): Promise<string> {
  const apiKey = resolveApiKey(req.provider);
  if (!apiKey) throw new AiError("no_key", `missing API key for ${req.provider.id}`);

  if (req.provider.npm === "@ai-sdk/anthropic") {
    return streamAnthropic(req, apiKey, onDelta);
  }

  const baseUrl = req.provider.api ?? KNOWN_BASE_URLS[req.provider.id];
  if (!baseUrl) {
    throw new AiError(
      "unsupported_provider",
      `provider "${req.provider.id}" has no known OpenAI-compatible endpoint`,
    );
  }
  return streamOpenAiCompat(req, apiKey, baseUrl, onDelta);
}
