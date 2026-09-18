import type { Api } from "grammy";
import { config } from "./../config.js";
import { getSettings } from "../db/repo.js";
import { getCatalog } from "./catalog.js";
import { streamCompletion } from "./ai/index.js";

/**
 * NSFW screening for group media, powered by the chat's own (multimodal) AI
 * model. Deliberately FAIL-OPEN: any error — no key, text-only model,
 * download failure — yields "unknown" and the message stays. Verdicts are
 * cached by Telegram's file_unique_id so a re-forwarded image costs nothing.
 */

export type NsfwVerdict = "nsfw" | "safe" | "unknown";

const cache = new Map<string, NsfwVerdict>();
const CACHE_CAP = 2000;
const MAX_BYTES = 1_000_000; // thumbnails only — never download full media

function mediaTypeOf(filePath: string): string {
  if (/\.png$/i.test(filePath)) return "image/png";
  if (/\.webp$/i.test(filePath)) return "image/webp";
  if (/\.gif$/i.test(filePath)) return "image/gif";
  return "image/jpeg";
}

/** Download a Telegram file (by file_id) and classify it. */
export async function classifyTelegramImage(
  api: Api,
  chatId: number,
  fileId: string,
  fileUniqueId: string,
): Promise<NsfwVerdict> {
  const hit = cache.get(fileUniqueId);
  if (hit) return hit;

  let verdict: NsfwVerdict = "unknown";
  try {
    const file = await api.getFile(fileId);
    if (!file.file_path || (file.file_size ?? 0) > MAX_BYTES) return "unknown";
    const res = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return "unknown";
    const dataBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");

    const settings = getSettings(chatId);
    const provider = (await getCatalog())[settings.aiProvider ?? config.defaultProvider];
    if (!provider) return "unknown";
    const answer = await streamCompletion(
      {
        provider,
        model: settings.aiModel ?? config.defaultModel,
        system:
          "You are a strict content-safety classifier for a public chat group. " +
          "Look at the image and answer with exactly one word. " +
          "NSFW = nudity, sexual content, pornography, or graphic gore. " +
          "SAFE = everything else, including swimwear, art, medical or news imagery.",
        history: [],
        userText: "Classify this image. Answer only NSFW or SAFE.",
        images: [{ mediaType: mediaTypeOf(file.file_path), dataBase64 }],
        maxTokens: 8,
      },
      () => undefined,
    );
    const word = answer.trim().toUpperCase();
    verdict = word.startsWith("NSFW") ? "nsfw" : word.startsWith("SAFE") ? "safe" : "unknown";
  } catch {
    verdict = "unknown"; // fail-open by design
  }

  if (cache.size >= CACHE_CAP) cache.clear();
  if (verdict !== "unknown") cache.set(fileUniqueId, verdict);
  return verdict;
}
