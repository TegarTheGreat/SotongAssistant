import type { Api } from "grammy";
import { config } from "./../config.js";
import { getCatalog } from "./catalog.js";
import { resolveApiKey } from "./ai/index.js";

/**
 * Voice transcription via the OpenAI-compatible /audio/transcriptions endpoint
 * (Whisper). Anthropic has no audio API, so this needs an OpenAI key — set it
 * with /setkey openai … or OPENAI_API_KEY. Returns undefined when no key is
 * available or anything fails, so callers degrade gracefully.
 */

const MAX_AUDIO_BYTES = 15_000_000;

export async function transcribeTelegramAudio(api: Api, fileId: string): Promise<string | undefined> {
  const provider = (await getCatalog())["openai"];
  const apiKey = provider ? resolveApiKey(provider) : undefined;
  if (!apiKey) return undefined;
  try {
    const file = await api.getFile(fileId);
    if (!file.file_path || (file.file_size ?? 0) > MAX_AUDIO_BYTES) return undefined;
    const audio = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!audio.ok) return undefined;
    const name = file.file_path.split("/").pop() ?? "voice.ogg";
    const form = new FormData();
    form.append("file", new Blob([await audio.arrayBuffer()]), name);
    form.append("model", "whisper-1");
    const base = (provider!.api ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { text?: string };
    return json.text?.trim() || undefined;
  } catch {
    return undefined;
  }
}
