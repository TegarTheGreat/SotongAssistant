import { getProviderKey, type MemoryMessage } from "../../db/index.js";
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
}

/** Base URL untuk provider besar yang TOML-nya tidak mencantumkan field `api`. */
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
 * Streaming completion. onDelta dipanggil per potongan teks;
 * mengembalikan teks lengkap saat selesai.
 */
export async function streamCompletion(req: AiRequest, onDelta: (full: string) => void): Promise<string> {
  const apiKey = resolveApiKey(req.provider);
  if (!apiKey) {
    throw new Error(
      `API key untuk provider "${req.provider.id}" belum disetel. ` +
        `Owner bot: kirim /setkey ${req.provider.id} <api-key> lewat DM ke bot.`,
    );
  }

  if (req.provider.npm === "@ai-sdk/anthropic") {
    return streamAnthropic(req, apiKey, onDelta);
  }

  const baseUrl = req.provider.api ?? KNOWN_BASE_URLS[req.provider.id];
  if (!baseUrl) {
    throw new Error(
      `Provider "${req.provider.id}" belum didukung adapter bot ini ` +
        `(tidak ada endpoint OpenAI-compatible yang diketahui).`,
    );
  }
  return streamOpenAiCompat(req, apiKey, baseUrl, onDelta);
}
